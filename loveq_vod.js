const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14'
const cheerio = createCheerio()

const appConfig = {
    ver: 1,
    title: 'LoveQ Pro',
    site: 'https://www.loveq.cn',
}

// ================== 配置 ==================
async function getConfig() {
    let tabs = await getTabs()

    return jsonify({
        ...appConfig,
        tabs
    })
}

// ================== 分类 ==================
async function getTabs() {
    const { data } = await $fetch.get(`${appConfig.site}/program.html`, {
        headers: { 'User-Agent': UA }
    })

    const $ = cheerio.load(data)

    let tabs = []
    let seen = new Set()

    $('a').each((_, e) => {
        const href = $(e).attr('href') || ''
        const name = $(e).text().trim()

        const match = href.match(/program-cat(\d+)-p\d+\.html/)
        if (match && name && !seen.has(match[1])) {
            seen.add(match[1])
            tabs.push({
                name,
                ui: 1,
                ext: { id: match[1] }
            })
        }
    })

    return tabs
}

// ================== 列表 ==================
async function getCards(ext) {
    ext = argsify(ext)

    let { id, page = 1, filters = {} } = ext

    let url = `${appConfig.site}/program.html?cat_id=${id}&page=${page}`

    if (filters.year) url += `&year=${filters.year}`
    if (filters.month) url += `&month=${filters.month}`

    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA }
    })

    const $ = cheerio.load(data)
    let list = []

    $('a[href*="program_download"]').each((_, e) => {
        const href = $(e).attr('href')
        const title = $(e).text().trim()

        if (!title || title.length < 2) return

        const match = href.match(/program_download-?(\d+)\.html/)
        if (!match) return

        let pic = 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg'

        const img = $(e).find('img').attr('src')
        if (img) {
            pic = img.startsWith('http') ? img : appConfig.site + img
        }

        list.push({
            vod_id: match[1],
            vod_name: title,
            vod_pic: pic,
            vod_remarks: '',
            ext: {
                url: `${appConfig.site}/program_download-${match[1]}.html`
            }
        })
    })

    // ===== 分页判断 =====
    let hasMore = $('.page a:contains("下一页")').length > 0

    return jsonify({
        list,
        page,
        pagecount: hasMore ? page + 1 : page,
        limit: 20,
        total: list.length * (hasMore ? (page + 1) : page),

        // ===== 筛选 =====
        filter: [
            {
                key: 'year',
                name: '年份',
                init: '',
                value: [
                    { n: '全部', v: '' },
                    { n: '2026', v: '2026' },
                    { n: '2025', v: '2025' },
                    { n: '2024', v: '2024' },
                    { n: '2023', v: '2023' }
                ]
            },
            {
                key: 'month',
                name: '月份',
                init: '',
                value: [
                    { n: '全部', v: '' },
                    { n: '01', v: '01' },
                    { n: '02', v: '02' },
                    { n: '03', v: '03' },
                    { n: '04', v: '04' },
                    { n: '05', v: '05' },
                    { n: '06', v: '06' },
                    { n: '07', v: '07' },
                    { n: '08', v: '08' },
                    { n: '09', v: '09' },
                    { n: '10', v: '10' },
                    { n: '11', v: '11' },
                    { n: '12', v: '12' }
                ]
            }
        ]
    })
}

// ================== 详情 / 线路 ==================
async function getTracks(ext) {
    ext = argsify(ext)
    const url = ext.url

    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA }
    })

    let tracks = []

    // ===== 主解析 =====
    const reg = /https?:\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/ig
    let matches = data.match(reg) || []

    // ===== 备用解析 =====
    if (matches.length === 0) {
        const reg2 = /https?:\/\/[^"' ]+\.mp3[^"' ]*/ig
        matches = data.match(reg2) || []
    }

    let unique = [...new Set(matches)]

    unique.forEach((u, i) => {
        tracks.push({
            name: `线路${i + 1}`,
            pan: '',
            ext: { url: u }
        })
    })

    // ===== 防空 =====
    if (tracks.length === 0) {
        tracks.push({
            name: '无资源',
            ext: { url: '' }
        })
    }

    return jsonify({
        list: [{
            title: 'LoveQ音频',
            tracks
        }]
    })
}

// ================== 播放 ==================
async function getPlayinfo(ext) {
    ext = argsify(ext)

    return jsonify({
        urls: [ext.url],
        headers: [{
            'User-Agent': UA,
            'Referer': appConfig.site
        }]
    })
}

// ================== 搜索 ==================
async function search(ext) {
    ext = argsify(ext)

    let text = encodeURIComponent(ext.text)
    let page = ext.page || 1

    const urls = [
        `${appConfig.site}/so-${page}-${text}.html`,
        `${appConfig.site}/so.html?wd=${text}&page=${page}`
    ]

    let html = ''

    for (let u of urls) {
        try {
            const res = await $fetch.get(u, {
                headers: { 'User-Agent': UA }
            })
            if (res.data && res.data.length > 1000) {
                html = res.data
                break
            }
        } catch (e) {}
    }

    const $ = cheerio.load(html)
    let list = []

    $('a[href*="program_download"]').each((_, e) => {
        const href = $(e).attr('href')
        const title = $(e).text().trim()

        const match = href.match(/program_download-?(\d+)/)
        if (!match) return

        list.push({
            vod_id: match[1],
            vod_name: title,
            vod_pic: '',
            vod_remarks: '搜索结果',
            ext: {
                url: `${appConfig.site}/program_download-${match[1]}.html`
            }
        })
    })

    return jsonify({
        list,
        page,
        pagecount: page + 1
    })
}