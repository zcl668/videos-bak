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
        name: 'LoveQ(还原版)',
        api: appConfig.api
    })
}

// ================= 配置（带图片分类） =================
async function getConfig() {

    return jsonify({
        ...appConfig,
        tabs: [
            {
                name: '情感',
                ui: 1,
                ext: { id: '1' },
                style: { type: 'rect', ratio: 1.33 },
                pic: 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq/1.jpg'
            },
            {
                name: '故事',
                ui: 1,
                ext: { id: '2' },
                style: { type: 'rect', ratio: 1.33 },
                pic: 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq/2.jpg'
            },
            {
                name: '电台',
                ui: 1,
                ext: { id: '3' },
                style: { type: 'rect', ratio: 1.33 },
                pic: 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq/3.jpg'
            },
            {
                name: '音乐',
                ui: 1,
                ext: { id: '4' },
                style: { type: 'rect', ratio: 1.33 },
                pic: 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq/4.jpg'
            },
            {
                name: '其他',
                ui: 1,
                ext: { id: '5' },
                style: { type: 'rect', ratio: 1.33 },
                pic: 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq/5.jpg'
            }
        ]
    })
}

// ================= 列表（带图片+过滤） =================
async function getCards(ext) {
    ext = argsify(ext)

    let { id, page = 1, filters = {} } = ext

    let url = `${appConfig.site}/program.html?cat_id=${id}&page=${page}`

    // ✅ 过滤（还原 PY）
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

        if (!title) return

        const match = href.match(/program_download-?(\d+)/)
        if (!match) return

        // ✅ 图片（还原PY）
        let pic = ''

        let img = $(e).find('img').attr('src')
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

    return jsonify({
        list,
        page,
        pagecount: page + 1,

        // ✅ 过滤 UI
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

// ================= 线路（只保留稳定2条） =================
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

        // ✅ 主线路
        tracks.push({
            name: `线路${i + 1}`,
            ext: { url: u }
        })

        // ✅ 备用（防SSL）
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

// ================= 播放 =================
async function getPlayinfo(ext) {
    ext = argsify(ext)

    return jsonify({
        parse: 0,
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