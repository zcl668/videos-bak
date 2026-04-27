async function getLocalInfo() {
  const appConfig = {
    ver: 1,
    name: "木凡的天空(LoveQ)",
    api: "csp_loveq",
  }
  return jsonify(appConfig)
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const cheerio = createCheerio()

const appConfig = {
    ver: 1,
    title: 'LoveQ',
    site: 'https://www.loveq.cn',
    default_pic: 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg',
    dexian_pic: 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg',
    filter_categories: ["盛世乾坤", "一些事一些情", "一些事一些情精华剪辑"]
}

async function getConfig() {
    let config = { ...appConfig };
    
    const html = await get(`${appConfig.site}/program.html`);
    if (html) {
        const $ = cheerio.load(html);
        const tabs = [];
        const seen = new Set();
        
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            const title = $(el).text().trim();
            const catMatch = href.match(/program-cat(\d+)-p\d+\.html/);
            
            if (catMatch && title && !appConfig.filter_categories.includes(title)) {
                const catId = catMatch[1];
                if (catId !== "0" && !seen.has(catId)) {
                    seen.add(catId);
                    tabs.push({
                        name: title,
                        ui: 1,
                        ext: {
                            id: catId,
                            type: 'category'
                        }
                    });
                }
            }
        });
        
        tabs.sort((a, b) => parseInt(a.ext.id) - parseInt(b.ext.id));
        
        tabs.unshift({
            name: '🔍 搜索',
            ui: 2,
            ext: { type: 'search' }
        });
        
        config.tabs = tabs;
    }
    
    return jsonify(config);
}

