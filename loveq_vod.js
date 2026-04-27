const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const cheerio = createCheerio()

const appConfig = {
    ver: 1,
    title: 'LoveQ',
    site: 'https://www.loveq.cn',
    api: 'csp_loveq'
}

// 默认图片
const defaultPic = 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg'
const dexianPic = 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg'

// 需要过滤的分类（与PY一致）
const filterCategories = ["盛世乾坤", "一些事一些情", "一些事一些情精华剪辑"]

// ================= 本地 =================
async function getLocalInfo() {
    return jsonify({
        ver: 1,
        name: 'LoveQ(还原版)',
        api: appConfig.api
    })
}

// ================= 首页分类（动态获取，带筛选器） =================
async function getConfig() {
    const url = `${appConfig.site}/program.html`
    const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } })
    const $ = cheerio.load(data)
    
    const categories = []
    const seen = new Set()
    
    // 查找所有分类链接
    $('a[href*="program-cat"]').each((_, e) => {
        const href = $(e).attr('href')
        const title = $(e).text().trim()
        
        const match = href.match(/program-cat(\d+)-p\d+\.html/)
        if (match && title && !filterCategories.includes(title)) {
            const catId = match[1]
            if (catId !== '0' && !seen.has(catId)) {
                seen.add(catId)
                categories.push({
                    name: title,
                    ext: { id: catId },
                    ui: 1,
                    style: { type: 'rect', ratio: 1.33 },
                    pic: defaultPic
                })
            }
        }
    })
    
    // 按ID排序
    categories.sort((a, b) => parseInt(a.ext.id) - parseInt(b.ext.id))
    
    // 构建年份筛选器（2026到2003）
    const currentYear = new Date().getFullYear()
    const years = [{ n: '全部年份', v: '' }]
    for (let y = currentYear; y >= 2003; y--) {
        years.push({ n: String(y), v: String(y) })
    }
    
    // 月份筛选器
    const months = [{ n: '全部月份', v: '' }]
    for (let m = 1; m <= 12; m++) {
        months.push({ n: `${m}月`, v: String(m).padStart(2, '0') })
    }
    
    // 为每个分类配置筛选器（PY模式：每个分类独立筛选器）
    const filters = [
        { key: 'year', name: '年份', value: years, init: '' },
        { key: 'month', name: '月份', value: months, init: '' }
    ]
    
    return jsonify({
        ...appConfig,
        tabs: categories,
        filters: filters  // 全局筛选器，JS环境通常用全局
    })
}

// ================= 分类内容（支持年份/月份筛选） =================
async function getCards(ext) {
    ext = argsify(ext)
    
    let { id, page = 1, filters = {} } = ext
    
    // 构建请求参数（与PY完全一致）
    const params = { cat_id: id, page: page }
    if (filters.year) params.year = filters.year
    if (filters.month) params.month = filters.month
    
    const url = `${appConfig.site}/program.html`
    const { data } = await $fetch.get(url, { 
        params: params,
        headers: { 'User-Agent': UA }
    })
    
    const $ = cheerio.load(data)
    const list = []
    
    // 查找节目列表（匹配 program_download-数字.html）
    $('a[href*="program_download"]').each((_, e) => {
        const href = $(e).attr('href')
        let title = $(e).text().trim()
        
        if (!title || title.length < 2) return
        
        const match = href.match(/program_download-?(\d+)\.html/)
        if (!match) return
        
        const vid = match[1]
        
        // 提取图片
        let pic = defaultPic
        const img = $(e).find('img')
        if (img.length && img.attr('src')) {
            let imgSrc = img.attr('src')
            pic = imgSrc.startsWith('http') ? imgSrc : appConfig.site + imgSrc
        }
        
        // 提取备注（日期）
        let remark = ''
        const parent = $(e).closest('li, div[class*="item"], div[class*="entry"]')
        if (parent.length) {
            const dateSpan = parent.find('span[class*="date"], span[class*="time"]')
            if (dateSpan.length) {
                remark = dateSpan.text().trim()
            }
        }
        
        list.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: remark,
            ext: { url: `${appConfig.site}/program_download-${vid}.html` }
        })
    })
    
    // 解析分页（与PY逻辑一致）
    let pageCount = page + 1  // 默认下一页
    
    const pagination = $('div[class*="page"], div[class*="pagination"]')
    if (pagination.length) {
        const pageLinks = pagination.find('a')
        if (pageLinks.length >= 2) {
            const lastPageText = $(pageLinks[pageLinks.length - 2]).text().trim()
            if (/^\d+$/.test(lastPageText)) {
                pageCount = parseInt(lastPageText)
            }
        } else if (pageLinks.length === 1) {
            const singlePageText = $(pageLinks[0]).text().trim()
            if (/^\d+$/.test(singlePageText)) {
                pageCount = parseInt(singlePageText)
            }
        }
        
        // 从href中尝试提取最大页码
        pageLinks.each((_, link) => {
            const href = $(link).attr('href') || ''
            const pageMatch = href.match(/[?&]page=(\d+)/)
            if (pageMatch) {
                const pgNum = parseInt(pageMatch[1])
                if (pgNum > pageCount) pageCount = pgNum
            }
        })
    }
    
    if (pageCount <= page && list.length > 0) {
        pageCount = page + 1
    }
    
    return jsonify({
        list,
        page: parseInt(page),
        pagecount: pageCount,
        limit: 30,
        total: list.length
    })
}

