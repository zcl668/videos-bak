async function getLocalInfo() {
  const appConfig = {
    ver: 1,
    name: "木凡的天空(LoveQ)",
    api: "csp_loveq",
  }
  return jsonify(appConfig)
}
// by @木凡的天空
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
    tabs: [
        {
            name: '首页',
            ui: 1,
            ext: {
                id: 'home',
            },
        },
    ],
}

// 构建年份筛选器
function getYears() {
    const currentYear = new Date().getFullYear()
    let years = [{ n: '全部年份', v: '' }]
    for (let y = currentYear; y > 2002; y--) {
        years.push({ n: String(y), v: String(y) })
    }
    return years
}

// 构建月份筛选器
function getMonths() {
    let months = [{ n: '全部月份', v: '' }]
    for (let m = 1; m <= 12; m++) {
        months.push({ n: `${m}月`, v: String(m) })
    }
    return months
}

async function getConfig() {
    const html = await fetchPage(`${base_url}/program.html`)
    if (!html) {
        return jsonify({ class: [] })
    }

    const $ = cheerio.load(html)
    const categories = []
    const seen = new Set()

    // 查找所有分类链接
    $('a[href]').each((_, e) => {
        const href = $(e).attr('href')
        const title = $(e).text().trim()
        const catMatch = href.match(/program-cat(\d+)-p\d+\.html/)
        
        if (catMatch && title && !filterCategories.includes(title)) {
            const catId = catMatch[1]
            if (catId !== '0' && !seen.has(catId)) {
                seen.add(catId)
                categories.push({
                    type_name: title,
                    type_id: catId
                })
            }
        }
    })

    // 按ID排序
    categories.sort((a, b) => parseInt(a.type_id) - parseInt(b.type_id))

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
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, id, type = 'category', year = '', month = '' } = ext

    let url
    let html

    if (type === 'home' || id === 'home') {
        // 首页内容
        url = `${base_url}/program.html?page=${page}`
        html = await fetchPage(url)
    } else {
        // 分类内容
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

    // 查找节目列表
    $('a[href]').each((_, e) => {
        const href = $(e).attr('href')
        const title = $(e).text().trim()
        
        if (!href || !title || title.length < 2) return
        
        const vidMatch = href.match(/program_download-?(\d+)\.html/)
        if (!vidMatch) return
        
        const vid = vidMatch[1]

        // 查找图片
        let pic = appConfig.default_pic
        const img = $(e).find('img')
        if (img.length > 0) {
            let imgSrc = img.attr('src')
            if (imgSrc) {
                if (imgSrc.startsWith('http')) {
                    pic = imgSrc
                } else {
                    pic = base_url + imgSrc
                }
            }
        }

        // 获取备注（日期）
        let remark = ''
        const parent = $(e).closest('li') || $(e).closest('div[class*="item"], div[class*="entry"]')
        if (parent.length > 0) {
            const dateSpan = parent.find('span[class*="date"], span[class*="time"]')
            if (dateSpan.length > 0) {
                remark = dateSpan.text().trim()
            }
        }

        videos.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: remark,
            ext: {
                url: href,
                vid: vid
            }
        })
    })

    // 计算分页
    let pageCount = 1
    const pagination = $('div[class*="page"], div[class*="pagination"]')
    if (pagination.length > 0) {
        const pageLinks = pagination.find('a')
        if (pageLinks.length >= 2) {
            const lastPageText = $(pageLinks[pageLinks.length - 2]).text().trim()
            if (/^\d+$/.test(lastPageText)) {
                pageCount = parseInt(lastPageText)
            }
        }
        // 从href中提取页码
        pageLinks.each((_, link) => {
            const href = $(link).attr('href') || ''
            const pageMatch = href.match(/[?&]page=(\d+)/)
            if (pageMatch) {
                const pgNum = parseInt(pageMatch[1])
                if (pgNum > pageCount) {
                    pageCount = pgNum
                }
            }
        })
    }

    if (pageCount <= parseInt(page) && videos.length > 0) {
        pageCount = parseInt(page) + 1
    }

    // 构建筛选器（仅对分类有效）
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
}

