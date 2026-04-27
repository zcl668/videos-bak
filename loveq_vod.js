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
  dexianPic: 'https://www.loveq.cn/themes/loveq/loveautumn/appimg/qr-code.gif?20180304.gif',
  filterCategories: ["盛世乾坤", "一些事一些情", "一些事一些情精华剪辑"],
}

// 统一请求函数 - 兼容 Quantumult X / Surge / Loon
async function request(url, options = {}) {
  // 确保URL完整
  let fullUrl = url
  if (!fullUrl.startsWith('http')) {
    if (fullUrl.startsWith('//')) {
      fullUrl = 'https:' + fullUrl
    } else if (fullUrl.startsWith('/')) {
      fullUrl = appConfig.site + fullUrl
    } else if (!fullUrl.includes('://')) {
      fullUrl = appConfig.site + '/' + fullUrl
    }
  }
  
  console.log('Requesting:', fullUrl)
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Request timeout: ' + fullUrl))
    }, 30000)
    
    // Quantumult X / Surge
    if (typeof $task !== 'undefined') {
      $task.fetch({
        url: fullUrl,
        method: 'GET',
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          ...options.headers,
        },
      }, (error, response, body) => {
        clearTimeout(timeout)
        if (error) {
          reject(error)
        } else {
          resolve({ data: body, response })
        }
      })
    }
    // Loon
    else if (typeof $httpClient !== 'undefined') {
      $httpClient.get({
        url: fullUrl,
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          ...options.headers,
        },
      }, (error, response, body) => {
        clearTimeout(timeout)
        if (error) {
          reject(error)
        } else {
          resolve({ data: body, response })
        }
      })
    }
    // 其他环境
    else if (typeof fetch !== 'undefined') {
      fetch(fullUrl, {
        headers: {
          'User-Agent': UA,
          ...options.headers,
        },
      })
        .then(res => res.text())
        .then(data => {
          clearTimeout(timeout)
          resolve({ data })
        })
        .catch(reject)
    }
    else {
      clearTimeout(timeout)
      reject(new Error('No HTTP client available'))
    }
  })
}

