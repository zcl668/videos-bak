// -*- coding: utf-8 -*-
// 基于missav.js模板重写的LoveQ音频爬虫

async function getLocalInfo() {
  const appConfig = {
    ver: 1,
    name: "LoveQ音频(本地)",
    api: "csp_loveq_local",
  }
  return jsonify(appConfig)
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// 配置参数
let $config = argsify($config_str)

const appConfig = {
    ver: 1,
    title: 'LoveQ音频',
    site: 'https://www.loveq.cn',
    default_pic: 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg',
    dexian_pic: 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg',
    // 需要过滤的分类
    filter_categories: ["盛世乾坤", "一些事一些情", "一些事一些情精华剪辑"],
    tabs: [],
}

// ========== 封装请求函数 ==========
async function request(url, options = {}) {
    const defaultOptions = {
        headers: {
            'User-Agent': UA,
            'Referer': appConfig.site + '/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Connection': 'keep-alive',
        },
        timeout: 15000,
    }
    
    const finalOptions = { ...defaultOptions, ...options }
    finalOptions.headers = { ...defaultOptions.headers, ...(options.headers || {}) }
    
    try {
        const response = await fetch(url, finalOptions)
        const text = await response.text()
        return { data: text }
    } catch (e) {
        console.log('请求失败:', url, e.message)
        return { data: '' }
    }
}

// ========== 获取配置（动态获取分类） ==========
async function getConfig() {
    let config = { ...appConfig };
    
    // 从网站动态获取分类
    try {
        const url = `${appConfig.site}/program.html`
        const { data } = await request(url)
        
        if (!data) {
            throw new Error('无法获取页面数据')
        }
        
        const $ = createCheerio().load(data)
        let categories = []
        let seen = new Set()
        
        // 查找所有分类链接
        $('a').each((_, a) => {
            const href = $(a).attr('href')
            const title = $(a).text().trim()
            
            if (!href || !title) return
            
            // 匹配分类URL格式: program-cat{id}-p1.html
            const catMatch = href.match(/program-cat(\d+)-p\d+\.html/)
            if (catMatch && title && !appConfig.filter_categories.includes(title)) {
                const catId = catMatch[1]
                if (catId !== '0' && !seen.has(catId)) {
                    seen.add(catId)
                    categories.push({
                        name: title,
                        ui: 1,
                        ext: {
                            cat_id: catId,
                        },
                    })
                }
            }
        })
        
        // 按ID排序
        categories.sort((a, b) => parseInt(a.ext.cat_id) - parseInt(b.ext.cat_id))
        
        // 如果没有获取到分类，使用默认分类
        if (categories.length === 0) {
            categories = [
                {
                    name: '全部节目',
                    ui: 1,
                    ext: {
                        cat_id: '1',
                    },
                },
                {
                    name: '得闲小叙',
                    ui: 1,
                    ext: {
                        cat_id: '2',
                    },
                },
            ]
        }
        
        config.tabs = categories
        
    } catch (e) {
        console.log('获取分类失败:', e.message)
        // 如果动态获取失败，使用默认分类
        config.tabs = [
            {
                name: '全部节目',
                ui: 1,
                ext: {
                    cat_id: '1',
                },
            },
            {
                name: '得闲小叙',
                ui: 1,
                ext: {
                    cat_id: '2',
                },
            },
        ]
    }
    
    return jsonify(config)
}

// ========== 分类内容 ==========
async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, cat_id = '1', filters = {} } = ext

    // 构建请求参数
    let params = new URLSearchParams()
    params.append('cat_id', cat_id)
    params.append('page', page)

    if (filters.year && filters.year !== '') {
        params.append('year', filters.year)
    }
    if (filters.month && filters.month !== '') {
        params.append('month', filters.month)
    }

    let url = `${appConfig.site}/program.html?${params.toString()}`
    
    console.log('Requesting URL:', url)

    const { data } = await request(url)
    
    if (!data) {
        return jsonify({
            list: [],
            page: parseInt(page),
            pagecount: 1,
            total: 0,
            filter: [],
        })
    }

    const $ = createCheerio().load(data)
    
    // 查找节目列表
    $('a[href*="program_download"]').each((_, a) => {
        const href = $(a).attr('href')
        const title = $(a).text().trim()
        
        if (!title || title.length < 2) {
            return
        }

        // 提取节目ID
        const vidMatch = href.match(/program_download-?(\d+)\.html/)
        if (!vidMatch) {
            return
        }
        const vid = vidMatch[1]

        // 查找图片
        let pic = appConfig.default_pic
        let imgTag = $(a).find('img')
        if (imgTag.length === 0) {
            const parent = $(a).closest('li, div[class*="item"], div[class*="entry"]')
            if (parent.length > 0) {
                imgTag = parent.find('img')
            }
        }
        
        if (imgTag.length > 0) {
            let imgSrc = imgTag.attr('src') || imgTag.attr('data-src')
            if (imgSrc) {
                if (imgSrc.startsWith('http')) {
                    pic = imgSrc
                } else if (imgSrc.startsWith('/')) {
                    pic = appConfig.site + imgSrc
                } else {
                    try {
                        pic = new URL(imgSrc, appConfig.site).href
                    } catch (e) {
                        pic = appConfig.default_pic
                    }
                }
            }
        }

        // 获取备注信息
        let remark = ''
        const parent = $(a).closest('li') || $(a).closest('div[class*="item"], div[class*="entry"]')
        if (parent.length > 0) {
            const dateSpan = parent.find('span[class*="date"], span[class*="time"], .date, .time')
            if (dateSpan.length > 0) {
                remark = dateSpan.text().trim()
            }
        }

        cards.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: remark,
            ext: {
                vid: vid,
                url: href,
            },
        })
    })

    // 计算分页
    let pageCount = 1
    const pagination = $('div[class*="page"], div[class*="pagination"], .pages')
    if (pagination.length > 0) {
        const pageLinks = pagination.find('a')
        if (pageLinks.length > 0) {
            let maxPage = 1
            pageLinks.each((_, link) => {
                const href = $(link).attr('href')
                if (href) {
                    const pageMatch = href.match(/[?&]page=(\d+)/)
                    if (pageMatch) {
                        const pgNum = parseInt(pageMatch[1])
                        if (pgNum > maxPage) {
                            maxPage = pgNum
                        }
                    }
                }
                const text = $(link).text().trim()
                if (text.match(/^\d+$/)) {
                    const pgNum = parseInt(text)
                    if (pgNum > maxPage) {
                        maxPage = pgNum
                    }
                }
            })
            pageCount = maxPage
        }
    }

    if (pageCount <= parseInt(page) && cards.length > 0) {
        pageCount = parseInt(page) + 1
    }

    // 构建筛选器
    const currentYear = new Date().getFullYear()
    const years = [{ n: '全部年份', v: '' }]
    for (let y = currentYear; y > 2002; y--) {
        years.push({ n: String(y), v: String(y) })
    }

    const months = [{ n: '全部月份', v: '' }]
    for (let m = 1; m <= 12; m++) {
        months.push({ n: m + '月', v: String(m) })
    }

    return jsonify({
        list: cards,
        page: parseInt(page),
        pagecount: pageCount,
        total: cards.length,
        filter: [
            {
                key: 'year',
                name: '年份',
                init: '',
                value: years,
            },
            {
                key: 'month',
                name: '月份',
                init: '',
                value: months,
            },
        ],
    })
}

