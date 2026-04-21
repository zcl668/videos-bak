async function getLocalInfo() {
  const appConfig = {
    ver: 1,
    name: "木凡的天空(LoveQ)",
    api: "csp_loveq",
  }
  return jsonify(appConfig)
}

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1'
const cheerio = createCheerio()

let $config = argsify($config_str)

const appConfig = {
  ver: 1,
  title: 'LoveQ',
  site: 'https://www.loveq.cn',
  defaultPic: 'https://www.loveq.cn/themes/loveq/loveautumn/appimg/qr-code.gif?20180304.gif',
  filterCategories: ["盛世乾坤", "一些事一些情", "一些事一些情精华剪辑"],
}

async function getCategories() {
  const url = appConfig.site + '/program.html'
  const { data } = await $fetch.get(url, {
    headers: { 'User-Agent': UA },
  })
  
  if (data && data.includes('Just a moment...')) {
    $utils.openSafari(url, UA)
    return []
  }
  
  const $ = cheerio.load(data)
  const categories = []
  const seen = new Set()
  
  $('a[href]').each((_, e) => {
    const href = $(e).attr('href')
    const title = $(e).text().trim()
    
    const catMatch = href && href.match(/program-cat(\d+)-p\d+\.html/)
    if (catMatch && title && !appConfig.filterCategories.includes(title)) {
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
  
  categories.sort((a, b) => parseInt(a.type_id) - parseInt(b.type_id))
  return categories
}

async function getConfig() {
  let config = { ...appConfig }
  const categories = await getCategories()
  
  config.tabs = categories.map(cat => ({
    name: cat.type_name,
    ui: 1,
    ext: {
      id: cat.type_id,
    },
  }))
  
  return jsonify(config)
}

async function getCards(ext) {
  ext = argsify(ext)
  let cards = []
  let { page = 1, id, filters = {} } = ext
  
  let url = appConfig.site + `/program.html?cat_id=${id}&page=${page}`
  
  if (filters.year && filters.year !== '') {
    url += `&year=${encodeURIComponent(filters.year)}`
  }
  if (filters.month && filters.month !== '') {
    url += `&month=${encodeURIComponent(filters.month)}`
  }
  
  const { data } = await $fetch.get(url, {
    headers: { 'User-Agent': UA },
  })
  
  if (data && data.includes('Just a moment...')) {
    $utils.openSafari(url, UA)
    return jsonify({ list: [] })
  }
  
  const $ = cheerio.load(data)
  
  $('a[href*="program_download"]').each((_, e) => {
    const href = $(e).attr('href')
    let title = $(e).text().trim()
    
    if (!title || title.length < 2) return
    
    const vidMatch = href && href.match(/program_download-?(\d+)\.html/)
    if (vidMatch) {
      const vid = vidMatch[1]
      
      let cover = appConfig.defaultPic
      const imgTag = $(e).find('img')
      if (imgTag.length && imgTag.attr('src')) {
        let imgSrc = imgTag.attr('src')
        cover = imgSrc.startsWith('http') ? imgSrc : appConfig.site + imgSrc
      }
      
      let remarks = ''
      const parent = $(e).closest('li, div[class*="item"], div[class*="entry"]')
      if (parent.length) {
        const dateSpan = parent.find('span[class*="date"], span[class*="time"]')
        if (dateSpan.length) {
          remarks = dateSpan.text().trim()
        }
      }
      
      let obj = {
        vod_id: vid,
        vod_name: title,
        vod_pic: cover,
        vod_remarks: remarks,
        ext: {
          url: href,
          vid: vid,
        },
      }
      cards.push(obj)
    }
  })
  
  // 计算总页数
  let pageCount = 1
  const pagination = $('div[class*="page"], div[class*="pagination"]')
  if (pagination.length) {
    const pageLinks = pagination.find('a')
    if (pageLinks.length) {
      const lastPage = pageLinks.length >= 2 ? pageLinks.eq(-2) : pageLinks.eq(-1)
      const pageText = lastPage.text().trim()
      if (/^\d+$/.test(pageText)) {
        pageCount = parseInt(pageText)
      }
    }
  }
  
  // 筛选器
  const currentYear = new Date().getFullYear()
  const years = [{ n: '全部年份', v: '' }]
  for (let y = currentYear; y > 2012; y--) {
    years.push({ n: String(y), v: String(y) })
  }
  
  const months = [{ n: '全部月份', v: '' }]
  for (let m = 1; m <= 12; m++) {
    months.push({ n: `${m}月`, v: String(m) })
  }
  
  return jsonify({
    list: cards,
    page: parseInt(page),
    pagecount: pageCount,
    limit: 30,
    total: cards.length,
    filter: [
      { key: 'year', name: '年份', init: '', value: years },
      { key: 'month', name: '月份', init: '', value: months },
    ],
  })
}

async function getTracks(ext) {
  ext = argsify(ext)
  let url = ext.url || `${appConfig.site}/program_download-${ext.vid}.html`
  
  const { data } = await $fetch.get(url, {
    headers: { 'User-Agent': UA },
  })
  
  if (data && data.includes('Just a moment...')) {
    $utils.openSafari(url, UA)
    return jsonify({ list: [] })
  }
  
  const $ = cheerio.load(data)
  
  // 提取标题
  let title = $('title').text().trim()
  title = title.replace(/[-|]\s*LoveQ.*$/, '').trim()
  if (!title) title = `节目${ext.vid}`
  
  // 提取发布日期和内容
  let pubDate = ''
  let content = ''
  
  $('ul.pdl1 li').each((_, li) => {
    const liText = $(li).text().trim()
    if (liText.includes('发布日期：') || liText.includes('发布时间：')) {
      const dateMatch = liText.match(/(\d{4}[-\/]\d{2}[-\/]\d{2})/)
      if (dateMatch) {
        pubDate = dateMatch[1]
      }
    } else if (liText.includes('节目内容：') || liText.includes('内容简介：')) {
      content = liText.replace(/^(节目内容|内容简介)[：:]/, '').trim()
    }
  })
  
  if (!content) {
    const metaDesc = $('meta[name="description"]').attr('content')
    if (metaDesc) content = metaDesc
  }
  if (!content) content = '暂无节目简介'
  
  // 提取音频链接
  let audioUrl = ''
  
  // 匹配mp3链接
  const mp3Match = data.match(/https?:\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/i)
  if (mp3Match) {
    audioUrl = mp3Match[0]
  } else {
    const relMatch = data.match(/\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/i)
    if (relMatch) {
      audioUrl = 'https:' + relMatch[0]
    }
  }
  
  // 如果还是没找到，尝试从audio标签提取
  if (!audioUrl) {
    $('audio, source').each((_, tag) => {
      let src = $(tag).attr('src') || ''
      if (src && src.includes('.mp3')) {
        if (src.startsWith('//')) src = 'https:' + src
        audioUrl = src
        return false
      }
    })
  }
  
  if (!audioUrl) {
    $utils.toastError('未找到音频链接')
    return jsonify({ list: [] })
  }
  
  // 封面图片
  let pic = appConfig.defaultPic
  const imgTag = $('img[class*="cover"], img[class*="poster"], .pdl1 img')
  if (imgTag.length && imgTag.attr('src')) {
    let imgSrc = imgTag.attr('src')
    pic = imgSrc.startsWith('http') ? imgSrc : appConfig.site + imgSrc
  }
  
  // 按照模板格式返回
  return jsonify({
    list: [{
      vod_id: ext.vid,
      vod_name: title,
      vod_pic: pic,
      vod_content: content,
      vod_play_url: audioUrl,
    }],
  })
}

async function searchContent(key, quick, pg = '1') {
  const encodedKey = encodeURIComponent(key)
  const searchUrls = [
    `${appConfig.site}/so-${pg}-${encodedKey}.html`,
    `${appConfig.site}/so.html?wd=${encodedKey}&page=${pg}`,
    `${appConfig.site}/search.php?keyword=${encodedKey}&page=${pg}`,
  ]
  
  let data = null
  for (const url of searchUrls) {
    try {
      const resp = await $fetch.get(url, { headers: { 'User-Agent': UA } })
      if (resp && resp.data) {
        data = resp.data
        break
      }
    } catch(e) {}
  }
  
  if (!data) return jsonify({ list: [] })
  
  const $ = cheerio.load(data)
  const results = []
  const seenIds = new Set()
  
  $('a[href*="program_download"]').each((_, e) => {
    const href = $(e).attr('href')
    const title = $(e).text().trim()
    
    if (!title || title.length < 2) return
    
    const vidMatch = href && href.match(/program_download-?(\d+)\.html/)
    if (vidMatch) {
      const vid = vidMatch[1]
      if (title.toLowerCase().includes(key.toLowerCase()) && !seenIds.has(vid)) {
        seenIds.add(vid)
        results.push({
          vod_id: vid,
          vod_name: title,
          vod_pic: appConfig.defaultPic,
          vod_remarks: '搜索结果',
          ext: {
            vid: vid,
          },
        })
      }
    }
  })
  
  return jsonify({ list: results })
}