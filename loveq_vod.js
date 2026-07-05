// LoveQ 音频源 - 适配 XPTV 应用
// ========== 应用配置 ==========
var APP_CONFIG = {
    ver: 1,
    title: 'LoveQ音频',
    site: 'https://www.loveq.cn',
    api: 'csp_loveq',
    defaultPic: 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg',
    dexianPic: 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg'
};

// 需要过滤的分类
var FILTER_CATEGORIES = ['盛世乾坤', '一些事一些情', '一些事一些情精华剪辑'];

// User-Agent
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';

// ========== 工具函数 ==========
function getText(el) {
    return el ? el.text().trim().replace(/\s+/g, ' ') : '';
}

function getCurrentYear() {
    return new Date().getFullYear();
}

// ========== 获取应用信息 ==========
async function getLocalInfo() {
    var appConfig = {
        ver: 1,
        name: 'LoveQ音频',
        api: 'csp_loveq',
    };
    return jsonify(appConfig);
}

// ========== 获取配置 ==========
async function getConfig() {
    var config = { ...APP_CONFIG };
    config.tabs = await getCategories();
    return jsonify(config);
}

// ========== 获取分类 ==========
async function getCategories() {
    var url = APP_CONFIG.site + '/program.html';
    
    var response = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Referer': APP_CONFIG.site + '/'
        }
    });
    var data = response.data;
    
    if (!data) return [];
    
    var $ = createCheerio().load(data);
    var categories = [];
    var seen = new Set();
    
    $('a[href]').each(function() {
        var href = $(this).attr('href') || '';
        var title = getText($(this));
        
        if (!title || FILTER_CATEGORIES.indexOf(title) !== -1) return;
        
        var match = href.match(/program-cat(\d+)-p\d+\.html/);
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
    
    categories.sort(function(a, b) {
        return parseInt(a.ext.id) - parseInt(b.ext.id);
    });
    
    return categories;
}

// ========== 获取卡片列表 ==========
async function getCards(ext) {
    ext = argsify(ext);
    var cards = [];
    var page = ext.page || 1;
    var id = ext.id;
    var filters = ext.filters || {};
    
    var params = {
        cat_id: id,
        page: page
    };
    
    if (filters.year && filters.year !== '') {
        params.year = filters.year;
    }
    if (filters.month && filters.month !== '') {
        params.month = filters.month;
    }
    
    var url = APP_CONFIG.site + '/program.html';
    var queryParts = [];
    for (var key in params) {
        if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
            queryParts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
        }
    }
    if (queryParts.length > 0) {
        url += '?' + queryParts.join('&');
    }
    
    var response = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Referer': APP_CONFIG.site + '/'
        }
    });
    var data = response.data;
    
    if (!data) {
        return jsonify({ list: [] });
    }
    
    var $ = createCheerio().load(data);
    var seen = new Set();
    
    $('a[href*="program_download"]').each(function() {
        var href = $(this).attr('href') || '';
        var title = getText($(this));
        
        if (!title || title.length < 2) return;
        
        var match = href.match(/program_download-?(\d+)\.html/);
        if (!match || seen.has(match[1])) return;
        
        var vid = match[1];
        seen.add(vid);
        
        var pic = APP_CONFIG.defaultPic;
        var img = $(this).find('img');
        if (img.length > 0) {
            var src = img.attr('src') || '';
            if (src) {
                pic = src.startsWith('http') ? src : APP_CONFIG.site + src;
            }
        }
        
        var remark = '';
        var parent = $(this).closest('li');
        if (parent.length > 0) {
            var dateSpan = parent.find('span[class*="date"], span[class*="time"]');
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
    
    var pageCount = 1;
    var pagination = $('div[class*="page"], div[class*="pagination"]');
    if (pagination.length > 0) {
        var pageLinks = pagination.find('a');
        if (pageLinks.length > 0) {
            var lastIdx = pageLinks.length - 1;
            var lastPage = pageLinks.length >= 2 ? pageLinks.eq(pageLinks.length - 2) : pageLinks.eq(lastIdx);
            var pageText = getText(lastPage);
            if (/^\d+$/.test(pageText)) {
                pageCount = parseInt(pageText);
            } else {
                pageLinks.each(function() {
                    var href = $(this).attr('href') || '';
                    var pm = href.match(/[?&]page=(\d+)/);
                    if (pm) {
                        var pn = parseInt(pm[1]);
                        if (pn > pageCount) pageCount = pn;
                    }
                });
            }
        }
    }
    
    if (pageCount <= parseInt(page) && cards.length > 0) {
        pageCount = parseInt(page) + 1;
    }
    
    var currentYear = getCurrentYear();
    var years = [{ n: '全部年份', v: '' }];
    for (var y = currentYear; y > 2002; y--) {
        years.push({ n: String(y), v: String(y) });
    }
    
    var months = [{ n: '全部月份', v: '' }];
    for (var m = 1; m <= 12; m++) {
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

// ========== 获取详情 ==========
async function getDetail(ext) {
    ext = argsify(ext);
    var vid = ext.vid || ext.id;
    
    if (!vid) {
        return jsonify({ list: [] });
    }
    
    var url = APP_CONFIG.site + '/program_download-' + vid + '.html';
    
    var response = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Referer': APP_CONFIG.site + '/'
        }
    });
    var data = response.data;
    
    if (!data) {
        return jsonify({ list: [] });
    }
    
    var $ = createCheerio().load(data);
    
    // ========== 提取原标题 ==========
    var originalTitle = '';
    var titleTag = $('title');
    if (titleTag.length > 0) {
        originalTitle = getText(titleTag).replace(/[-|]\s*LoveQ.*$/, '').trim();
    }
    if (!originalTitle) {
        originalTitle = '节目' + vid;
    }
    
    // ========== 提取发布日期和内容 ==========
    var pubDate = '';
    var content = '';
    
    var pdl1List = $('ul.pdl1');
    if (pdl1List.length > 0) {
        pdl1List.find('li').each(function() {
            var text = getText($(this));
            
            if (text.indexOf('发布日期') !== -1 || text.indexOf('发布时间') !== -1) {
                var dateMatch = text.match(/(\d{4}[-/]\d{2}[-/]\d{2})/);
                if (dateMatch) {
                    pubDate = dateMatch[1];
                } else {
                    pubDate = text.replace(/^(发布日期|发布时间)[：:]/, '').trim();
                }
            } else if (text.indexOf('节目内容') !== -1 || text.indexOf('内容简介') !== -1) {
                content = text.replace(/^(节目内容|内容简介)[：:]/, '').trim();
            }
        });
    }
    
    if (!content) {
        var metaDesc = $('meta[name="description"]');
        if (metaDesc.length > 0) {
            content = metaDesc.attr('content') || '';
        }
    }
    
    if (!content) {
        var contentDiv = $('div[class*="content"], div[class*="intro"], div[class*="desc"]');
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
    var newTitle;
    if (pubDate) {
        var formattedDate = pubDate.replace(/\//g, '-');
        var contentPreview = content.length > 50 ? content.substring(0, 50) : content;
        newTitle = formattedDate + ' - ' + contentPreview;
    } else {
        newTitle = originalTitle;
    }
    
    var desc = pubDate ? '📅 发布日期：' + pubDate + '\n📝 ' + content : content;
    
    // ========== 提取音频链接 ==========
    var audioLinks = [];
    var seen = new Set();
    var htmlStr = data;
    
    // 匹配音频链接
    var patterns = [
        /https?:\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi,
        /\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi,
        /(?:https?:)?\/\/dl2\.loveq\.cn:8090\/[^\s<>"']+\.mp3[^\s<>"']*/gi
    ];
    
    for (var p = 0; p < patterns.length; p++) {
        var pattern = patterns[p];
        var match;
        while ((match = pattern.exec(htmlStr)) !== null) {
            var link = match[0];
            if (link.startsWith('//')) {
                link = 'https:' + link;
            }
            if (link.indexOf('sign=') !== -1 && link.indexOf('timestamp=') !== -1 && !seen.has(link)) {
                seen.add(link);
                audioLinks.push(link);
            }
        }
    }
    
    // 从 audio/source 标签提取
    $('audio[src], source[src]').each(function() {
        var src = $(this).attr('src') || '';
        if (src && src.indexOf('dl2.loveq.cn') !== -1 && src.indexOf('.mp3') !== -1) {
            var link = src.startsWith('//') ? 'https:' + src : src;
            if (!seen.has(link)) {
                seen.add(link);
                audioLinks.push(link);
            }
        }
    });
    
    // ========== 判断图片 ==========
    var vodPic = APP_CONFIG.defaultPic;
    if (originalTitle.indexOf('得闲小叙') !== -1 || originalTitle.indexOf('得闲') !== -1) {
        vodPic = APP_CONFIG.dexianPic;
    } else {
        var imgTag = $('img[class*="cover"], img[class*="poster"], img[class*="pic"]');
        if (imgTag.length > 0) {
            var src = imgTag.attr('src') || '';
            if (src) {
                vodPic = src.startsWith('http') ? src : APP_CONFIG.site + src;
            }
        }
    }
    
    // ========== 构建播放URL ==========
    var playUrl = '';
    var playFrom = 'LoveQ音频';
    
    if (audioLinks.length > 0) {
        // TVBox 格式: 播放源$播放地址
        playUrl = 'LoveQ音频$' + audioLinks[0];
        
        // 如果有多个音频，用 # 分隔
        if (audioLinks.length > 1) {
            var moreLinks = [];
            for (var i = 1; i < audioLinks.length; i++) {
                moreLinks.push('LoveQ音频$' + audioLinks[i]);
            }
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
            vod_play_from: playFrom,
            vod_play_url: playUrl,
            ext: {
                vid: vid,
                audio_links: audioLinks
            }
        }]
    });
}

// ========== 获取播放信息 ==========
async function getPlayinfo(ext) {
    ext = argsify(ext);
    
    // 获取播放URL
    var rawUrl = ext.url || ext.id || '';
    
    // 如果为空，尝试从 ext.audio_links 获取
    if (!rawUrl && ext.audio_links && ext.audio_links.length > 0) {
        rawUrl = ext.audio_links[0];
    }
    
    // 解析 TVBox 格式: 播放源$播放地址
    var audioUrl = rawUrl;
    
    // 如果包含 $，提取播放地址部分
    if (rawUrl && rawUrl.indexOf('$') !== -1) {
        // 如果有 # 分隔符，取第一个
        if (rawUrl.indexOf('#') !== -1) {
            var firstPart = rawUrl.split('#')[0];
            if (firstPart.indexOf('$') !== -1) {
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
    var cards = [];
    var text = encodeURIComponent(ext.text);
    var page = ext.page || 1;
    
    var searchUrls = [
        APP_CONFIG.site + '/so-' + page + '-' + text + '.html',
        APP_CONFIG.site + '/so.html?wd=' + text + '&page=' + page,
        APP_CONFIG.site + '/search.php?keyword=' + text + '&page=' + page
    ];
    
    var data = '';
    
    for (var u = 0; u < searchUrls.length; u++) {
        try {
            var url = searchUrls[u];
            var response = await $fetch.get(url, {
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
    
    var $ = createCheerio().load(data);
    var seen = new Set();
    
    $('a[href*="program_download"]').each(function() {
        var href = $(this).attr('href') || '';
        var title = getText($(this));
        
        if (!title || title.length < 2) return;
        
        var match = href.match(/program_download-?(\d+)\.html/);
        if (!match || seen.has(match[1])) return;
        
        var vid = match[1];
        var searchKey = ext.text.toLowerCase();
        
        if (title.toLowerCase().indexOf(searchKey) !== -1 || title.indexOf(ext.text) !== -1) {
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

// ========== XPTV 直接暴露函数 ==========
// XPTV 使用这些全局函数
var getLocalInfo = getLocalInfo;
var getConfig = getConfig;
var getCards = getCards;
var getDetail = getDetail;
var getPlayinfo = getPlayinfo;
var search = search;