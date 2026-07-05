// by @木凡的天空
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let appConfig = {
    ver: 20260705,
    title: 'LoveQ',
    site: 'https://www.loveq.cn',
    default_pic: 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg',
    dexian_pic: 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg',
    filter_categories: ['盛世乾坤', '一些事一些情', '一些事一些情精华剪辑'],
    tabs: [],
};

// 缓存session headers
const headers = {
    'User-Agent': UA,
    'Referer': appConfig.site + '/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
};

// ========== 通用请求方法 ==========
async function fetchHtml(url, params = null) {
    try {
        const response = await axios.get(url, {
            params: params,
            headers: headers,
            timeout: 15000,
            responseType: 'text',
        });
        return response.data;
    } catch (e) {
        console.log(`请求失败: ${e.message}, URL: ${url}`);
        return '';
    }
}

async function postData(url, data = null) {
    try {
        const response = await axios.post(url, data, {
            headers: headers,
            timeout: 15000,
            responseType: 'text',
        });
        return response.data;
    } catch (e) {
        console.log(`POST请求失败: ${e.message}`);
        return '';
    }
}

// ========== 首页分类 ==========
async function getConfig() {
    const html = await fetchHtml(appConfig.site + '/program.html');
    if (!html) {
        return jsonify({ class: [] });
    }

    const $ = cheerio.load(html);
    const categories = [];
    const seen = new Set();

    // 查找所有分类链接
    $('a[href]').each((i, elem) => {
        const href = $(elem).attr('href') || '';
        const title = $(elem).text().trim();

        // 匹配分类URL格式: program-cat{id}-p1.html
        const catMatch = href.match(/program-cat(\d+)-p\d+\.html/);
        if (catMatch && title && !appConfig.filter_categories.includes(title)) {
            const catId = catMatch[1];
            if (catId !== '0' && !seen.has(catId)) {
                seen.add(catId);
                categories.push({
                    type_name: title,
                    type_id: catId,
                });
            }
        }
    });

    // 按ID排序
    categories.sort((a, b) => parseInt(a.type_id) - parseInt(b.type_id));

    // 添加筛选器
    const currentYear = new Date().getFullYear();
    const years = [{ n: '全部年份', v: '' }];
    for (let y = currentYear; y > 2002; y--) {
        years.push({ n: String(y), v: String(y) });
    }

    const months = [{ n: '全部月份', v: '' }];
    for (let m = 1; m <= 12; m++) {
        months.push({ n: `${m}月`, v: String(m) });
    }

    const filters = {};
    for (const cat of categories) {
        filters[cat.type_id] = [
            { key: 'year', name: '年份', value: years },
            { key: 'month', name: '月份', value: months },
        ];
    }

    appConfig.tabs = categories;
    
    return jsonify({
        class: categories,
        filters: filters,
        ...appConfig,
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    let { id: tid = '1', page: pg = '1', year = '', month = '' } = ext;

    const params = {
        cat_id: tid,
        page: pg,
    };
    if (year) params.year = year;
    if (month) params.month = month;

    const html = await fetchHtml(appConfig.site + '/program.html', params);
    if (!html) {
        return jsonify({ list: [], page: parseInt(pg), pagecount: 0, limit: 30, total: 0 });
    }

    const $ = cheerio.load(html);
    const videos = [];

    // 查找节目列表
    $('a[href*="program_download"]').each((i, elem) => {
        const href = $(elem).attr('href') || '';
        const title = $(elem).text().trim();

        if (!title || title.length < 2) return;

        const vidMatch = href.match(/program_download-?(\d+)\.html/);
        if (vidMatch) {
            const vid = vidMatch[1];

            // 查找可能的图片
            let pic = appConfig.default_pic;
            const imgTag = $(elem).find('img');
            if (imgTag.length && imgTag.attr('src')) {
                let imgSrc = imgTag.attr('src');
                if (imgSrc.startsWith('http')) {
                    pic = imgSrc;
                } else {
                    pic = new URL(imgSrc, appConfig.site).href;
                }
            }

            // 获取备注信息（如日期）
            let remark = '';
            const parent = $(elem).closest('li');
            if (parent.length) {
                const dateSpan = parent.find('span[class*="date"], span[class*="time"]');
                if (dateSpan.length) {
                    remark = dateSpan.text().trim();
                }
            }

            videos.push({
                vod_id: vid,
                vod_name: title,
                vod_pic: pic,
                vod_remarks: remark,
            });
        }
    });

    // 计算分页
    let pageCount = 1;
    const pagination = $('div[class*="page"], div[class*="pagination"]');
    if (pagination.length) {
        const pageLinks = pagination.find('a');
        if (pageLinks.length) {
            const lastPage = pageLinks.length >= 2 ? pageLinks.eq(-2) : pageLinks.eq(-1);
            const pageText = lastPage.text().trim();
            if (/^\d+$/.test(pageText)) {
                pageCount = parseInt(pageText);
            } else {
                pageLinks.each((i, link) => {
                    const href = $(link).attr('href') || '';
                    const pageMatch = href.match(/[?&]page=(\d+)/);
                    if (pageMatch) {
                        const pgNum = parseInt(pageMatch[1]);
                        if (pgNum > pageCount) pageCount = pgNum;
                    }
                });
            }
        }
    }

    if (pageCount <= parseInt(pg) && videos.length > 0) {
        pageCount = parseInt(pg) + 1;
    }

    return jsonify({
        list: videos,
        page: parseInt(pg),
        pagecount: pageCount,
        limit: 30,
        total: videos.length,
    });
}

// ========== 搜索 ==========
async function search(ext) {
    ext = argsify(ext);
    const key = encodeURIComponent(ext.text);
    const pg = ext.page || '1';
    const videos = [];

    const searchUrls = [
        `${appConfig.site}/so-${pg}-${key}.html`,
        `${appConfig.site}/so.html?wd=${key}&page=${pg}`,
        `${appConfig.site}/search.php?keyword=${key}&page=${pg}`,
    ];

    let html = '';
    for (const url of searchUrls) {
        html = await fetchHtml(url);
        if (html) break;
    }

    if (!html) {
        return jsonify({ list: [] });
    }

    const $ = cheerio.load(html);
    const seenIds = new Set();

    $('a[href*="program_download"]').each((i, elem) => {
        const href = $(elem).attr('href') || '';
        const title = $(elem).text().trim();

        if (!title || title.length < 2) return;

        const vidMatch = href.match(/program_download-?(\d+)\.html/);
        if (vidMatch) {
            const vid = vidMatch[1];
            const searchText = ext.text.toLowerCase();
            if (title.toLowerCase().includes(searchText) || title.includes(ext.text)) {
                if (!seenIds.has(vid)) {
                    seenIds.add(vid);
                    videos.push({
                        vod_id: vid,
                        vod_name: title,
                        vod_pic: appConfig.default_pic,
                        vod_remarks: '搜索结果',
                    });
                }
            }
        }
    });

    return jsonify({ list: videos });
}

// ========== 节目详情（获取音轨） ==========
async function getTracks(ext) {
    ext = argsify(ext);
    const vid = ext.vod_id;
    const url = `${appConfig.site}/program_download-${vid}.html`;
    const html = await fetchHtml(url);

    if (!html) {
        return jsonify({ list: [] });
    }

    const $ = cheerio.load(html);

    // 提取原标题
    let originalTitle = '';
    const titleTag = $('title');
    if (titleTag.length) {
        originalTitle = titleTag.text().trim();
        originalTitle = originalTitle.replace(/[-|]\s*LoveQ.*$/, '').trim();
    }
    if (!originalTitle) {
        originalTitle = `节目${vid}`;
    }

    // 提取发布日期和内容
    let pubDate = '';
    let content = '';

    const pdl1List = $('ul.pdl1');
    if (pdl1List.length) {
        pdl1List.find('li').each((i, li) => {
            const liText = $(li).text().trim();
            if (liText.includes('发布日期：') || liText.includes('发布时间：')) {
                const dateMatch = liText.match(/(\d{4}[-/]\d{2}[-/]\d{2})/);
                if (dateMatch) {
                    pubDate = dateMatch[1];
                } else {
                    pubDate = liText.replace(/^(发布日期|发布时间)[：:]/, '').trim();
                }
            } else if (liText.includes('节目内容：') || liText.includes('内容简介：')) {
                content = liText.replace(/^(节目内容|内容简介)[：:]/, '').trim();
            }
        });
    }

    if (!content) {
        const metaDesc = $('meta[name="description"]');
        if (metaDesc.length && metaDesc.attr('content')) {
            content = metaDesc.attr('content');
        }
    }

    if (!content) {
        const contentDiv = $('div[class*="content"], div[class*="intro"], div[class*="desc"]');
        if (contentDiv.length) {
            content = contentDiv.text().trim().slice(0, 500);
        }
    }

    if (content && /^\d{4}[-/]\d{2}[-/]\d{2}\s*$/.test(content)) {
        content = '暂无节目简介';
    } else if (!content) {
        content = '暂无节目简介';
    }

    // 新标题格式：发布日期 + 节目内容
    let newTitle;
    if (pubDate) {
        const formattedDate = pubDate.replace(/\//g, '-');
        const contentPreview = content.length > 50 ? content.slice(0, 50) : content;
        newTitle = `${formattedDate} - ${contentPreview}`;
    } else {
        newTitle = originalTitle;
    }

    // 构建描述信息
    const desc = pubDate ? `📅 发布日期：${pubDate}\n📝 ${content}` : content;

    // 提取音频链接
    const audioLinks = [];
    const seenLinks = new Set();

    // 匹配完整格式的音频链接
    const pattern = /https?:\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi;
    let matches = html.match(pattern) || [];
    audioLinks.push(...matches);

    // 匹配协议相对路径
    const patternRel = /\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi;
    matches = html.match(patternRel) || [];
    audioLinks.push(...matches);

    // 从audio或source标签中提取
    $('audio[src], source[src]').each((i, elem) => {
        const src = $(elem).attr('src') || '';
        if (src.includes('dl2.loveq.cn') && /\.mp3\?/.test(src) && src.includes('sign=') && src.includes('timestamp=')) {
            audioLinks.push(src);
        }
    });

    // 去重并完善链接
    const validLinks = [];
    for (let link of audioLinks) {
        if (seenLinks.has(link)) continue;
        seenLinks.add(link);
        if (link.startsWith('//')) {
            link = 'https:' + link;
        }
        validLinks.push(link);
    }

    // 构建音轨列表
    const tracks = [];
    if (validLinks.length > 0) {
        validLinks.forEach((link, index) => {
            tracks.push({
                name: `音频 ${index + 1}`,
                pan: '',
                ext: {
                    url: link,
                },
            });
        });
    } else {
        tracks.push({
            name: '暂无音频',
            pan: '',
            ext: {
                url: '',
            },
        });
    }

    // 判断图片
    let vodPic = appConfig.default_pic;
    if (originalTitle.includes('得闲小叙') || originalTitle.includes('得闲')) {
        vodPic = appConfig.dexian_pic;
    } else {
        const imgTag = $('img[class*="cover"], img[class*="poster"], img[class*="pic"]');
        if (imgTag.length && imgTag.attr('src')) {
            let imgSrc = imgTag.attr('src');
            if (imgSrc.startsWith('http')) {
                vodPic = imgSrc;
            } else {
                vodPic = new URL(imgSrc, appConfig.site).href;
            }
        }
    }

    // 返回包含视频信息的结果，以便播放器使用
    return jsonify({
        list: [{
            vod_id: vid,
            vod_name: newTitle,
            vod_pic: vodPic,
            vod_content: desc,
            vod_play_from: '木凡的天空',
            vod_play_url: tracks.map(t => t.ext.url).join('$$$'),
        }],
    });
}

// ========== 播放器 ==========
async function getPlayinfo(ext) {
    ext = argsify(ext);
    let audioUrl = ext.url || '';
    
    // 处理多个音频链接
    if (audioUrl.includes('$$$')) {
        const tracks = audioUrl.split('$$$');
        // 默认取第一个
        audioUrl = tracks[0] || '';
    }

    const playHeaders = {
        'User-Agent': UA,
        'Referer': appConfig.site + '/',
        'Origin': appConfig.site,
        'Accept': 'audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*/*;q=0.5',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Range': 'bytes=0-',
        'Connection': 'keep-alive',
    };

    // 如果是音频文件，直接播放
    const audioExtensions = ['.mp3', '.m4a', '.wav', '.wma', '.ogg', '.aac', '.flac'];
    const isAudio = audioExtensions.some(ext => audioUrl.toLowerCase().includes(ext));

    if (isAudio && audioUrl) {
        return jsonify({
            urls: [audioUrl],
            headers: [playHeaders],
        });
    }

    return jsonify({
        urls: [],
        headers: [],
    });
}

// ========== 辅助函数 ==========
function jsonify(obj) {
    return obj;
}

function argsify(obj) {
    return obj || {};
}

// 导出函数
module.exports = {
    getConfig,
    getCards,
    getTracks,
    getPlayinfo,
    search,
};