async function detailContent(ext) {
    ext = argsify(ext)
    const vid = ext.vid || ext.id
    const url = `${base_url}/program_download-${vid}.html`
    const html = await fetchPage(url)

    if (!html) {
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(html)

    // 提取原标题
    let originalTitle = ''
    const titleTag = $('title')
    if (titleTag.length > 0) {
        originalTitle = titleTag.text().trim()
        originalTitle = originalTitle.replace(/[-|]\s*LoveQ.*$/, '').trim()
    }
    if (!originalTitle) {
        originalTitle = `节目${vid}`
    }

    // 提取发布日期和内容
    let pubDate = ''
    let content = ''

    const pdl1List = $('ul.pdl1')
    if (pdl1List.length > 0) {
        pdl1List.find('li').each((_, li) => {
            const liText = $(li).text().trim()
            
            if (liText.includes('发布日期：') || liText.includes('发布时间：')) {
                const dateMatch = liText.match(/(\d{4}[-/]\d{2}[-/]\d{2})/)
                if (dateMatch) {
                    pubDate = dateMatch[1]
                } else {
                    pubDate = liText.replace(/^(发布日期|发布时间)[：:]/, '').trim()
                }
            } else if (liText.includes('节目内容：') || liText.includes('内容简介：')) {
                content = liText.replace(/^(节目内容|内容简介)[：:]/, '').trim()
            }
        })
    }

    if (!content) {
        const metaDesc = $('meta[name="description"]')
        if (metaDesc.length > 0) {
            content = metaDesc.attr('content') || ''
        }
    }

    if (!content) {
        const contentDiv = $('div[class*="content"], div[class*="intro"], div[class*="desc"]')
        if (contentDiv.length > 0) {
            content = contentDiv.text().trim().slice(0, 500)
        }
    }

    if (content && /^\d{4}[-/]\d{2}[-/]\d{2}\s*$/.test(content)) {
        content = '暂无节目简介'
    }
    if (!content) {
        content = '暂无节目简介'
    }

    // 新标题格式：发布日期 + 节目内容
    let newTitle
    if (pubDate) {
        const formattedDate = pubDate.replace('/', '-')
        const contentPreview = content.length > 50 ? content.slice(0, 50) : content
        newTitle = `${formattedDate} - ${contentPreview}`
    } else {
        newTitle = originalTitle
    }

    // 构建描述
    let desc
    if (pubDate) {
        desc = `📅 发布日期：${pubDate}\n📝 ${content}`
    } else {
        desc = content
    }

    // 提取音频链接
    const audioLinks = new Set()
    
    // 匹配完整格式的音频链接
    const pattern = /https?:\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi
    const matches = html.match(pattern) || []
    matches.forEach(link => audioLinks.add(link))

    // 匹配协议相对路径
    const patternRel = /\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi
    const matchesRel = html.match(patternRel) || []
    matchesRel.forEach(link => {
        if (!link.startsWith('http')) {
            link = 'https:' + link
        }
        audioLinks.add(link)
    })

    // 从audio/source标签提取
    $('audio, source').each((_, e) => {
        const src = $(e).attr('src') || ''
        if (src.includes('dl2.loveq.cn')) {
            if (/\.mp3\?/.test(src) && src.includes('sign=') && src.includes('timestamp=')) {
                if (!src.startsWith('http') && !src.startsWith('//')) {
                    // 处理相对路径
                }
                audioLinks.add(src)
            }
        }
    })

    // 构建播放URL
    const validLinks = Array.from(audioLinks)
    let playUrl
    if (validLinks.length > 0) {
        if (validLinks.length > 1) {
            playUrl = validLinks.map(link => `LoveQ音频$${link}`).join('$$$')
        } else {
            playUrl = `LoveQ音频$${validLinks[0]}`
        }
    } else {
        playUrl = '暂无音频'
    }

    // 判断是否为得闲小叙
    let vodPic = appConfig.default_pic
    if (originalTitle.includes('得闲小叙') || originalTitle.includes('得闲')) {
        vodPic = appConfig.dexian_pic
    } else {
        const imgTag = $('img[class*="cover"], img[class*="poster"], img[class*="pic"]')
        if (imgTag.length > 0) {
            let imgSrc = imgTag.attr('src') || ''
            if (imgSrc.startsWith('http')) {
                vodPic = imgSrc
            } else if (imgSrc) {
                vodPic = base_url + imgSrc
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

async function getTracks(ext) {
    // LoveQ是音频站点，不需要多音轨
    ext = argsify(ext)
    const playUrl = ext.play_url || ext.url
    
    if (!playUrl || playUrl === '暂无音频') {
        return jsonify({ list: [] })
    }

    let tracks = []
    
    // 解析播放URL
    if (playUrl.includes('$$$')) {
        const parts = playUrl.split('$$$')
        parts.forEach((part, index) => {
            if (part.includes('$')) {
                const name = part.split('$')[0] || `音轨${index + 1}`
                const url = part.split('$')[1] || ''
                tracks.push({
                    name: name,
                    pan: '',
                    ext: {
                        url: url
                    }
                })
            }
        })
    } else if (playUrl.includes('$')) {
        const name = playUrl.split('$')[0] || '音频'
        const url = playUrl.split('$')[1] || ''
        tracks.push({
            name: name,
            pan: '',
            ext: {
                url: url
            }
        })
    } else {
        tracks.push({
            name: '音频',
            pan: '',
            ext: {
                url: playUrl
            }
        })
    }

    return jsonify({
        list: [{
            title: '默认分组',
            tracks: tracks
        }]
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url

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

async function search(ext) {
    ext = argsify(ext)
    let cards = []
    const keyword = encodeURIComponent(ext.text)
    const page = ext.page || 1

    // 尝试多个搜索URL
    const searchUrls = [
        `${base_url}/so-${page}-${keyword}.html`,
        `${base_url}/so.html?wd=${keyword}&page=${page}`,
        `${base_url}/search.php?keyword=${keyword}&page=${page}`
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

    $('a[href]').each((_, e) => {
        const href = $(e).attr('href') || ''
        const title = $(e).text().trim()
        
        if (!title || title.length < 2) return
        
        const vidMatch = href.match(/program_download-?(\d+)\.html/)
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

// 导出函数
module.exports = {
    getConfig,
    getCards,
    detailContent,
    getTracks,
    getPlayinfo,
    search
}