const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14'
const cheerio = createCheerio()

const appConfig = {
    ver: 1,
    title: 'LoveQ Pro',
    site: 'https://www.loveq.cn',
    api: 'csp_loveq',   // ✅ 必须有
}

// ================= 本地识别 =================
async function getLocalInfo() {
    return jsonify({
        ver: 1,
        name: 'LoveQ(本地)',
        api: appConfig.api
    })
}

// ================= 配置 =================
async function getConfig() {
    let config = { ...appConfig }
    config.tabs = await getTabs()
    return jsonify(config)
}

// ================= 分类 =================
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

// ================= 列表 =================
async function getCards(ext) {
    ext = argsify(ext)

    let { id, page = 1 } = ext

    let url = `${appConfig.site}/program.html?cat_id=${id}&page=${page}`

    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA }
    })

    const $ = cheerio.load(data)
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
            vod_remarks: '',
            ext: {
                url: `${appConfig.site}/program_download-${match[1]}.html`
            }
        })
    })

    return jsonify({ list })
}

// ================= 线路 =================
async function getTracks(ext) {
    ext = argsify(ext)

    const { data } = await $fetch.get(ext.url, {
        headers: { 'User-Agent': UA }
    })

    let tracks = []

    const reg = /https?:\/\/[^"' ]+\.mp3[^"' ]*/ig
    let matches = data.match(reg) || []

    let unique = [...new Set(matches)]

    unique.forEach((u, i) => {
        tracks.push({
            name: `线路${i + 1}`,
            ext: { url: u }
        })
    })

    return jsonify({
        list: [{
            title: '播放列表',
            tracks
        }]
    })
}

// ================= 播放 =================
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

// ================= 搜索 =================
async function search(ext) {
    ext = argsify(ext)

    let text = encodeURIComponent(ext.text)
    let url = `${appConfig.site}/so.html?wd=${text}`

    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA }
    })

    const $ = cheerio.load(data)
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

    return jsonify({ list })
}