async function getCategories() {
  const url = '/program.html'
  const { data } = await request(url)
  
  if (!data || data.includes('Just a moment...') || data.includes('Cloudflare')) {
    $utils.openSafari(appConfig.site + '/program.html', UA)
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
  
  let url = `/program.html?cat_id=${id}&page=${page}`
  
  if (filters.year && filters.year !== '') {
    url += `&year=${encodeURIComponent(filters.year)}`
  }
  if (filters.month && filters.month !== '') {
    url += `&month=${encodeURIComponent(filters.month)}`
  }
  
  console.log('Requesting cards:', url)
  
  let data
  try {
    const response = await request(url)
    data = response.data
  } catch (error) {
    console.error('Request error:', error)
    return jsonify({ list: [], page: 1, pagecount: 1, limit: 30, total: 0 })
  }
  
  if (!data || data.includes('Just a moment...')) {
    $utils.openSafari(appConfig.site + url, UA)
    return jsonify({ list: [], page: 1, pagecount: 1, limit: 30, total: 0 })
  }
  
  const $ = cheerio.load(data)
  
  $('a[href*="program_download"]').each((_, e) => {
    const href = $(e).attr('href')
    let title = $(e).text().trim()
    
    if (!title || title.length < 2) return
    
    const vidMatch = href && href.match(/program_download-?(\d+)\.html/)
    if (vidMatch) {
      const vid = vidMatch[1]
      
      let pic = appConfig.defaultPic
      const imgTag = $(e).find('img')
      if (imgTag.length && imgTag.attr('src')) {
        let imgSrc = imgTag.attr('src')
        if (imgSrc.startsWith('http')) {
          pic = imgSrc
        } else if (imgSrc.startsWith('/')) {
          pic = appConfig.site + imgSrc
        }
      }
      
      let remark = ''
      const parent = $(e).closest('li, div[class*="item"], div[class*="entry"]')
      if (parent.length) {
        const dateSpan = parent.find('span[class*="date"], span[class*="time"]')
        if (dateSpan.length) {
          remark = dateSpan.text().trim()
        }
      }
      
      cards.push({
        vod_id: vid,
        vod_name: title,
        vod_pic: pic,
        vod_remarks: remark,
        ext: {
          url: href,
          vid: vid,
        },
      })
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
  
  if (pageCount < page) pageCount = page
  
  // 年份筛选
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
  
  // 构建正确URL
  let url = ext.url
  if (!url) {
    url = `/program_download-${ext.vid}.html`
  }
  if (!url.startsWith('http')) {
    if (url.startsWith('//')) {
      url = 'https:' + url
    } else if (url.startsWith('/')) {
      url = appConfig.site + url
    } else {
      url = appConfig.site + '/' + url
    }
  }
  
  console.log('获取详情页:', url)
  
  let data
  try {
    const response = await request(url)
    data = response.data
  } catch (error) {
    console.error('Track request error:', error)
    $utils.toastError('获取详情失败: ' + error.message)
    return jsonify({ list: [] })
  }
  
  // 检查是否获取到有效数据
  if (!data || data.length < 100) {
    console.log('获取到的数据过少，可能请求失败')
    $utils.toastError('页面获取失败')
    return jsonify({ list: [] })
  }
  
  if (data.includes('Just a moment...') || data.includes('Cloudflare')) {
    $utils.openSafari(url, UA)
    return jsonify({ list: [] })
  }
  
  const $ = cheerio.load(data)
  
  // ========== 提取标题（多种方式） ==========
  let originalTitle = ''
  
  // 方式1: 从title标签提取
  const titleText = $('title').text().trim()
  if (titleText) {
    originalTitle = titleText.replace(/[-|]\s*LoveQ.*$/, '').replace(/节目下载[-\s]*/, '').trim()
  }
  
  // 方式2: 从h1标签提取
  if (!originalTitle) {
    const h1Text = $('h1').first().text().trim()
    if (h1Text) originalTitle = h1Text
  }
  
  // 方式3: 从meta标签提取
  if (!originalTitle) {
    const ogTitle = $('meta[property="og:title"]').attr('content')
    if (ogTitle) originalTitle = ogTitle
  }
  
  // 方式4: 从页面内容提取（查找包含节目名字的段落）
  if (!originalTitle) {
    $('div[class*="title"], div[class*="name"], .pdl1 li:first-child').each((_, el) => {
      const text = $(el).text().trim()
      if (text && text.length > 3 && text.length < 100 && !text.includes('发布日期')) {
        originalTitle = text
        return false
      }
    })
  }
  
  if (!originalTitle) {
    originalTitle = `节目${ext.vid}`
    console.log('未能提取标题，使用默认:', originalTitle)
  }
  
  console.log('提取到标题:', originalTitle)
  
  // ========== 提取发布日期和内容 ==========
  let pubDate = ''
  let content = ''
  
  $('ul.pdl1 li, .info li, .detail li').each((_, li) => {
    const liText = $(li).text().trim()
    if (liText.includes('发布日期') || liText.includes('发布时间')) {
      const dateMatch = liText.match(/(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/)
      if (dateMatch) {
        pubDate = dateMatch[1]
      } else {
        const datePart = liText.replace(/^(发布日期|发布时间)[：:]\s*/, '')
        if (datePart.match(/\d/)) pubDate = datePart
      }
    } else if (liText.includes('节目内容') || liText.includes('内容简介')) {
      content = liText.replace(/^(节目内容|内容简介)[：:]\s*/, '').trim()
    }
  })
  
  if (!content) {
    const metaDesc = $('meta[name="description"]').attr('content')
    if (metaDesc) content = metaDesc
  }
  
  if (!content) {
    $('div[class*="content"], div[class*="intro"], .pdl1 li:last-child').each((_, el) => {
      const text = $(el).text().trim()
      if (text.length > 20 && !text.includes('发布日期')) {
        content = text.slice(0, 500)
        return false
      }
    })
  }
  
  if (!content) content = '暂无节目简介'
  
  // 构建显示标题
  let vodName = originalTitle
  if (pubDate && pubDate.match(/\d{4}-\d{2}-\d{2}/)) {
    vodName = `${pubDate} - ${originalTitle}`
  }
  
  const desc = pubDate ? `📅 发布日期：${pubDate}\n📝 ${content}` : content
  
  // ========== 提取音频链接 ==========
  let audioUrl = ''
  
  // 方法1：匹配完整mp3链接
  const mp3Patterns = [
    /https?:\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi,
    /https?:\/\/[^\s"']+\.mp3\?[^\s"']+/gi,
    /\/\/dl2\.loveq\.cn:8090\/[^\s"']+\.mp3[^\s"']*/gi,
  ]
  
  for (const pattern of mp3Patterns) {
    const match = data.match(pattern)
    if (match && match[0]) {
      audioUrl = match[0]
      if (audioUrl.startsWith('//')) audioUrl = 'https:' + audioUrl
      console.log('找到音频链接:', audioUrl)
      break
    }
  }
  
  // 方法2：从audio/source标签提取
  if (!audioUrl) {
    $('audio source, audio, source[type="audio/mpeg"]').each((_, tag) => {
      let src = $(tag).attr('src') || ''
      if (src && (src.includes('.mp3') || src.includes('dl2.loveq.cn'))) {
        if (src.startsWith('//')) src = 'https:' + src
        if (!audioUrl) audioUrl = src
      }
    })
  }
  
  // 方法3：从script内容提取
  if (!audioUrl) {
    $('script').each((_, script) => {
      const scriptText = $(script).html() || ''
      const match = scriptText.match(/https?:\/\/[^\s"']+\.mp3\?[^\s"']+/)
      if (match) {
        audioUrl = match[0]
        return false
      }
    })
  }
  
  // 封面图片
  let vodPic = appConfig.defaultPic
  if (originalTitle.includes('得闲')) {
    vodPic = appConfig.dexianPic
  } else {
    const imgSelectors = ['img[class*="cover"]', 'img[class*="poster"]', 'img[class*="pic"]', '.pdl1 img', '.content img']
    for (const selector of imgSelectors) {
      const imgTag = $(selector).first()
      if (imgTag.length && imgTag.attr('src')) {
        let imgSrc = imgTag.attr('src')
        if (imgSrc.startsWith('//')) imgSrc = 'https:' + imgSrc
        else if (imgSrc.startsWith('/')) imgSrc = appConfig.site + imgSrc
        if (imgSrc.startsWith('http')) {
          vodPic = imgSrc
          break
        }
      }
    }
  }
  
  if (!audioUrl) {
    console.log('未找到音频链接，页面长度:', data.length)
    $utils.toastError('未找到音频链接')
    return jsonify({ list: [] })
  }
  
  return jsonify({
    list: [{
      vod_id: ext.vid,
      vod_name: vodName,
      vod_pic: vodPic,
      vod_content: desc,
      vod_play_url: audioUrl,
    }],
  })
}

async function searchContent(key, quick, pg = '1') {
  const encodedKey = encodeURIComponent(key)
  const searchUrls = [
    `/so-${pg}-${encodedKey}.html`,
    `/so.html?wd=${encodedKey}&page=${pg}`,
    `/search.php?keyword=${encodedKey}&page=${pg}`,
  ]
  
  let data = null
  for (const url of searchUrls) {
    try {
      const response = await request(url)
      if (response && response.data && response.data.length > 100) {
        data = response.data
        console.log('搜索成功:', url)
        break
      }
    } catch(e) {
      console.log('搜索失败:', url, e.message)
    }
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
          ext: { vid: vid, url: href },
        })
      }
    }
  })
  
  return jsonify({ list: results })
}