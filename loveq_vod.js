// LoveQ 音频源 - 适配 XPTV 应用
// TVBox 格式转换为 XPTV 格式

// ========== 应用配置 ==========
const APP_CONFIG = {
    ver: 1,
    title: 'LoveQ音频',
    site: 'https://www.loveq.cn',
    api: 'csp_loveq',
    defaultPic: 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg',
    dexianPic: 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg'
};

// 需要过滤的分类
const FILTER_CATEGORIES = ['盛世乾坤', '一些事一些情', '一些事一些情精华剪辑'];

// User-Agent
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';

// ========== 工具函数 ==========
function getText(el) {
    return el ? el.text().trim().replace(/\s+/g, ' ') : '';
}

function getCurrentYear() {
    return new Date().getFullYear();
}

// ========== 获取应用信息 ==========
async function getLocalInfo() {
    const appConfig = {
        ver: 1,
        name: 'LoveQ音频',
        api: 'csp_loveq',
    };
    return jsonify(appConfig);
}

// ========== 获取配置 ==========
async function getConfig() {
    let config = { ...APP_CONFIG };
    config.tabs = await getCategories();
    return jsonify(config);
}

// ========== 获取分类 ==========
async function getCategories() {
    const url = APP_CONFIG.site + '/program.html';
    
    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Referer': APP_CONFIG.site + '/'
        }
    });
    
    if (!data) return [];
    
    const $ = createCheerio().load(data);
    const categories = [];
    const seen = new Set();
    
    $('a[href]').each(function() {
        const href = $(this).attr('href') || '';
        const title = getText($(this));
        
        if (!title || FILTER_CATEGORIES.includes(title)) return;
        
        const match = href.match(/program-cat(\d+)-p\d+\.html/);
        if (match && match[1] && match[1] !== '0' && !seen.has(match[1])) {
            seen.add(match[1]);
            categories.push({
                name: title,
                ui: 1,
                ext: {
                    id: match[1]
                }
            });
        }
    });
    
    categories.sort((a, b) => parseInt(a.ext.id) - parseInt(b.ext.id));
    
    return categories;
}

// ========== 获取卡片列表 ==========
async function getCards(ext) {
    ext = argsify(ext);
    let cards = [];
    let { page = 1, id, filters = {} } = ext;
    
    let params = {
        cat_id: id,
        page: page
    };
    
    if (filters.year && filters.year !== '') {
        params.year = filters.year;
    }
    if (filters.month && filters.month !== '') {
        params.month = filters.month;
    }
    
    let url = APP_CONFIG.site + '/program.html';
    const queryString = Object.entries(params)
        .filter(([_, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    if (queryString) {
        url += '?' + queryString;
    }
    
    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Referer': APP_CONFIG.site + '/'
        }
    });
    
    if (!data) {
        return jsonify({ list: [] });
    }
    
    const $ = createCheerio().load(data);
    const seen = new Set();
    
    $('a[href*="program_download"]').each(function() {
        const href = $(this).attr('href') || '';
        const title = getText($(this));
        
        if (!title || title.length < 2) return;
        
        const match = href.match(/program_download-?(\d+)\.html/);
        if (!match || seen.has(match[1])) return;
        
        const vid = match[1];
        seen.add(vid);
        
        let pic = APP_CONFIG.defaultPic;
        const img = $(this).find('img');
        if (img.length > 0) {
            const src = img.attr('src') || '';
            if (src) {
                pic = src.startsWith('http') ? src : APP_CONFIG.site + src;
            }
        }
        
        let remark = '';
        const parent = $(this).closest('li');
        if (parent.length > 0) {
            const dateSpan = parent.find('span[class*="date"], span[class*="time"]');
            if (dateSpan.length > 0) {
                remark = getText(dateSpan);
            }
        }
        
        cards.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: remark,
            ext: {
                vid: vid
            }
        });
    });
    
    let pageCount = 1;
    const pagination = $('div[class*="page"], div[class*="pagination"]');
    if (pagination.length > 0) {
        const pageLinks = pagination.find('a');
        if (pageLinks.length > 0) {
            const lastIdx = pageLinks.length - 1;
            const lastPage = pageLinks.length >= 2 ? pageLinks.eq(pageLinks.length - 2) : pageLinks.eq(lastIdx);
            const pageText = getText(lastPage);
            if (/^\d+$/.test(pageText)) {
                pageCount = parseInt(pageText);
            } else {
                pageLinks.each(function() {
                    const href = $(this).attr('href') || '';
                    const pm = href.match(/[?&]page=(\d+)/);
                    if (pm) {
                        const pn = parseInt(pm[1]);
                        if (pn > pageCount) pageCount = pn;
                    }
                });
            }
        }
    }
    
    if (pageCount <= parseInt(page) && cards.length > 0) {
        pageCount = parseInt(page) + 1;
    }
    
    const currentYear = getCurrentYear();
    const years = [{ n: '全部年份', v: '' }];
    for (let y = currentYear; y > 2002; y--) {
        years.push({ n: String(y), v: String(y) });
    }
    
    const months = [{ n: '全部月份', v: '' }];
    for (let m = 1; m <= 12; m++) {
        months.push({ n: m + '月', v: String(m) });
    }
    
    return jsonify({
        list: cards,
        total: cards.length,
        page: parseInt(page),
        pagecount: pageCount,
        limit: 30,
        filter: [
            {
                key: 'year',
                name: '年份',
                init: '',
                value: years
            },
            {
                key: 'month',
                name: '月份',
                init: '',
                value: months
            }
        ]
    });
}

