// ==UserScript==
// @name         loveq 音频爬虫
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  抓取 loveq.cn 的音频节目
// @author       Converted from Python by @木凡的天空
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

// ========== 配置 ==========
const BASE_URL = "https://www.loveq.cn";
const DEFAULT_PIC = "https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg";
const DEXIAN_PIC = "https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg";
const FILTER_CATEGORIES = ["盛世乾坤", "一些事一些情", "一些事一些情精华剪辑"];

// ========== HTTP 请求封装 ==========
function request(url, options = {}) {
    return new Promise((resolve, reject) => {
        const method = options.method || 'GET';
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": BASE_URL + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Connection": "keep-alive",
            ...options.headers
        };

        GM_xmlhttpRequest({
            method: method,
            url: url,
            headers: headers,
            data: options.body,
            timeout: 15000,
            onload: function(response) {
                if (response.status === 200) {
                    resolve(response.responseText);
                } else {
                    console.log(`请求失败，状态码: ${response.status}, URL: ${url}`);
                    reject(new Error(`HTTP ${response.status}`));
                }
            },
            onerror: function(error) {
                console.log(`请求异常: ${error}, URL: ${url}`);
                reject(error);
            },
            ontimeout: function() {
                console.log(`请求超时: ${url}`);
                reject(new Error('Timeout'));
            }
        });
    });
}

function get(url, params = null) {
    let finalUrl = url;
    if (params) {
        const queryString = Object.entries(params)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        finalUrl = url + (url.includes('?') ? '&' : '?') + queryString;
    }
    return request(finalUrl);
}

// ========== 工具函数 ==========
function parseHtml(html) {
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
}

function extractNumberFromText(text) {
    const match = text.match(/\d+/);
    return match ? parseInt(match[0]) : 1;
}

