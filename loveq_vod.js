const host = 'https://www.loveq.cn';
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': host + '/'
};

// 播放专用请求头
const playHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': host + '/',
    'Origin': host,
    'Accept': 'audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*/*;q=0.5',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Range': 'bytes=0-',
    'Connection': 'keep-alive'
};

// 默认图片
const defaultPic = 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg';
const dexianPic = 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg';

// 需要过滤的分类
const filterCategories = ['盛世乾坤', '一些事一些情', '一些事一些情精华剪辑'];

// ========== 工具函数 ==========

// 补全 URL
function fixUrl(path) {
    if (!path) return defaultPic;
    path = path.trim();
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (path.startsWith('//')) return 'https:' + path;
    if (path.startsWith('/')) return host + path;
    if (path.includes('dl2.loveq.cn')) return 'https://' + path;
    return host + '/' + path;
}

// 提取单个正则匹配组
function matchOne(str, regex, group = 1) {
    const m = str.match(regex);
    return m ? m[group].trim() : '';
}

// 清理标签，只留文本
function stripTags(str) {
    return str.replace(/<[^>]+>/g, '').trim();
}

// ========== 分类解析 ==========

function parseCategories(html) {
    const categories = [];
    const seen = new Set();
    
    const links = pdfa(html, 'a[href]');
    links.forEach(a => {
        const href = a.match(/href="([^"]+)"/)?.[1] || '';
        const title = stripTags(a);
        
        const catMatch = href.match(/program-cat(\d+)-p\d+\.html/);
        if (catMatch && title && !filterCategories.includes(title)) {
            const catId = catMatch[1];
            if (catId !== '0' && !seen.has(catId)) {
                seen.add(catId);
                categories.push({
                    type_id: catId,
                    type_name: title
                });
            }
        }
    });
    
    categories.sort((a, b) => parseInt(a.type_id) - parseInt(b.type_id));
    return categories;
}

// ========== 列表解析 ==========

function parseList(html) {
    const items = [];
    const seenIds = new Set();
    
    const links = pdfa(html, 'a[href*="program_download"]');
    links.forEach(a => {
        const href = a.match(/href="([^"]+)"/)?.[1] || '';
        const title = stripTags(a);
        
        if (!title || title.length < 2) return;
        
        const vidMatch = href.match(/program_download-?(\d+)\.html/);
        if (!vidMatch) return;
        
        const vid = vidMatch[1];
        if (seenIds.has(vid)) return;
        seenIds.add(vid);
        
        // 提取图片
        let pic = defaultPic;
        const imgTag = a.match(/<img[^>]*src="([^"]+)"/);
        if (imgTag) {
            pic = fixUrl(imgTag[1]);
        }
        
        // 提取备注（日期）
        let remarks = '';
        const parent = a.match(/<li[^>]*>([\s\S]*?)<\/li>/);
        if (parent) {
            const dateSpan = parent[1].match(/<span[^>]*class="[^"]*date[^"]*"[^>]*>([^<]+)<\/span>/);
            if (dateSpan) {
                remarks = dateSpan[1].trim();
            }
        }
        
        items.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: remarks
        });
    });
    
    return items;
}

// ========== 分页解析 ==========

function parsePageCount(html, currentPg) {
    let max = 1;
    
    const pagination = html.match(/<div[^>]*class="[^"]*page[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (pagination) {
        const pageLinks = pdfa(pagination[1], 'a');
        pageLinks.forEach(link => {
            const href = link.match(/href="([^"]+)"/)?.[1] || '';
            const pageMatch = href.match(/[?&]page=(\d+)/);
            if (pageMatch) {
                const pgNum = parseInt(pageMatch[1]);
                if (pgNum > max) max = pgNum;
            }
        });
    }
    
    // 从文本中提取
    const textMatch = html.match(/共(\d+)页/);
    if (textMatch) {
        const totalPages = parseInt(textMatch[1]);
        if (totalPages > max) max = totalPages;
    }
    
    if (max <= currentPg) max = currentPg + 1;
    return max;
}

// ========== 壳子接口实现 ==========

async function init(cfg) {
    return JSON.stringify({});
}

async function home(filter) {
    try {
        const html = (await req(host + '/program.html', { headers }))?.content || '';
        const categories = parseCategories(html);
        
        // 生成年份和月份筛选器
        const currentYear = new Date().getFullYear();
        const years = [{ n: '全部年份', v: '' }];
        for (let y = currentYear; y > 2002; y--) {
            years.push({ n: String(y), v: String(y) });
        }
        
        const months = [{ n: '全部月份', v: '' }];
        for (let m = 1; m <= 12; m++) {
            months.push({ n: m + '月', v: String(m) });
        }
        
        const filters = {};
        categories.forEach(cat => {
            filters[cat.type_id] = [
                { key: 'year', name: '年份', value: years },
                { key: 'month', name: '月份', value: months }
            ];
        });
        
        const list = parseList(html);
        
        return JSON.stringify({
            class: categories,
            filters: filters,
            list: list.slice(0, 30)
        });
    } catch (e) {
        return JSON.stringify({ class: [], filters: {}, list: [] });
    }
}