// ========== 获取详情 - TVBox格式转XPTV ==========
async function getDetail(ext) {
    ext = argsify(ext);
    const vid = ext.vid || ext.id;
    
    if (!vid) {
        return jsonify({ list: [] });
    }
    
    const url = APP_CONFIG.site + `/program_download-${vid}.html`;
    
    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Referer': APP_CONFIG.site + '/'
        }
    });
    
    if (!data) {
        return jsonify({ list: [] });
    }
    
    const $ = createCheerio().load(data);
    
    // ========== 提取原标题 ==========
    let originalTitle = '';
    const titleTag = $('title');
    if (titleTag.length > 0) {
        originalTitle = getText(titleTag).replace(/[-|]\s*LoveQ.*$/, '').trim();
    }
    if (!originalTitle) {
        originalTitle = '节目' + vid;
    }
    
    // ========== 提取发布日期和内容 ==========
    let pubDate = '';
    let content = '';
    
    const pdl1List = $('ul.pdl1');
    if (pdl1List.length > 0) {
        pdl1List.find('li').each(function() {
            const text = getText($(this));
            
            if (text.includes('发布日期') || text.includes('发布时间')) {
                const dateMatch = text.match(/(\d{4}[-/]\d{2}[-/]\d{2})/);
                if (dateMatch) {
                    pubDate = dateMatch[1];
                } else {
                    pubDate = text.replace(/^(发布日期|发布时间)[：:]/, '').trim();
                }
            } else if (text.includes('节目内容') || text.includes('内容简介')) {
                content = text.replace(/^(节目内容|内容简介)[：:]/, '').trim();
            }
        });
    }
    
    if (!content) {
        const metaDesc = $('meta[name="description"]');
        if (metaDesc.length > 0) {
            content = metaDesc.attr('content') || '';
        }
    }
    
    if (!content) {
        const contentDiv = $('div[class*="content"], div[class*="intro"], div[class*="desc"]');
        if (contentDiv.length > 0) {
            content = getText(contentDiv).substring(0, 500);
        }
    }
    
    if (content && /^\d{4}[-/]\d{2}[-/]\d{2}\s*$/.test(content)) {
        content = '暂无节目简介';
    }
    if (!content) {
        content = '暂无节目简介';
    }
    
    // ========== 构建标题 ==========
    let newTitle;
    if (pubDate) {
        const formattedDate = pubDate.replace(/\//g, '-');
        const contentPreview = content.length > 50 ? content.substring(0, 50) : content;
        newTitle = formattedDate + ' - ' + contentPreview;
    } else {
        newTitle = originalTitle;
    }
    
    const desc = pubDate ? '📅 发布日期：' + pubDate + '\n📝 ' + content : content;
    
    // ========== 提取音频链接 ==========
    const audioLinks = [];
    const seen = new Set();
    const htmlStr = data;
    
    // 匹配音频链接
    const patterns = [
        /https?:\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi,
        /\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi,
        /(?:https?:)?\/\/dl2\.loveq\.cn:8090\/[^\s<>"']+\.mp3[^\s<>"']*/gi
    ];
    
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(htmlStr)) !== null) {
            let link = match[0];
            if (link.startsWith('//')) {
                link = 'https:' + link;
            }
            if (link.includes('sign=') && link.includes('timestamp=') && !seen.has(link)) {
                seen.add(link);
                audioLinks.push(link);
            }
        }
    }
    
    // 从 audio/source 标签提取
    $('audio[src], source[src]').each(function() {
        const src = $(this).attr('src') || '';
        if (src && src.includes('dl2.loveq.cn') && src.includes('.mp3')) {
            let link = src.startsWith('//') ? 'https:' + src : src;
            if (!seen.has(link)) {
                seen.add(link);
                audioLinks.push(link);
            }
        }
    });
    
    // ========== 判断图片 ==========
    let vodPic = APP_CONFIG.defaultPic;
    if (originalTitle.includes('得闲小叙') || originalTitle.includes('得闲')) {
        vodPic = APP_CONFIG.dexianPic;
    } else {
        const imgTag = $('img[class*="cover"], img[class*="poster"], img[class*="pic"]');
        if (imgTag.length > 0) {
            const src = imgTag.attr('src') || '';
            if (src) {
                vodPic = src.startsWith('http') ? src : APP_CONFIG.site + src;
            }
        }
    }
    
    // ========== XPTV 格式：vod_play_url 使用 TVBox 格式 ==========
    // XPTV 会调用 getPlayinfo 来解析播放地址
    let playUrl = '';
    
    if (audioLinks.length > 0) {
        // TVBox 格式: 播放源$播放地址
        // XPTV 的 getPlayinfo 会接收这个格式并解析
        playUrl = 'LoveQ音频$' + audioLinks[0];
        
        // 如果有多个音频，用 # 分隔
        if (audioLinks.length > 1) {
            const moreLinks = audioLinks.slice(1).map(link => 'LoveQ音频$' + link);
            playUrl = playUrl + '#' + moreLinks.join('#');
        }
    }
    
    // ========== 返回结果 ==========
    return jsonify({
        list: [{
            vod_id: vid,
            vod_name: newTitle,
            vod_pic: vodPic,
            vod_content: desc,
            vod_play_from: 'LoveQ音频',
            vod_play_url: playUrl,
            ext: {
                vid: vid,
                audio_links: audioLinks
            }
        }]
    });
}