function formatDateToChinese(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ========== 首页分类 ==========
async function homeContent(filter = false) {
    const html = await get(`${BASE_URL}/program.html`);
    if (!html) return { class: [] };

    const doc = parseHtml(html);
    const categories = [];
    const seen = new Set();

    // 查找所有分类链接
    const links = doc.querySelectorAll('a[href]');
    for (const a of links) {
        const href = a.getAttribute('href');
        const title = a.textContent.trim();

        // 匹配分类URL格式: program-cat{id}-p1.html
        const catMatch = href.match(/program-cat(\d+)-p\d+\.html/);
        if (catMatch && title && !FILTER_CATEGORIES.includes(title)) {
            const catId = catMatch[1];
            if (catId !== "0" && !seen.has(catId)) {
                seen.add(catId);
                categories.push({
                    type_name: title,
                    type_id: catId
                });
            }
        }
    }

    // 按ID排序
    categories.sort((a, b) => parseInt(a.type_id) - parseInt(b.type_id));

    // 添加筛选器
    const currentYear = new Date().getFullYear();
    const years = [{ n: "全部年份", v: "" }];
    for (let y = currentYear; y > 2002; y--) {
        years.push({ n: String(y), v: String(y) });
    }

    const months = [{ n: "全部月份", v: "" }];
    for (let m = 1; m <= 12; m++) {
        months.push({ n: `${m}月`, v: String(m) });
    }

    const filters = {};
    for (const cat of categories) {
        filters[cat.type_id] = [
            { key: "year", name: "年份", value: years },
            { key: "month", name: "月份", value: months }
        ];
    }

    return { class: categories, filters: filters };
}

// ========== 分类内容 ==========
async function categoryContent(tid, pg, filter = false, extend = {}) {
    const pgInt = parseInt(pg);
    const params = { cat_id: tid, page: pg };

    if (extend.year) params.year = extend.year;
    if (extend.month) params.month = extend.month;

    const html = await get(`${BASE_URL}/program.html`, params);
    if (!html) {
        return { list: [], page: pgInt, pagecount: 0, limit: 30, total: 0 };
    }

    const doc = parseHtml(html);
    const videos = [];

    // 查找节目列表
    const programLinks = doc.querySelectorAll('a[href*="program_download"]');
    for (const a of programLinks) {
        const href = a.getAttribute('href');
        let title = a.textContent.trim();

        if (!title || title.length < 2) continue;

        const vidMatch = href.match(/program_download-?(\d+)\.html/);
        if (vidMatch) {
            const vid = vidMatch[1];
            let pic = DEFAULT_PIC;

            const imgTag = a.querySelector('img');
            if (imgTag && imgTag.src) {
                let imgSrc = imgTag.src;
                if (imgSrc.startsWith('http')) {
                    pic = imgSrc;
                } else {
                    pic = new URL(imgSrc, BASE_URL).href;
                }
            }

            // 获取备注信息
            let remark = "";
            const parent = a.closest('li') || a.closest('div[class*="item"], div[class*="entry"]');
            if (parent) {
                const dateSpan = parent.querySelector('span[class*="date"], span[class*="time"]');
                if (dateSpan) {
                    remark = dateSpan.textContent.trim();
                }
            }

            videos.push({
                vod_id: vid,
                vod_name: title,
                vod_pic: pic,
                vod_remarks: remark
            });
        }
    }

    // 计算分页
    let pageCount = 1;
    const pagination = doc.querySelector('div[class*="page"], div[class*="pagination"]');
    if (pagination) {
        const pageLinks = pagination.querySelectorAll('a');
        if (pageLinks.length > 0) {
            const lastPage = pageLinks.length >= 2 ? pageLinks[pageLinks.length - 2] : pageLinks[pageLinks.length - 1];
            const pageText = lastPage.textContent.trim();
            if (/^\d+$/.test(pageText)) {
                pageCount = parseInt(pageText);
            } else {
                for (const link of pageLinks) {
                    const href = link.getAttribute('href');
                    const pageMatch = href.match(/[?&]page=(\d+)/);
                    if (pageMatch) {
                        const pgNum = parseInt(pageMatch[1]);
                        if (pgNum > pageCount) pageCount = pgNum;
                    }
                }
            }
        }
    }

    if (pageCount <= pgInt && videos.length > 0) {
        pageCount = pgInt + 1;
    }

    return {
        list: videos,
        page: pgInt,
        pagecount: pageCount,
        limit: 30,
        total: videos.length
    };
}

// ========== 首页视频内容 ==========
async function homeVideoContent() {
    return await categoryContent("1", "1", false, {});
}

// ========== 搜索 ==========
async function searchContent(key, quick, pg = "1") {
    const encodedKey = encodeURIComponent(key);
    const searchUrls = [
        `${BASE_URL}/so-${pg}-${encodedKey}.html`,
        `${BASE_URL}/so.html?wd=${encodedKey}&page=${pg}`,
        `${BASE_URL}/search.php?keyword=${encodedKey}&page=${pg}`
    ];

    let html = "";
    for (const url of searchUrls) {
        try {
            html = await get(url);
            if (html) break;
        } catch (e) {
            continue;
        }
    }

    if (!html) return { list: [] };

    const doc = parseHtml(html);
    const results = [];
    const seenIds = new Set();

    const programLinks = doc.querySelectorAll('a[href*="program_download"]');
    for (const a of programLinks) {
        const href = a.getAttribute('href');
        let title = a.textContent.trim();

        if (!title || title.length < 2) continue;

        const vidMatch = href.match(/program_download-?(\d+)\.html/);
        if (vidMatch) {
            const vid = vidMatch[1];
            if ((key.toLowerCase().includes(title.toLowerCase()) || title.includes(key)) && !seenIds.has(vid)) {
                seenIds.add(vid);
                results.push({
                    vod_id: vid,
                    vod_name: title,
                    vod_pic: DEFAULT_PIC,
                    vod_remarks: "搜索结果"
                });
            }
        }
    }

    return { list: results };
}

// ========== 节目详情 ==========
async function detailContent(ids) {
    const vid = ids[0];
    const url = `${BASE_URL}/program_download-${vid}.html`;
    const html = await get(url);

    if (!html) return { list: [] };

    const doc = parseHtml(html);

    // 提取原标题
    let originalTitle = "";
    const titleTag = doc.querySelector('title');
    if (titleTag) {
        originalTitle = titleTag.textContent.trim();
        originalTitle = originalTitle.replace(/[-|]\s*LoveQ.*$/, "").trim();
    }
    if (!originalTitle) originalTitle = `节目${vid}`;

    // 提取发布日期和内容
    let pubDate = "";
    let content = "";

    const pdl1List = doc.querySelector('ul.pdl1');
    if (pdl1List) {
        const lis = pdl1List.querySelectorAll('li');
        for (const li of lis) {
            const liText = li.textContent.trim();

            if (liText.includes("发布日期：") || liText.includes("发布时间：")) {
                const dateMatch = liText.match(/(\d{4}[-\/]\d{2}[-\/]\d{2})/);
                if (dateMatch) {
                    pubDate = dateMatch[1];
                } else {
                    pubDate = liText.replace(/^(发布日期|发布时间)[：:]/, "").trim();
                }
            } else if (liText.includes("节目内容：") || liText.includes("内容简介：")) {
                content = liText.replace(/^(节目内容|内容简介)[：:]/, "").trim();
            }
        }
    }

    if (!content) {
        const metaDesc = doc.querySelector('meta[name="description"]');
        if (metaDesc && metaDesc.getAttribute('content')) {
            content = metaDesc.getAttribute('content');
        }
    }

    if (!content) {
        const contentDiv = doc.querySelector('div[class*="content"], div[class*="intro"], div[class*="desc"]');
        if (contentDiv) {
            content = contentDiv.textContent.trim().slice(0, 500);
        }
    }

    if (content && /^\d{4}[-\/]\d{2}[-\/]\d{2}\s*$/.test(content)) {
        content = "暂无节目简介";
    } else if (!content) {
        content = "暂无节目简介";
    }

    // 新标题格式：发布日期 + 节目内容
    let newTitle;
    if (pubDate) {
        const formattedDate = pubDate.replace(/\//g, "-");
        const contentPreview = content.length > 50 ? content.slice(0, 50) : content;
        newTitle = `${formattedDate} - ${contentPreview}`;
    } else {
        newTitle = originalTitle;
    }

    const desc = pubDate ? `📅 发布日期：${pubDate}\n📝 ${content}` : content;

    // 提取音频链接
    const audioLinks = new Set();

    // 匹配完整格式的音频链接
    const pattern = /https?:\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi;
    const matches = html.match(pattern) || [];
    for (const match of matches) {
        audioLinks.add(match);
    }

    // 匹配协议相对路径
    const patternRel = /\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi;
    const matchesRel = html.match(patternRel) || [];
    for (const match of matchesRel) {
        audioLinks.add("https:" + match);
    }

    // 从audio/source标签提取
    const audioTags = doc.querySelectorAll('audio, source');
    for (const tag of audioTags) {
        let src = tag.getAttribute('src');
        if (src && src.includes('dl2.loveq.cn')) {
            if (/\.mp3\?/.test(src) && src.includes('sign=') && src.includes('timestamp=')) {
                if (src.startsWith('//')) src = 'https:' + src;
                audioLinks.add(src);
            }
        }
    }

    // 构建播放URL
    let playUrl;
    const validLinks = Array.from(audioLinks);
    if (validLinks.length > 0) {
        if (validLinks.length > 1) {
            playUrl = validLinks.map(link => `LoveQ音频$${link}`).join("$$$");
        } else {
            playUrl = `LoveQ音频$${validLinks[0]}`;
        }
    } else {
        playUrl = "暂无音频";
    }

    // 判断是否为得闲小叙
    let vodPic = DEFAULT_PIC;
    if (originalTitle.includes("得闲小叙") || originalTitle.includes("得闲")) {
        vodPic = DEXIAN_PIC;
    } else {
        const imgTag = doc.querySelector('img[class*="cover"], img[class*="poster"], img[class*="pic"]');
        if (imgTag && imgTag.src) {
            let imgSrc = imgTag.src;
            if (imgSrc.startsWith('http')) {
                vodPic = imgSrc;
            } else {
                vodPic = new URL(imgSrc, BASE_URL).href;
            }
        }
    }

    return {
        list: [{
            vod_id: vid,
            vod_name: newTitle,
            vod_pic: vodPic,
            vod_content: desc,
            vod_play_from: "木凡的天空",
            vod_play_url: playUrl
        }]
    };
}

// ========== 播放器 ==========
function playerContent(flag, id, vipFlags) {
    let audioUrl = id;

    if (id.includes("$$$")) {
        const firstTrack = id.split("$$$")[0];
        if (firstTrack.includes("$")) {
            audioUrl = firstTrack.split("$", 2)[1];
        }
    } else if (id.includes("$")) {
        audioUrl = id.split("$", 2)[1];
    }

    const playHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": BASE_URL + "/",
        "Origin": BASE_URL,
        "Accept": "audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*/*;q=0.5",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Range": "bytes=0-",
        "Connection": "keep-alive"
    };

    return {
        parse: 0,
        playUrl: "",
        url: audioUrl,
        header: playHeaders
    };
}

function isVideoFormat(url) {
    const audioExtensions = [".mp3", ".m4a", ".wav", ".wma", ".ogg", ".aac", ".flac"];
    return audioExtensions.some(ext => url.toLowerCase().includes(ext));
}

// ========== 导出模块 ==========
const loveqSpider = {
    platform: "loveq",
    author: "木凡的天空",
    version: "1.0.0",
    srcUrl: "https://www.loveq.cn",
    cacheControl: "max-age=3600",
    hints: {
        importMusicSheet: [],
        importMusicItem: []
    },
    supportedSearchType: ["music", "album", "artist", "sheet"],
    
    // 主要方法
    homeContent,
    homeVideoContent,
    categoryContent,
    searchContent,
    detailContent,
    playerContent,
    isVideoFormat,
    
    // 初始化方法
    init: function(extend = "") {
        console.log("LoveQ 爬虫已初始化");
    },
    destroy: function() {
        console.log("LoveQ 爬虫已销毁");
    }
};

// 导出到全局
if (typeof module !== 'undefined' && module.exports) {
    module.exports = loveqSpider;
} else {
    globalThis.loveqSpider = loveqSpider;
}