// ========== 节目详情 ==========
async function getTracks(ext) {
    ext = argsify(ext)
    let vid = ext.vid || ext.id
    
    if (!vid) {
        return jsonify({ list: [], tracks: [] })
    }
    
    let url = `${appConfig.site}/program_download-${vid}.html`

    const { data } = await request(url)
    
    if (!data) {
        return jsonify({ list: [], tracks: [] })
    }

    const $ = createCheerio().load(data)

    // 提取原标题
    let originalTitle = ''
    const titleTag = $('title')
    if (titleTag.length > 0) {
        originalTitle = titleTag.text().trim().replace(/[-|]\s*LoveQ.*$/, '').trim()
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
        if (metaDesc.length > 0 && metaDesc.attr('content')) {
            content = metaDesc.attr('content')
        }
    }

    if (!content) {
        const contentDiv = $('div[class*="content"], div[class*="intro"], div[class*="desc"]')
        if (contentDiv.length > 0) {
            content = contentDiv.text().trim().slice(0, 500)
        }
    }

    if (content && content.match(/^\d{4}[-/]\d{2}[-/]\d{2}\s*$/)) {
        content = '暂无节目简介'
    } else if (!content) {
        content = '暂无节目简介'
    }

    // 构建新标题
    let newTitle = originalTitle
    if (pubDate) {
        const formattedDate = pubDate.replace('/', '-')
        const contentPreview = content.length > 50 ? content.slice(0, 50) : content
        newTitle = `${formattedDate} - ${contentPreview}`
    }

    // 构建描述
    let desc = content
    if (pubDate) {
        desc = `📅 发布日期：${pubDate}\n📝 ${content}`
    }

    // ========== 提取音频链接 ==========
    let audioLinks = []

    // 匹配完整格式的音频链接
    const pattern = /https?:\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi
    let matches = data.match(pattern) || []
    audioLinks = audioLinks.concat(matches)

    // 匹配协议相对路径
    const patternRel = /\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi
    let matchesRel = data.match(patternRel) || []
    audioLinks = audioLinks.concat(matchesRel)

    // 从audio/source标签提取
    $('audio, source').each((_, tag) => {
        const src = $(tag).attr('src')
        if (src && src.includes('dl2.loveq.cn')) {
            if (src.match(/\.mp3\?/) && src.includes('sign=') && src.includes('timestamp=')) {
                audioLinks.push(src)
            }
        }
    })

    // 去重并完善链接
    let validLinks = []
    let seen = new Set()
    
    for (let link of audioLinks) {
        if (seen.has(link)) continue
        seen.add(link)
        
        if (link.startsWith('//')) {
            link = 'https:' + link
        }
        validLinks.push(link)
    }

    // 构建音轨列表
    let tracks = []
    
    if (validLinks.length > 0) {
        validLinks.forEach((link, index) => {
            tracks.push({
                name: `音频 ${index + 1}`,
                pan: '',
                ext: {
                    url: link,
                }
            })
        })
        tracks.unshift({
            name: '自动',
            pan: '',
            ext: {
                url: validLinks[0],
            }
        })
    }

    // 判断是否为得闲小叙
    let vodPic = appConfig.default_pic
    if (originalTitle.includes('得闲小叙') || originalTitle.includes('得闲')) {
        vodPic = appConfig.dexian_pic
    } else {
        const imgTag = $('img[class*="cover"], img[class*="poster"], img[class*="pic"]')
        if (imgTag.length > 0 && imgTag.attr('src')) {
            let imgSrc = imgTag.attr('src')
            if (imgSrc.startsWith('http')) {
                vodPic = imgSrc
            } else {
                try {
                    vodPic = new URL(imgSrc, appConfig.site).href
                } catch (e) {
                    vodPic = appConfig.default_pic
                }
            }
        }
    }

    // 构建节目信息
    let vodInfo = {
        vod_id: vid,
        vod_name: newTitle,
        vod_pic: vodPic,
        vod_content: desc,
        vod_play_from: '木凡的天空',
        vod_play_url: validLinks.length > 0 ? validLinks.join('$$$') : '暂无音频',
    }

    return jsonify({
        list: [vodInfo],
        tracks: [
            {
                title: '音频播放',
                tracks: tracks,
            },
        ],
    })
}