// ========== 获取播放信息 - 解析 TVBox 格式 ==========
async function getPlayinfo(ext) {
    ext = argsify(ext);
    
    // 获取播放URL - 可能是 TVBox 格式
    let rawUrl = ext.url || ext.id || '';
    
    // 如果为空，尝试从 ext.audio_links 获取
    if (!rawUrl && ext.audio_links && ext.audio_links.length > 0) {
        rawUrl = ext.audio_links[0];
    }
    
    // 解析 TVBox 格式: 播放源$播放地址
    let audioUrl = rawUrl;
    
    // 如果包含 $，提取播放地址部分
    if (rawUrl && rawUrl.includes('$')) {
        // 如果有 # 分隔符，取第一个
        if (rawUrl.includes('#')) {
            const firstPart = rawUrl.split('#')[0];
            if (firstPart.includes('$')) {
                audioUrl = firstPart.split('$')[1];
            }
        } else {
            audioUrl = rawUrl.split('$')[1];
        }
    }
    
    // 如果还是没有，尝试从 ext.audio_links 获取第一个
    if (!audioUrl || audioUrl === '' || audioUrl === rawUrl) {
        if (ext.audio_links && ext.audio_links.length > 0) {
            audioUrl = ext.audio_links[0];
        }
    }
    
    // 确保URL完整
    if (audioUrl && audioUrl.startsWith('//')) {
        audioUrl = 'https:' + audioUrl;
    }
    
    // 如果还是没有播放地址，返回空
    if (!audioUrl || audioUrl === '' || audioUrl === 'LoveQ音频$') {
        return jsonify({
            urls: [],
            headers: []
        });
    }
    
    // XPTV 标准格式
    return jsonify({
        urls: [audioUrl],
        headers: [{
            'User-Agent': UA,
            'Referer': APP_CONFIG.site + '/',
            'Origin': APP_CONFIG.site,
            'Accept': 'audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*/*;q=0.5',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Range': 'bytes=0-',
            'Connection': 'keep-alive'
        }]
    });
}

// ========== 搜索 ==========
async function search(ext) {
    ext = argsify(ext);
    let cards = [];
    let text = encodeURIComponent(ext.text);
    let page = ext.page || 1;
    
    const searchUrls = [
        APP_CONFIG.site + `/so-${page}-${text}.html`,
        APP_CONFIG.site + `/so.html?wd=${text}&page=${page}`,
        APP_CONFIG.site + `/search.php?keyword=${text}&page=${page}`
    ];
    
    let data = '';
    
    for (const url of searchUrls) {
        try {
            const response = await $fetch.get(url, {
                headers: {
                    'User-Agent': UA,
                    'Referer': APP_CONFIG.site + '/'
                }
            });
            if (response.data) {
                data = response.data;
                break;
            }
        } catch (e) {
            // 继续尝试下一个
        }
    }
    
    if (!data) {
        return jsonify({ list: [] });
    }
    
    const $ = createCheerio().load(data);
    const seen = new Set();
    
    $('a[href*="program_download"]').each(function() {
        const href = $(this).attr('href') || '';
        const title = getText($(this));
        
        if (!title || title.length < 2) return;
        
        const match = href.match(/program_download-?(\d+)\.html/);
        if (!match || seen.has(match[1])) return;
        
        const vid = match[1];
        const searchKey = ext.text.toLowerCase();
        
        if (title.toLowerCase().includes(searchKey) || title.includes(ext.text)) {
            seen.add(vid);
            cards.push({
                vod_id: vid,
                vod_name: title,
                vod_pic: APP_CONFIG.defaultPic,
                vod_remarks: '搜索结果'
            });
        }
    });
    
    return jsonify({
        list: cards,
        total: cards.length
    });
}

// ========== 导出模块 ==========
module.exports = {
    getLocalInfo,
    getConfig,
    getCards,
    getDetail,
    getPlayinfo,
    search
};