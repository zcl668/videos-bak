async function getLocalInfo() {
  const appConfig = {
    ver: 1,
    name: "木凡的天空(LoveQ)",
    api: "csp_loveq",
  }
  return jsonify(appConfig)
}
// ========== 应用配置 ==========
const base_url = "https://www.loveq.cn"
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const cheerio = createCheerio()

// 需要过滤的分类
const filterCategories = ["盛世乾坤", "一些事一些情", "一些事一些情精华剪辑"]

const appConfig = {
    ver: 1,
    title: 'LoveQ',
    site: base_url,
    default_pic: 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg',
    dexian_pic: 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg',
    tabs: []
}

// ========== 工具函数 ==========
function getYears() {
    const currentYear = new Date().getFullYear()
    let years = [{ n: '全部年份', v: '' }]
    for (let y = currentYear; y > 2002; y--) {
        years.push({ n: String(y), v: String(y) })
    }
    return years
}

function getMonths() {
    let months = [{ n: '全部月份', v: '' }]
    for (let m = 1; m <= 12; m++) {
        months.push({ n: `${m}月`, v: String(m) })
    }
    return months
}

// ========== 获取分类配置 ==========
async function getConfig() {
    try {
        // 直接从API或页面获取分类
        const categories = await getCategoriesFromPage()
        
        if (!categories || categories.length === 0) {
            // 如果获取失败，使用备用分类
            return getDefaultConfig()
        }

        // 构建过滤器
        const filters = {}
        const years = getYears()
        const months = getMonths()
        
        categories.forEach(cat => {
            filters[cat.type_id] = [
                { key: 'year', name: '年份', value: years },
                { key: 'month', name: '月份', value: months }
            ]
        })

        // 构建tabs
        const tabs = categories.map(cat => ({
            name: cat.type_name,
            ui: 1,
            ext: {
                id: cat.type_id,
                type: 'category'
            }
        }))

        // 首页放在最前面
        tabs.unshift({
            name: '首页',
            ui: 1,
            ext: {
                id: 'home',
                type: 'home'
            }
        })

        appConfig.tabs = tabs

        return jsonify({
            class: categories,
            filters: filters
        })
    } catch (error) {
        console.log('获取分类失败:', error)
        return getDefaultConfig()
    }
}

// ========== 从页面获取分类 ==========
async function getCategoriesFromPage() {
    const categories = []
    const seen = new Set()
    
    // 尝试多个页面获取分类
    const urls = [
        `${base_url}/program.html`,
        `${base_url}/`,
        `${base_url}/program.html?page=1`
    ]
    
    for (const url of urls) {
        try {
            const html = await fetchPage(url)
            if (!html) continue
            
            const $ = cheerio.load(html)
            let found = false
            
            // 多种选择器查找分类链接
            const selectors = [
                '.nav li a',
                '.menu li a',
                '.sidebar a',
                '.category a',
                '.tag a',
                'a[href*="cat"]',
                'a[href*="program"]',
                '.top-nav a',
                '.header a'
            ]
            
            for (const selector of selectors) {
                $(selector).each((_, e) => {
                    const href = $(e).attr('href') || ''
                    const title = $(e).text().trim()
                    
                    if (!href || !title || title.length < 2) return
                    if (filterCategories.includes(title)) return
                    if (title.includes('首页') || title.includes('Home')) return
                    
                    // 提取分类ID
                    let catId = null
                    const patterns = [
                        /cat[_-]?(\d+)/i,
                        /program[_-]?cat[_-]?(\d+)/i,
                        /category[_-]?(\d+)/i,
                        /type[_-]?(\d+)/i,
                        /c[_-]?(\d+)/i,
                        /\/(\d+)\.html/
                    ]
                    
                    for (const pattern of patterns) {
                        const match = href.match(pattern)
                        if (match && match[1] !== '0') {
                            catId = match[1]
                            break
                        }
                    }
                    
                    if (catId && !seen.has(catId) && !categories.some(c => c.type_id === catId)) {
                        seen.add(catId)
                        categories.push({
                            type_name: title,
                            type_id: catId
                        })
                        found = true
                    }
                })
                
                if (found) break
            }
            
            if (categories.length > 0) break
        } catch (e) {
            console.log(`获取页面 ${url} 失败:`, e.message)
        }
    }
    
    // 如果还是没获取到，从页面中的分类标签提取
    if (categories.length === 0) {
        const html = await fetchPage(`${base_url}/program.html`)
        if (html) {
            const $ = cheerio.load(html)
            // 查找所有可能的分类
            $('a').each((_, e) => {
                const href = $(e).attr('href') || ''
                const text = $(e).text().trim()
                if (href.includes('program') && text && text.length > 1 && text.length < 10) {
                    const idMatch = href.match(/[?&]cat_id=(\d+)/)
                    if (idMatch && idMatch[1] !== '0') {
                        const id = idMatch[1]
                        if (!seen.has(id)) {
                            seen.add(id)
                            categories.push({
                                type_name: text,
                                type_id: id
                            })
                        }
                    }
                }
            })
        }
    }
    
    return categories
}