// ========== 播放器 ==========
async function getPlayinfo(ext) {
    ext = argsify(ext)
    let url = ext.url

    if (!url) {
        return jsonify({ urls: [], headers: [] })
    }

    // 处理多音轨
    if (url.includes('$$$')) {
        const parts = url.split('$$$')
        url = parts[0]
    }

    const headers = {
        'User-Agent': UA,
        'Referer': appConfig.site + '/',
        'Origin': appConfig.site,
        'Accept': 'audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*/*;q=0.5',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Range': 'bytes=0-',
        'Connection': 'keep-alive',
    }

    return jsonify({
        urls: [url],
        headers: [headers],
    })
}

// ========== 搜索 ==========
async function search(ext) {
    ext = argsify(ext)
    let cards = []

    let text = encodeURIComponent(ext.text)
    let page = ext.page || 1
    
    // 尝试多种搜索URL
    let searchUrls = [
        `${appConfig.site}/so-${page}-${text}.html`,
        `${appConfig.site}/so.html?wd=${text}&page=${page}`,
        `${appConfig.site}/search.php?keyword=${text}&page=${page}`,
    ]

    let data = ''
    for (let url of searchUrls) {
        try {
            const result = await request(url)
            if (result.data) {
                data = result.data
                break
            }
        } catch (e) {
            continue
        }
    }

    if (!data) {
        return jsonify({ list: [] })
    }

    const $ = createCheerio().load(data)
    let seenIds = new Set()

    $('a[href*="program_download"]').each((_, a) => {
        const href = $(a).attr('href')
        const title = $(a).text().trim()
        
        if (!title || title.length < 2) {
            return
        }

        const vidMatch = href.match(/program_download-?(\d+)\.html/)
        if (!vidMatch) {
            return
        }
        const vid = vidMatch[1]

        const keyword = ext.text
        if (title.toLowerCase().includes(keyword.toLowerCase()) || title.includes(keyword)) {
            if (!seenIds.has(vid)) {
                seenIds.add(vid)
                cards.push({
                    vod_id: vid,
                    vod_name: title,
                    vod_pic: appConfig.default_pic,
                    vod_remarks: '搜索结果',
                    ext: {
                        vid: vid,
                        url: href,
                    },
                })
            }
        }
    })

    return jsonify({
        list: cards,
    })
}