async function getLocalInfo() {
  const appConfig = {
    ver: 1,
    name: "木凡的天空(LoveQ)",
    api: "csp_loveq",
  }
  return jsonify(appConfig)
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const cheerio = createCheerio()

let $config = argsify($config_str)

const appConfig = {
  ver: 1,
  title: 'LoveQ',
  site: 'https://www.loveq.cn',
  defaultPic: 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg',
  dexianPic: 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg',
  filterCategories: ["盛世乾坤", "一些事一些情", "一些事一些情精华剪辑"],
}

// ========== 通用请求方法 ==========
async function request(url, params = null) {
  let fullUrl = url
  if (params) {
    const queryString = Object.keys(params)
      .filter(k => params[k])
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
      .join('&')
    if (queryString) {
      fullUrl += (url.includes('?') ? '&' : '?') + queryString
    }
  }
  
  console.log('Requesting:', fullUrl)
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout')), 15000)
    
    // Quantumult X / Surge
    if (typeof $task !== 'undefined') {
      $task.fetch({
        url: fullUrl,
        method: 'GET',
        headers: {
          'User-Agent': UA,
          'Referer': appConfig.site + '/',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Connection': 'keep-alive'
        },
      }, (error, response, body) => {
        clearTimeout(timeout)
        if (error) reject(error)
        else resolve({ data: body })
      })
    }
    // Loon
    else if (typeof $httpClient !== 'undefined') {
      $httpClient.get({
        url: fullUrl,
        headers: {
          'User-Agent': UA,
          'Referer': appConfig.site + '/',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Connection': 'keep-alive'
        },
      }, (error, response, body) => {
        clearTimeout(timeout)
        if (error) reject(error)
        else resolve({ data: body })
      })
    }
    // 其他环境
    else if (typeof fetch !== 'undefined') {
      fetch(fullUrl, {
        headers: {
          'User-Agent': UA,
          'Referer': appConfig.site + '/',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
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
      reject(new Error('No HTTP client'))
    }
  })
}

// ========== 首页分类 ==========
async function getConfig() {
  const html = await request(appConfig.site + '/program.html')
  if (!html || !html.data) {
    return jsonify({ class: [] })
  }
  
  const $ = cheerio.load(html.data)
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
  
  // 添加筛选器
  const currentYear = new Date().getFullYear()
  const years = [{ n: '全部年份', v: '' }]
  for (let y = currentYear; y > 2002; y--) {
    years.push({ n: String(y), v: String(y) })
  }
  
  const months = [{ n: '全部月份', v: '' }]
  for (let m = 1; m <= 12; m++) {
    months.push({ n: `${m}月`, v: String(m) })
  }
  
  const tabs = categories.map(cat => ({
    name: cat.type_name,
    ui: 1,
    ext: {
      id: cat.type_id,
    }
  }))
  
  return jsonify({
    ver: 1,
    title: appConfig.title,
    site: appConfig.site,
    defaultPic: appConfig.defaultPic,
    dexianPic: appConfig.dexianPic,
    tabs: tabs,
    filters: {
      year: { name: '年份', values: years },
      month: { name: '月份', values: months }
    }
  })
}

// ========== 分类内容 ==========
async function getCards(ext) {
  ext = argsify(ext)
  let { page = 1, id, filters = {} } = ext
  
  // 构建参数
  const params = {
    cat_id: id,
    page: page
  }
  
  if (filters.year && filters.year !== '') {
    params.year = filters.year
  }
  if (filters.month && filters.month !== '') {
    params.month = filters.month
  }
  
  const html = await request(appConfig.site + '/program.html', params)
  if (!html || !html.data) {
    return jsonify({ list: [], page: parseInt(page), pagecount: 0, limit: 30, total: 0 })
  }
  
  const $ = cheerio.load(html.data)
  const videos = []
  
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
        } else {
          pic = appConfig.site + (imgSrc.startsWith('/') ? imgSrc : '/' + imgSrc)
        }
      }
      
      let remark = ''
      const parent = $(e).closest('li') || $(e).closest('div[class*="item"], div[class*="entry"]')
      if (parent.length) {
        const dateSpan = parent.find('span[class*="date"], span[class*="time"]')
        if (dateSpan.length) {
          remark = dateSpan.text().trim()
        }
      }
      
      videos.push({
        vod_id: vid,
        vod_name: title,
        vod_pic: pic,
        vod_remarks: remark,
        ext: {
          vid: vid,
        }
      })
    }
  })
  
  // 计算分页
  let pageCount = 1
  const pagination = $('div[class*="page"], div[class*="pagination"]')
  if (pagination.length) {
    const pageLinks = pagination.find('a')
    if (pageLinks.length) {
      const lastPage = pageLinks.length >= 2 ? pageLinks.eq(-2) : pageLinks.eq(-1)
      const pageText = lastPage.text().trim()
      if (/^\d+$/.test(pageText)) {
        pageCount = parseInt(pageText)
      } else {
        pageLinks.each((_, link) => {
          const linkHref = $(link).attr('href') || ''
          const pageMatch = linkHref.match(/[?&]page=(\d+)/)
          if (pageMatch) {
            const pgNum = parseInt(pageMatch[1])
            if (pgNum > pageCount) pageCount = pgNum
          }
        })
      }
    }
  }
  
  if (pageCount <= parseInt(page) && videos.length) {
    pageCount = parseInt(page) + 1
  }
  
  // 筛选器
  const currentYear = new Date().getFullYear()
  const years = [{ n: '全部年份', v: '' }]
  for (let y = currentYear; y > 2002; y--) {
    years.push({ n: String(y), v: String(y) })
  }
  
  const months = [{ n: '全部月份', v: '' }]
  for (let m = 1; m <= 12; m++) {
    months.push({ n: `${m}月`, v: String(m) })
  }
  
  return jsonify({
    list: videos,
    page: parseInt(page),
    pagecount: pageCount,
    limit: 30,
    total: videos.length,
    filter: [
      { key: 'year', name: '年份', init: filters.year || '', value: years },
      { key: 'month', name: '月份', init: filters.month || '', value: months }
    ]
  })
}