async function homeVod() {
    try {
        const html = (await req(host + '/program.html', { headers }))?.content || '';
        const list = parseList(html);
        return JSON.stringify({ list: list.slice(0, 30) });
    } catch (e) {
        return JSON.stringify({ list: [] });
    }
}

async function category(tid, pg, filter, extend = {}) {
    try {
        const page = parseInt(pg) || 1;
        
        let url = `${host}/program.html`;
        const params = [];
        params.push(`cat_id=${tid}`);
        params.push(`page=${page}`);
        
        if (extend && extend.year && extend.year !== '') {
            params.push(`year=${extend.year}`);
        }
        if (extend && extend.month && extend.month !== '') {
            params.push(`month=${extend.month}`);
        }
        
        url = url + '?' + params.join('&');
        
        const html = (await req(url, { headers }))?.content || '';
        const list = parseList(html);
        const pagecount = parsePageCount(html, page);
        
        return JSON.stringify({
            page: page,
            pagecount: pagecount,
            limit: 30,
            total: list.length,
            list: list
        });
    } catch (e) {
        return JSON.stringify({ page: pg || 1, pagecount: 0, list: [] });
    }
}

async function detail(id) {
    try {
        const vid = Array.isArray(id) ? id[0] : id;
        const url = `${host}/program_download-${vid}.html`;
        const html = (await req(url, { headers }))?.content || '';
        
        if (!html) return JSON.stringify({ list: [] });
        
        // 标题
        const titleMatch = html.match(/<title>([^<]*)<\/title>/);
        let originalTitle = titleMatch ? titleMatch[1].replace(/[-|]\s*LoveQ.*$/, '').trim() : `节目${vid}`;
        
        // 发布日期和内容
        let pubDate = '';
        let content = '';
        
        const pdl1Match = html.match(/<ul[^>]*class="[^"]*pdl1[^"]*"[^>]*>([\s\S]*?)<\/ul>/);
        if (pdl1Match) {
            const lis = pdfa(pdl1Match[1], 'li');
            lis.forEach(li => {
                const text = stripTags(li);
                if (text.includes('发布日期：') || text.includes('发布时间：')) {
                    const dateMatch = text.match(/(\d{4}[-/]\d{2}[-/]\d{2})/);
                    if (dateMatch) {
                        pubDate = dateMatch[1];
                    } else {
                        pubDate = text.replace(/^(发布日期|发布时间)[：:]/, '').trim();
                    }
                } else if (text.includes('节目内容：') || text.includes('内容简介：')) {
                    content = text.replace(/^(节目内容|内容简介)[：:]/, '').trim();
                }
            });
        }
        
        if (!content) {
            const metaMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/);
            if (metaMatch) content = metaMatch[1];
        }
        
        if (!content) {
            const contentDiv = html.match(/<div[^>]*class="[^"]*(?:content|intro|desc)[^"]*"[^>]*>([\s\S]*?)<\/div>/);
            if (contentDiv) {
                content = stripTags(contentDiv[1]).slice(0, 500);
            }
        }
        
        if (!content || /^\d{4}[-/]\d{2}[-/]\d{2}\s*$/.test(content)) {
            content = '暂无节目简介';
        }
        
        // 构建标题：发布日期 + 节目内容
        let newTitle = originalTitle;
        if (pubDate) {
            const formattedDate = pubDate.replace(/\//g, '-');
            const contentPreview = content.length > 50 ? content.slice(0, 50) : content;
            newTitle = `${formattedDate} - ${contentPreview}`;
        }
        
        const desc = pubDate ? `📅 发布日期：${pubDate}\n📝 ${content}` : content;
        
        // ========== 提取音频链接 ==========
        const audioLinks = [];
        
        // 1. 匹配完整URL
        const pattern1 = /https?:\/\/dl2\.loveq\.cn:8090\/live\/program\/[\d/]+[\w.]+\.(?:mp3|MP3|m4a|M4A)\?sign=[a-f0-9]+&timestamp=\d+/gi;
        let match;
        while ((match = pattern1.exec(html)) !== null) {
            audioLinks.push(match[0]);
        }
        
        // 2. 匹配 // 开头的相对协议
        const pattern2 = /\/\/dl2\.loveq\.cn:8090\/live\/program\/[\d/]+[\w.]+\.(?:mp3|MP3|m4a|M4A)\?sign=[a-f0-9]+&timestamp=\d+/gi;
        while ((match = pattern2.exec(html)) !== null) {
            audioLinks.push('https:' + match[0]);
        }
        
        // 3. 匹配没有协议的域名
        const pattern3 = /dl2\.loveq\.cn:8090\/live\/program\/[\d/]+[\w.]+\.(?:mp3|MP3|m4a|M4A)\?sign=[a-f0-9]+&timestamp=\d+/gi;
        while ((match = pattern3.exec(html)) !== null) {
            audioLinks.push('https://' + match[0]);
        }
        
        // 4. 从 audio/source 标签提取
        const audioTags = pdfa(html, 'audio[src], source[src]');
        audioTags.forEach(tag => {
            const src = tag.match(/src="([^"]+)"/)?.[1] || '';
            if (src && src.includes('dl2.loveq.cn') && /\.mp3\?/.test(src) && src.includes('sign=') && src.includes('timestamp=')) {
                audioLinks.push(fixUrl(src));
            }
        });
        
        // 5. 从 JavaScript 变量提取
        const jsPattern = /["'](https?:\/\/dl2\.loveq\.cn:8090\/live\/program\/[\d/]+[\w.]+\.(?:mp3|MP3|m4a|M4A)\?sign=[a-f0-9]+&timestamp=\d+)["']/gi;
        while ((match = jsPattern.exec(html)) !== null) {
            audioLinks.push(match[1]);
        }
        
        // 6. 宽松匹配
        const loosePattern = /(?:https?:)?\/\/dl2\.loveq\.cn:8090\/live\/program\/[^\s"'<>]+\.(?:mp3|MP3|m4a|M4A)[^\s"'<>]*/gi;
        while ((match = loosePattern.exec(html)) !== null) {
            let link = match[0];
            if (link.includes('sign=') && link.includes('timestamp=')) {
                if (link.startsWith('//')) link = 'https:' + link;
                if (!link.startsWith('http')) link = 'https://' + link;
                audioLinks.push(link);
            }
        }
        
        // 去重并过滤
        const uniqueLinks = [];
        const seen = new Set();
        audioLinks.forEach(link => {
            if (!link || seen.has(link)) return;
            seen.add(link);
            const fixed = fixUrl(link);
            if (fixed && fixed.startsWith('http') && 
                fixed.includes('dl2.loveq.cn') && 
                (fixed.includes('.mp3') || fixed.includes('.MP3') || fixed.includes('.m4a') || fixed.includes('.M4A')) && 
                fixed.includes('sign=') && 
                fixed.includes('timestamp=')) {
                uniqueLinks.push(fixed);
            }
        });
        
        // 构建播放URL
        let playUrl = '暂无音频';
        if (uniqueLinks.length > 0) {
            if (uniqueLinks.length > 1) {
                playUrl = uniqueLinks.map((link, i) => `LoveQ音频${i + 1}$${link}`).join('$$$');
            } else {
                playUrl = `LoveQ音频$${uniqueLinks[0]}`;
            }
        }
        
        // 提取图片
        let vodPic = defaultPic;
        if (originalTitle.includes('得闲小叙') || originalTitle.includes('得闲')) {
            vodPic = dexianPic;
        } else {
            const imgMatch = html.match(/<img[^>]*class="[^"]*(?:cover|poster|pic|lazy)[^"]*"[^>]*src="([^"]+)"/);
            if (imgMatch) {
                vodPic = fixUrl(imgMatch[1]);
            }
        }
        
        return JSON.stringify({
            list: [{
                vod_id: vid,
                vod_name: newTitle,
                vod_pic: vodPic,
                vod_content: desc,
                vod_play_from: '木凡的天空',
                vod_play_url: playUrl
            }]
        });
    } catch (e) {
        return JSON.stringify({ list: [] });
    }
}