// ================= 详情（提取音频链接，带新标题格式） =================
async function getTracks(ext) {
    ext = argsify(ext)
    
    const { data } = await $fetch.get(ext.url, {
        headers: { 'User-Agent': UA }
    })
    
    const $ = cheerio.load(data)
    
    // 提取原标题
    let originalTitle = $('title').text().trim() || ''
    originalTitle = originalTitle.replace(/[-|]\s*LoveQ.*$/, '').trim()
    if (!originalTitle) originalTitle = `节目${ext.url.match(/program_download-?(\d+)/)?.[1] || '未知'}`
    
    // 提取发布日期和内容
    let pubDate = ''
    let content = ''
    
    // 从 pdl1 列表提取
    $('ul.pdl1 li').each((_, li) => {
        const liText = $(li).text().trim()
        
        if (liText.includes('发布日期：') || liText.includes('发布时间：')) {
            const dateMatch = liText.match(/(\d{4}[-\/]\d{2}[-\/]\d{2})/)
            if (dateMatch) {
                pubDate = dateMatch[1]
            } else {
                pubDate = liText.replace(/^(发布日期|发布时间)[：:]/, '').trim()
            }
        } else if (liText.includes('节目内容：') || liText.includes('内容简介：')) {
            content = liText.replace(/^(节目内容|内容简介)[：:]/, '').trim()
        }
    })
    
    // 从 meta description 获取内容
    if (!content) {
        const metaDesc = $('meta[name="description"]').attr('content')
        if (metaDesc) content = metaDesc
    }
    
    // 从内容区域获取
    if (!content) {
        const contentDiv = $('div[class*="content"], div[class*="intro"], div[class*="desc"]')
        if (contentDiv.length) {
            content = contentDiv.text().trim().substring(0, 500)
        }
    }
    
    if (content && /^\d{4}[-\/]\d{2}[-\/]\d{2}\s*$/.test(content)) {
        content = '暂无节目简介'
    }
    if (!content) content = '暂无节目简介'
    
    // 新标题：发布日期 + 节目内容（与PY完全一致）
    let newTitle
    if (pubDate) {
        const formattedDate = pubDate.replace(/\//g, '-')
        const contentPreview = content.length > 50 ? content.substring(0, 50) : content
        newTitle = `${formattedDate} - ${contentPreview}`
    } else {
        newTitle = originalTitle
    }
    
    // 描述信息
    const desc = pubDate ? `📅 发布日期：${pubDate}\n📝 ${content}` : content
    
    // ========== 提取音频链接（完全按照PY的正则） ==========
    const audioLinks = []
    
    // 匹配完整格式的音频链接（忽略大小写）
    // 格式: https://dl2.loveq.cn:8090/live/program/2017/1500229358423534874.mp3?sign=xxx&timestamp=xxx
    const pattern = /https?:\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi
    let matches = data.match(pattern) || []
    audioLinks.push(...matches)
    
    // 匹配协议相对路径的版本
    const patternRel = /\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi
    const matchesRel = data.match(patternRel) || []
    audioLinks.push(...matchesRel)
    
    // 从 audio 或 source 标签中提取
    $('audio, source').each((_, tag) => {
        const src = $(tag).attr('src') || ''
        if (src && src.includes('dl2.loveq.cn')) {
            if (/\.mp3\?/i.test(src) && src.includes('sign=') && src.includes('timestamp=')) {
                audioLinks.push(src)
            }
        }
    })
    
    // 去重并完善链接
    const seen = new Set()
    const validLinks = []
    
    for (let link of audioLinks) {
        if (seen.has(link)) continue
        seen.add(link)
        
        // 完善协议相对路径
        if (link.startsWith('//')) {
            link = 'https:' + link
        }
        
        validLinks.push(link)
    }
    
    // 构建播放线路（与PY的 detailContent 逻辑一致）
    let playUrl = ''
    if (validLinks.length > 0) {
        if (validLinks.length > 1) {
            playUrl = validLinks.map((link, i) => `LoveQ音频$${link}`).join('$$$')
        } else {
            playUrl = `LoveQ音频$${validLinks[0]}`
        }
    } else {
        playUrl = '暂无音频'
    }
    
    // 判断是否为得闲小叙，设置特定图片
    let vodPic = defaultPic
    if (originalTitle.includes('得闲小叙') || originalTitle.includes('得闲')) {
        vodPic = dexianPic
    } else {
        const imgTag = $('img[class*="cover"], img[class*="poster"], img[class*="pic"]')
        if (imgTag.length && imgTag.attr('src')) {
            let imgSrc = imgTag.attr('src')
            vodPic = imgSrc.startsWith('http') ? imgSrc : appConfig.site + imgSrc
        }
    }
    
    // 返回格式：JS环境下 tracks 返回供播放器使用
    const tracks = validLinks.map((link, idx) => ({
        name: `线路${idx + 1}`,
        ext: { url: link, title: newTitle, desc: desc, pic: vodPic }
    }))
    
    if (tracks.length === 0) {
        tracks.push({ name: '无资源', ext: { url: '' } })
    }
    
    return jsonify({
        list: [{
            title: '播放列表',
            tracks
        }],
        // 额外返回详情信息（供播放界面使用）
        detail: {
            vod_id: ext.url.match(/program_download-?(\d+)/)?.[1] || '',
            vod_name: newTitle,
            vod_pic: vodPic,
            vod_content: desc
        }
    })
}

// ================= 播放 =================
async function getPlayinfo(ext) {
    ext = argsify(ext)
    
    const playHeaders = {
        'User-Agent': UA,
        'Referer': appConfig.site + '/',
        'Origin': appConfig.site,
        'Accept': 'audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*/*;q=0.5',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Range': 'bytes=0-',
        'Connection': 'keep-alive'
    }
    
    return jsonify({
        parse: 0,
        urls: [ext.url],
        headers: [playHeaders]
    })
}

// ================= 搜索（完全按PY逻辑） =================
async function search(ext) {
    ext = argsify(ext)
    
    const keyword = encodeURIComponent(ext.text)
    const pg = ext.page || 1
    
    // 尝试多个搜索URL（与PY一致）
    const searchUrls = [
        `${appConfig.site}/so-${pg}-${keyword}.html`,
        `${appConfig.site}/so.html?wd=${keyword}&page=${pg}`,
        `${appConfig.site}/search.php?keyword=${keyword}&page=${pg}`
    ]
    
    let data = null
    for (const url of searchUrls) {
        try {
            const res = await $fetch.get(url, { headers: { 'User-Agent': UA } })
            if (res.data) {
                data = res.data
                break
            }
        } catch (e) {
            continue
        }
    }
    
    if (!data) return jsonify({ list: [] })
    
    const $ = cheerio.load(data)
    const list = []
    const seenIds = new Set()
    
    $('a[href*="program_download"]').each((_, e) => {
        const href = $(e).attr('href')
        const title = $(e).text().trim()
        
        if (!title || title.length < 2) return
        
        const match = href.match(/program_download-?(\d+)\.html/)
        if (!match) return
        
        const vid = match[1]
        const searchText = ext.text.toLowerCase()
        
        if (searchText === '' || title.toLowerCase().includes(searchText) || title.includes(ext.text)) {
            if (!seenIds.has(vid)) {
                seenIds.add(vid)
                list.push({
                    vod_id: vid,
                    vod_name: title,
                    vod_pic: defaultPic,
                    vod_remarks: '搜索结果',
                    ext: { url: `${appConfig.site}/program_download-${vid}.html` }
                })
            }
        }
    })
    
    return jsonify({ list })
}