// ========== 搜索 ==========
async function searchContent(key, quick, pg = '1') {
  const encodedKey = encodeURIComponent(key)
  const searchUrls = [
    `${appConfig.site}/so-${pg}-${encodedKey}.html`,
    `${appConfig.site}/so.html?wd=${encodedKey}&page=${pg}`,
    `${appConfig.site}/search.php?keyword=${encodedKey}&page=${pg}`
  ]
  
  let html = null
  for (const url of searchUrls) {
    try {
      const resp = await request(url)
      if (resp && resp.data) {
        html = resp.data
        break
      }
    } catch(e) {
      console.log('搜索请求失败:', url)
    }
  }
  
  if (!html) return jsonify({ list: [] })
  
  const $ = cheerio.load(html)
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
          }
        })
      }
    }
  })
  
  return jsonify({ list: results })
}

// ========== 节目详情 ==========
async function getTracks(ext) {
  ext = argsify(ext)
  const vid = ext.vid
  const url = `${appConfig.site}/program_download-${vid}.html`
  
  console.log('获取详情页:', url)
  
  const resp = await request(url)
  if (!resp || !resp.data) {
    return jsonify({ list: [] })
  }
  
  const html = resp.data
  const $ = cheerio.load(html)
  
  // 提取原标题
  let originalTitle = ''
  const titleTag = $('title').text().trim()
  if (titleTag) {
    originalTitle = titleTag.replace(/[-|]\s*LoveQ.*$/, '').trim()
  }
  
  if (!originalTitle) {
    originalTitle = `节目${vid}`
  }
  
  // 提取发布日期和内容
  let pubDate = ''
  let content = ''
  
  const pdl1List = $('ul.pdl1')
  if (pdl1List.length) {
    pdl1List.find('li').each((_, li) => {
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
  }
  
  if (!content) {
    const metaDesc = $('meta[name="description"]').attr('content')
    if (metaDesc) content = metaDesc
  }
  
  if (!content) {
    const contentDiv = $('div[class*="content"], div[class*="intro"], div[class*="desc"]')
    if (contentDiv.length) {
      content = contentDiv.text().trim().slice(0, 500)
    }
  }
  
  if (content && /^\d{4}[-\/]\d{2}[-\/]\d{2}\s*$/.test(content)) {
    content = '暂无节目简介'
  }
  if (!content) content = '暂无节目简介'
  
  // 新标题格式：发布日期 + 节目内容
  let newTitle = originalTitle
  if (pubDate) {
    const formattedDate = pubDate.replace(/\//g, '-')
    const contentPreview = content.length > 50 ? content.slice(0, 50) : content
    newTitle = `${formattedDate} - ${contentPreview}`
  }
  
  const desc = pubDate ? `📅 发布日期：${pubDate}\n📝 ${content}` : content
  
  // ========== 提取音频链接 ==========
  let audioUrl = ''
  
  // 匹配完整格式
  const pattern = /https?:\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/i
  const match = html.match(pattern)
  if (match) {
    audioUrl = match[0]
    console.log('找到音频:', audioUrl)
  }
  
  // 匹配相对路径
  if (!audioUrl) {
    const patternRel = /\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/i
    const matchRel = html.match(patternRel)
    if (matchRel) {
      audioUrl = 'https:' + matchRel[0]
      console.log('找到音频:', audioUrl)
    }
  }
  
  // 从audio/source标签提取
  if (!audioUrl) {
    $('audio, source').each((_, tag) => {
      const src = $(tag).attr('src') || ''
      if (src && src.includes('dl2.loveq.cn') && src.includes('.mp3')) {
        if (src.match(/\.mp3\?/i) && src.includes('sign=') && src.includes('timestamp=')) {
          audioUrl = src.startsWith('//') ? 'https:' + src : src
          console.log('找到音频:', audioUrl)
          return false
        }
      }
    })
  }
  
  // 封面图片
  let vodPic = appConfig.defaultPic
  if (originalTitle.includes('得闲小叙') || originalTitle.includes('得闲')) {
    vodPic = appConfig.dexianPic
  } else {
    const imgTag = $('img[class*="cover"], img[class*="poster"], img[class*="pic"]')
    if (imgTag.length && imgTag.attr('src')) {
      let imgSrc = imgTag.attr('src')
      vodPic = imgSrc.startsWith('http') ? imgSrc : appConfig.site + imgSrc
    }
  }
  
  if (!audioUrl) {
    console.log('未找到音频链接')
    $utils.toastError('未找到音频链接')
    return jsonify({ list: [] })
  }
  
  return jsonify({
    list: [{
      vod_id: vid,
      vod_name: newTitle,
      vod_pic: vodPic,
      vod_content: desc,
      vod_play_url: audioUrl,
    }],
  })
}