async function getCards(ext) {
    ext = argsify(ext);
    let cards = [];
    let { page = 1, id, type, filters = {} } = ext;
    
    if (type === 'search') {
        return jsonify({ list: [] });
    }
    
    const params = new URLSearchParams();
    params.append('cat_id', id);
    params.append('page', page);
    
    if (filters.year) params.append('year', filters.year);
    if (filters.month) params.append('month', filters.month);
    
    const url = `${appConfig.site}/program.html?${params.toString()}`;
    console.log('Requesting:', url);
    
    const html = await get(url);
    if (!html) return jsonify({ list: [] });
    
    const $ = cheerio.load(html);
    
    $('a[href*="program_download"]').each((_, el) => {
        const href = $(el).attr('href');
        let title = $(el).text().trim();
        
        if (!title || title.length < 2) return;
        
        const vidMatch = href.match(/program_download-?(\d+)\.html/);
        if (vidMatch) {
            const vid = vidMatch[1];
            
            let pic = appConfig.default_pic;
            const img = $(el).find('img');
            if (img.length && img.attr('src')) {
                let imgSrc = img.attr('src');
                if (imgSrc.startsWith('http')) {
                    pic = imgSrc;
                } else {
                    pic = appConfig.site + imgSrc;
                }
            }
            
            let remark = '';
            const parent = $(el).closest('li');
            if (parent.length) {
                const dateSpan = parent.find('span[class*="date"], span[class*="time"]');
                if (dateSpan.length) {
                    remark = dateSpan.text().trim();
                }
            }
            
            cards.push({
                vod_id: vid,
                vod_name: title,
                vod_pic: pic,
                vod_remarks: remark,
                ext: {
                    url: `${appConfig.site}/program_download-${vid}.html`,
                    vid: vid
                }
            });
        }
    });
    
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
                pageLinks.each((_, link) => {
                    const href = $(link).attr('href');
                    const pageMatch = href.match(/[?&]page=(\d+)/);
                    if (pageMatch) {
                        const pgNum = parseInt(pageMatch[1]);
                        if (pgNum > pageCount) pageCount = pgNum;
                    }
                });
            }
        }
    }
    
    if (pageCount <= page && cards.length > 0) {
        pageCount = page + 1;
    }
    
    return jsonify({
        list: cards,
        page: page,
        pagecount: pageCount,
        limit: 30,
        total: cards.length,
        filter: [
            {
                key: 'year',
                name: '年份',
                init: '',
                value: (() => {
                    const currentYear = new Date().getFullYear();
                    const years = [{ n: '全部年份', v: '' }];
                    for (let y = currentYear; y > 2002; y--) {
                        years.push({ n: String(y), v: String(y) });
                    }
                    return years;
                })()
            },
            {
                key: 'month',
                name: '月份',
                init: '',
                value: (() => {
                    const months = [{ n: '全部月份', v: '' }];
                    for (let m = 1; m <= 12; m++) {
                        months.push({ n: `${m}月`, v: String(m) });
                    }
                    return months;
                })()
            }
        ]
    });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const url = ext.url;
    const vid = ext.vid;
    
    const html = await get(url);
    if (!html) return jsonify({ list: [] });
    
    const $ = cheerio.load(html);
    
    let originalTitle = '';
    const titleTag = $('title');
    if (titleTag.length) {
        originalTitle = titleTag.text().trim();
        originalTitle = originalTitle.replace(/[-|]\s*LoveQ.*$/, '').trim();
    }
    if (!originalTitle) originalTitle = `节目${vid}`;
    
    let pubDate = '';
    let content = '';
    
    const pdl1List = $('ul.pdl1');
    if (pdl1List.length) {
        pdl1List.find('li').each((_, li) => {
            const liText = $(li).text().trim();
            if (liText.includes('发布日期：') || liText.includes('发布时间：')) {
                const dateMatch = liText.match(/(\d{4}[-\/]\d{2}[-\/]\d{2})/);
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
    
    if (content && /^\d{4}[-\/]\d{2}[-\/]\d{2}\s*$/.test(content)) {
        content = "暂无节目简介";
    } else if (!content) {
        content = "暂无节目简介";
    }
    
    let newTitle = originalTitle;
    if (pubDate) {
        const formattedDate = pubDate.replace(/\//g, '-');
        const contentPreview = content.length > 50 ? content.slice(0, 50) : content;
        newTitle = `${formattedDate} - ${contentPreview}`;
    }
    
    const desc = pubDate ? `📅 发布日期：${pubDate}\n📝 ${content}` : content;
    
    // ========== 只保留线路12的音频链接 ==========
    const audioLinks = [];
    
    // 线路12格式: https://dl2.loveq.cn:8090/live/program/xxx/xxx.mp3?sign=xxx&timestamp=xxx
    const pattern = /https?:\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi;
    let match;
    while ((match = pattern.exec(html)) !== null) {
        audioLinks.push(match[0]);
    }
    
    // 协议相对路径
    const patternRel = /\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi;
    while ((match = patternRel.exec(html)) !== null) {
        audioLinks.push('https:' + match[0]);
    }
    
    // 从 audio/source 标签提取
    $('audio, source').each((_, tag) => {
        const src = $(tag).attr('src');
        if (src && src.includes('dl2.loveq.cn') && /\.mp3\?/.test(src) && src.includes('sign=') && src.includes('timestamp=')) {
            audioLinks.push(src);
        }
    });
    
    // 去重
    const validLinks = [...new Set(audioLinks)];
    
    // 构建播放URL - 只有线路12
    let playUrl = "暂无音频";
    if (validLinks.length > 0) {
        if (validLinks.length > 1) {
            playUrl = validLinks.map((link) => `线路12$${link}`).join('$$$');
        } else {
            playUrl = `线路12$${validLinks[0]}`;
        }
    }
    
    let vodPic = appConfig.default_pic;
    if (originalTitle.includes("得闲小叙") || originalTitle.includes("得闲")) {
        vodPic = appConfig.dexian_pic;
    } else {
        const imgTag = $('img[class*="cover"], img[class*="poster"], img[class*="pic"]');
        if (imgTag.length && imgTag.attr('src')) {
            let imgSrc = imgTag.attr('src');
            if (imgSrc.startsWith('http')) {
                vodPic = imgSrc;
            } else {
                vodPic = appConfig.site + imgSrc;
            }
        }
    }
    
    return jsonify({
        list: [{
            title: newTitle,
            pic: vodPic,
            desc: desc,
            play_url: playUrl
        }]
    });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = ext.url;
    
    const headers = {
        'User-Agent': UA,
        'Referer': appConfig.site + '/',
        'Origin': appConfig.site,
        'Accept': 'audio/webm,audio/ogg,audio/wav,audio/*;q=0.9',
        'Range': 'bytes=0-'
    };
    
    return jsonify({
        urls: [url],
        headers: [headers]
    });
}

async function search(ext) {
    ext = argsify(ext);
    let cards = [];
    let text = encodeURIComponent(ext.text);
    let page = ext.page || 1;
    
    const searchUrls = [
        `${appConfig.site}/so-${page}-${text}.html`,
        `${appConfig.site}/so.html?wd=${text}&page=${page}`,
        `${appConfig.site}/search.php?keyword=${text}&page=${page}`
    ];
    
    let html = '';
    for (const url of searchUrls) {
        html = await get(url);
        if (html) break;
    }
    
    if (!html) return jsonify({ list: [] });
    
    const $ = cheerio.load(html);
    const seenIds = new Set();
    
    $('a[href*="program_download"]').each((_, el) => {
        const href = $(el).attr('href');
        const title = $(el).text().trim();
        
        if (!title || title.length < 2) return;
        
        const vidMatch = href.match(/program_download-?(\d+)\.html/);
        if (vidMatch) {
            const vid = vidMatch[1];
            const searchText = ext.text.toLowerCase();
            
            if (title.toLowerCase().includes(searchText) && !seenIds.has(vid)) {
                seenIds.add(vid);
                cards.push({
                    vod_id: vid,
                    vod_name: title,
                    vod_pic: appConfig.default_pic,
                    vod_remarks: "搜索结果",
                    ext: {
                        url: `${appConfig.site}/program_download-${vid}.html`,
                        vid: vid
                    }
                });
            }
        }
    });
    
    return jsonify({ list: cards });
}

async function get(url) {
    try {
        const response = await $fetch.get(url, {
            headers: { 'User-Agent': UA }
        });
        return response.data;
    } catch (e) {
        console.log(`请求失败: ${e.message}, URL: ${url}`);
        return '';
    }
}