const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14'
const cheerio = createCheerio()

const appConfig = {
    ver: 1,
    title: 'LoveQ',
    site: 'https://www.loveq.cn',
    api: 'csp_loveq'
}

// ================= 本地 =================
async function getLocalInfo() {
    return jsonify({
        ver: 1,
        name: 'LoveQ(稳定版)',
        api: appConfig.api
    })
}

// ================= 配置 =================
async function getConfig() {

    // ✅ 按你原PY方式：固定分类（示例）
    return jsonify({
        ...appConfig,
        tabs: [
            { name: '情感', ui: 1, ext: { id: '1' } },
            { name: '故事', ui: 1, ext: { id: '2' } },
            { name: '电台', ui: 1, ext: { id: '3' } },
            { name: '音乐', ui: 1, ext: { id: '4' } },
            { name: '其他', ui: 1, ext: { id: '5' } }
        ]
    })
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

    return jsonify({
        list,
        page,
        pagecount: page + 1
    })
}

// ================= 线路（精简稳定版） =================
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

        // ✅ 主线路（稳定）
        tracks.push({
            name: `线路${i + 1}`,
            ext: { url: u }
        })

        // ✅ 备用线路（防SSL）
        tracks.push({
            name: `线路${i + 1}-备用`,
            ext: { url: u.replace('https://', 'http://') }
        })
    })

    if (tracks.length === 0) {
        tracks.push({
            name: '无资源',
            ext: { url: '' }
        })
    }

    return jsonify({
        list: [{
            title: '播放列表',
            tracks
        }]
    })
}

// ================= 播放（稳定版） =================
async function getPlayinfo(ext) {
    ext = argsify(ext)

    let url = ext.url

    return jsonify({
        parse: 0,
        urls: [url],
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