// ========== 获取卡片列表 ==========
async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, id, type = 'category', year = '', month = '' } = ext

    let url
    let html

    try {
        if (type === 'home' || id === 'home') {
            url = `${base_url}/program.html?page=${page}`
            html = await fetchPage(url)
        } else {
            // 构建分类URL
            let params = `cat_id=${id}&page=${page}`
            if (year) params += `&year=${year}`
            if (month) params += `&month=${month}`
            url = `${base_url}/program.html?${params}`
            html = await fetchPage(url)
        }

        if (!html) {
            return jsonify({ list: [], page: parseInt(page), pagecount: 0, limit: 30, total: 0 })
        }

        const $ = cheerio.load(html)
        const videos = []

        // 查找节目列表 - 多种选择器
        const selectors = [
            '.program-item',
            '.item',
            '.entry',
            'li',
            '.list-item',
            '.video-item',
            '.post-item'
        ]
        
        let items = []
        for (const selector of selectors) {
            const found = $(selector)
            if (found.length > 0) {
                items = found
                break
            }
        }
        
        // 如果没找到特定选择器，查找所有包含链接的元素
        if (items.length === 0) {
            items = $('a[href*="program_download"]').parent()
        }

        items.each((_, element) => {
            const $el = $(element)
            
            // 查找链接
            let link = $el.is('a') ? $el : $el.find('a[href*="program_download"]').first()
            if (link.length === 0) {
                link = $el.find('a').first()
            }
            
            const href = link.attr('href') || ''
            const title = link.text().trim() || $el.text().trim()
            
            if (!href || !title || title.length < 2) return
            
            const vidMatch = href.match(/program_download[_-]?(\d+)\.html/)
            if (!vidMatch) return
            
            const vid = vidMatch[1]

            // 查找图片
            let pic = appConfig.default_pic
            const img = $el.find('img').first()
            if (img.length > 0) {
                let imgSrc = img.attr('src') || img.attr('data-src') || ''
                if (imgSrc) {
                    if (imgSrc.startsWith('//')) {
                        imgSrc = 'https:' + imgSrc
                    } else if (!imgSrc.startsWith('http')) {
                        imgSrc = base_url + imgSrc
                    }
                    pic = imgSrc
                }
            }

            // 获取日期
            let remark = ''
            const dateSelectors = ['.date', '.time', '.pub-date', '.post-date', 'span[class*="date"]']
            for (const sel of dateSelectors) {
                const dateEl = $el.find(sel)
                if (dateEl.length > 0) {
                    remark = dateEl.text().trim()
                    break
                }
            }
            
            if (!remark) {
                // 尝试从文本中提取日期
                const text = $el.text()
                const dateMatch = text.match(/(\d{4}[-/]\d{2}[-/]\d{2})/)
                if (dateMatch) {
                    remark = dateMatch[1]
                }
            }

            videos.push({
                vod_id: vid,
                vod_name: title.replace(/^\d+\.\s*/, '').trim(),
                vod_pic: pic,
                vod_remarks: remark,
                ext: {
                    url: href,
                    vid: vid
                }
            })
        })

        // 如果videos为空，尝试另一种提取方式
        if (videos.length === 0) {
            $('a[href*="program_download"]').each((_, e) => {
                const href = $(e).attr('href') || ''
                const title = $(e).text().trim()
                const vidMatch = href.match(/program_download[_-]?(\d+)\.html/)
                if (vidMatch && title) {
                    videos.push({
                        vod_id: vidMatch[1],
                        vod_name: title,
                        vod_pic: appConfig.default_pic,
                        vod_remarks: '',
                        ext: {
                            url: href,
                            vid: vidMatch[1]
                        }
                    })
                }
            })
        }

        // 计算分页
        let pageCount = 1
        const paginationSelectors = ['.pagination', '.page', '.pages', '.pager']
        for (const sel of paginationSelectors) {
            const pagination = $(sel)
            if (pagination.length > 0) {
                const links = pagination.find('a')
                links.each((_, link) => {
                    const href = $(link).attr('href') || ''
                    const text = $(link).text().trim()
                    if (/^\d+$/.test(text)) {
                        const num = parseInt(text)
                        if (num > pageCount) pageCount = num
                    }
                    const pageMatch = href.match(/[?&]page=(\d+)/)
                    if (pageMatch) {
                        const num = parseInt(pageMatch[1])
                        if (num > pageCount) pageCount = num
                    }
                })
                break
            }
        }

        if (pageCount <= parseInt(page) && videos.length > 0) {
            pageCount = parseInt(page) + 1
        }

        // 构建筛选器
        let filter = []
        if (type !== 'home' && id !== 'home') {
            filter = [
                {
                    key: 'year',
                    name: '年份',
                    init: '',
                    value: getYears()
                },
                {
                    key: 'month',
                    name: '月份',
                    init: '',
                    value: getMonths()
                }
            ]
        }

        return jsonify({
            list: videos,
            page: parseInt(page),
            pagecount: pageCount,
            limit: 30,
            total: videos.length,
            filter: filter
        })
    } catch (error) {
        console.log('获取列表失败:', error)
        return jsonify({ list: [], page: parseInt(page), pagecount: 0, limit: 30, total: 0 })
    }
}