async function search(wd, quick, pg = 1) {
    try {
        const page = parseInt(pg) || 1;
        const encodedWd = encodeURIComponent(wd);
        
        const searchUrls = [
            `${host}/so-${page}-${encodedWd}.html`,
            `${host}/so.html?wd=${encodedWd}&page=${page}`,
            `${host}/search.php?keyword=${encodedWd}&page=${page}`
        ];
        
        let html = '';
        for (const url of searchUrls) {
            const result = await req(url, { headers });
            if (result?.content) {
                html = result.content;
                break;
            }
        }
        
        if (!html) return JSON.stringify({ list: [] });
        
        const list = parseList(html);
        const filtered = list.filter(item => 
            item.vod_name.toLowerCase().includes(wd.toLowerCase())
        );
        
        return JSON.stringify({
            page: page,
            pagecount: 1,
            list: filtered
        });
    } catch (e) {
        return JSON.stringify({ page: pg, list: [] });
    }
}

async function play(flag, id, flags) {
    try {
        let audioUrl = id;
        
        // 解析播放URL
        if (id && id.includes('$$$')) {
            const firstTrack = id.split('$$$')[0];
            if (firstTrack && firstTrack.includes('$')) {
                audioUrl = firstTrack.split('$')[1];
            } else {
                audioUrl = firstTrack;
            }
        } else if (id && id.includes('$')) {
            audioUrl = id.split('$')[1];
        }
        
        // 补全协议
        audioUrl = fixUrl(audioUrl);
        
        if (!audioUrl || audioUrl === '暂无音频' || !audioUrl.startsWith('http')) {
            return JSON.stringify({
                parse: 0,
                url: '',
                header: playHeaders
            });
        }
        
        return JSON.stringify({
            parse: 0,
            url: audioUrl,
            header: playHeaders
        });
    } catch (e) {
        return JSON.stringify({ parse: 0, url: id, header: playHeaders });
    }
}

export default {
    init: init,
    home: home,
    homeVod: homeVod,
    category: category,
    detail: detail,
    search: search,
    play: play
};