// ========== 获取详情 ==========
async function detailContent(ext) {
    ext = argsify(ext)
    const vid = ext.vid || ext.id
    const url = `${base_url}/program_download-${vid}.html`
    const html = await fetchPage(url)

    if (!html) {
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(html)

    // 提取标题
    let title = ''
    const titleTag = $('title')
    if (titleTag.length > 0) {
        title = titleTag.text().trim()
        title = title.replace(/[-|]\s*LoveQ.*$/, '').trim()
    }
    if (!title) {
        title = `节目${vid}`
    }

    // 提取发布日期和内容
    let pubDate = ''
    let content = ''

    // 从各种元素中提取
    const infoSelectors = ['.info', '.detail', '.content', '.program-info', '.meta']
    for (const sel of infoSelectors) {
        const el = $(sel)
        if (el.length > 0) {
            const text = el.text()
            
            // 提取日期
            const dateMatch = text.match(/(\d{4}[-/]\d{2}[-/]\d{2})/)
            if (dateMatch) {
                pubDate = dateMatch[1]
            }
            
            // 提取内容
            if (text.length > 20) {
                content = text.replace(/日期|时间|发布|作者/g, '').trim()
            }
            break
        }
    }

    // 从特定元素提取
    if (!pubDate) {
        const dateEl = $('.date, .time, .pub-date, .post-date, .time').first()
        if (dateEl.length > 0) {
            pubDate = dateEl.text().trim()
        }
    }

    // 从meta提取
    if (!content) {
        const desc = $('meta[name="description"]')
        if (desc.length > 0) {
            content = desc.attr('content') || ''
        }
    }

    // 清理内容
    content = content.replace(/^[\s\S]*?节目内容[：:]\s*/, '').trim()
    if (!content) {
        content = '暂无节目简介'
    }

    // 构建新标题
    let newTitle = title
    if (pubDate && content) {
        const dateFormatted = pubDate.replace('/', '-')
        const shortContent = content.length > 30 ? content.slice(0, 30) + '...' : content
        newTitle = `${dateFormatted} - ${shortContent}`
    }

    // 构建描述
    let desc = content
    if (pubDate) {
        desc = `📅 发布日期：${pubDate}\n\n📝 ${content}`
    }

    // ========== 提取音频链接 ==========
    const audioLinks = new Set()
    
    // 方法1: 直接匹配mp3链接
    const mp3Pattern = /https?:\/\/[^"'\s<>]+\.mp3[^"'\s<>]*/gi
    const mp3Matches = html.match(mp3Pattern) || []
    mp3Matches.forEach(link => {
        if (link.includes('loveq') || link.includes('dl2')) {
            audioLinks.add(link)
        }
    })

    // 方法2: 匹配音频源
    $('audio source, source[type="audio/mpeg"], source[type="audio/mp3"]').each((_, e) => {
        const src = $(e).attr('src') || ''
        if (src && src.includes('.mp3')) {
            const fullUrl = src.startsWith('http') ? src : (src.startsWith('//') ? 'https:' + src : base_url + src)
            audioLinks.add(fullUrl)
        }
    })

    // 方法3: 匹配audio标签
    $('audio').each((_, e) => {
        const src = $(e).attr('src') || ''
        if (src && src.includes('.mp3')) {
            const fullUrl = src.startsWith('http') ? src : (src.startsWith('//') ? 'https:' + src : base_url + src)
            audioLinks.add(fullUrl)
        }
    })

    // 方法4: 匹配链接中的音频文件
    $('a[href*=".mp3"]').each((_, e) => {
        const href = $(e).attr('href') || ''
        if (href && href.includes('.mp3')) {
            const fullUrl = href.startsWith('http') ? href : (href.startsWith('//') ? 'https:' + href : base_url + href)
            audioLinks.add(fullUrl)
        }
    })

    // 方法5: 从脚本或数据属性中提取
    const scriptMatch = html.match(/"audio"[^"]*"([^"]+\.mp3[^"]*)"/gi)
    if (scriptMatch) {
        scriptMatch.forEach(match => {
            const link = match.replace(/.*"([^"]+\.mp3[^"]*)".*/, '$1')
            if (link && link.includes('.')) {
                const fullUrl = link.startsWith('http') ? link : (link.startsWith('//') ? 'https:' + link : base_url + link)
                audioLinks.add(fullUrl)
            }
        })
    }

    // 清理和验证链接
    const validLinks = []
    audioLinks.forEach(link => {
        // 清理链接
        link = link.replace(/["']/g, '').trim()
        if (link && link.startsWith('http') && link.includes('.mp3')) {
            validLinks.push(link)
        }
    })

    // 构建播放URL
    let playUrl
    if (validLinks.length > 1) {
        playUrl = validLinks.map((link, index) => `音轨${index + 1}$${link}`).join('$$$')
    } else if (validLinks.length === 1) {
        playUrl = `音频$${validLinks[0]}`
    } else {
        playUrl = '暂无音频'
    }

    // 获取封面图
    let vodPic = appConfig.default_pic
    if (title.includes('得闲小叙') || title.includes('得闲')) {
        vodPic = appConfig.dexian_pic
    } else {
        const imgSelectors = ['.cover img', '.poster img', '.pic img', 'img[class*="cover"]', 'img[class*="poster"]']
        for (const sel of imgSelectors) {
            const img = $(sel).first()
            if (img.length > 0) {
                let src = img.attr('src') || img.attr('data-src') || ''
                if (src) {
                    if (src.startsWith('//')) src = 'https:' + src
                    else if (!src.startsWith('http')) src = base_url + src
                    vodPic = src
                    break
                }
            }
        }
    }

    return jsonify({
        list: [{
            vod_id: vid,
            vod_name: newTitle,
            vod_pic: vodPic,
            vod_content: desc,
            vod_play_from: '木凡的天空',
            vod_play_url: playUrl
        }]
    })
}

// ========== 获取音轨 ==========
async function getTracks(ext) {
    ext = argsify(ext)
    const playUrl = ext.play_url || ext.url
    
    if (!playUrl || playUrl === '暂无音频') {
        return jsonify({ list: [] })
    }

    let tracks = []
    
    if (playUrl.includes('$$$')) {
        const parts = playUrl.split('$$$')
        parts.forEach(part => {
            if (part.includes('$')) {
                const [name, url] = part.split('$')
                if (url) {
                    tracks.push({
                        name: name || '音频',
                        pan: '',
                        ext: { url: url }
                    })
                }
            }
        })
    } else if (playUrl.includes('$')) {
        const [name, url] = playUrl.split('$')
        if (url) {
            tracks.push({
                name: name || '音频',
                pan: '',
                ext: { url: url }
            })
        }
    } else {
        tracks.push({
            name: '音频',
            pan: '',
            ext: { url: playUrl }
        })
    }

    return jsonify({
        list: [{
            title: '默认分组',
            tracks: tracks
        }]
    })
}

// ========== 获取播放信息 ==========
async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url

    if (!url || url === '暂无音频') {
        return jsonify({ urls: [], headers: [] })
    }

    const headers = {
        'User-Agent': UA,
        'Referer': base_url + '/',
        'Origin': base_url,
        'Accept': 'audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*/*;q=0.5',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Range': 'bytes=0-',
        'Connection': 'keep-alive'
    }

    return jsonify({
        urls: [url],
        headers: [headers]
    })
}

// ========== 搜索功能 ==========
async function search(ext) {
    ext = argsify(ext)
    const keyword = encodeURIComponent(ext.text)
    const page = ext.page || 1

    const searchUrls = [
        `${base_url}/so-${page}-${keyword}.html`,
        `${base_url}/so.html?wd=${keyword}&page=${page}`,
        `${base_url}/search.php?keyword=${keyword}&page=${page}`,
        `${base_url}/program.html?keyword=${keyword}&page=${page}`
    ]

    let html = ''
    for (const url of searchUrls) {
        html = await fetchPage(url)
        if (html) break
    }

    if (!html) {
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(html)
    const seenIds = new Set()
    const results = []

    // 查找搜索结果
    $('a[href*="program_download"]').each((_, e) => {
        const href = $(e).attr('href') || ''
        const title = $(e).text().trim()
        
        if (!title || title.length < 2) return
        
        const vidMatch = href.match(/program_download[_-]?(\d+)\.html/)
        if (!vidMatch) return
        
        const vid = vidMatch[1]
        const searchText = ext.text.toLowerCase()
        
        if (title.toLowerCase().includes(searchText) || title.includes(ext.text)) {
            if (!seenIds.has(vid)) {
                seenIds.add(vid)
                results.push({
                    vod_id: vid,
                    vod_name: title,
                    vod_pic: appConfig.default_pic,
                    vod_remarks: '搜索结果',
                    ext: {
                        vid: vid,
                        url: href
                    }
                })
            }
        }
    })

    return jsonify({
        list: results
    })
}

// ========== 备用配置 ==========
function getDefaultConfig() {
    const defaultCategories = [
        { type_id: '1', type_name: '情感生活' },
        { type_id: '2', type_name: '音乐故事' },
        { type_id: '3', type_name: '心情随笔' }
    ]
    
    const filters = {}
    const years = getYears()
    const months = getMonths()
    
    defaultCategories.forEach(cat => {
        filters[cat.type_id] = [
            { key: 'year', name: '年份', value: years },
            { key: 'month', name: '月份', value: months }
        ]
    })

    const tabs = defaultCategories.map(cat => ({
        name: cat.type_name,
        ui: 1,
        ext: {
            id: cat.type_id,
            type: 'category'
        }
    }))

    tabs.unshift({
        name: '首页',
        ui: 1,
        ext: {
            id: 'home',
            type: 'home'
        }
    })

    appConfig.tabs = tabs

    return jsonify({
        class: defaultCategories,
        filters: filters
    })
}

// ========== 通用请求方法 ==========
async function fetchPage(url) {
    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': base_url + '/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        })
        return data
    } catch (e) {
        console.log(`请求失败: ${e.message}, URL: ${url}`)
        return ''
    }
}

// ========== 导出模块 ==========
module.exports = {
    getConfig,
    getCards,
    detailContent,
    getTracks,
    getPlayinfo,
    search
}