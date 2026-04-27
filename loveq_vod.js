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

async function getCategories() {
  const url = appConfig.site + '/program.html'
  const { data } = await $fetch.get(url, {
    headers: {
      'User-Agent': UA,
    },
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
  
  // 年份筛选
  const currentYear = new Date().getFullYear()
  const years = [{ n: '全部年份', v: '' }]
  for (let y = currentYear; y > 2002; y--) {
    years.push({ n: String(y), v: String(y) })
  }
  
  // 月份筛选
  const months = [{ n: '全部月份', v: '' }]
  for (let m = 1; m <= 12; m++) {
    months.push({ n: `${m}月`, v: String(m) })
  }
  
  const filters = {}
  for (const cat of categories) {
    filters[cat.type_id] = [
      { key: 'year', name: '年份', value: years },
      { key: 'month', name: '月份', value: months }
    ]
  }
  
  config.tabs = categories.map(cat => ({
    name: cat.type_name,
    ui: 1,
    ext: {
      id: cat.type_id,
    },
  }))
  
  config.filters = filters
  
  return jsonify(config)
}

async function getCards(ext) {
  ext = argsify(ext)
  let videos = []
  let { page = 1, id, filters = {} } = ext
  
  let url = appConfig.site + `/program.html`
  
  const params = new URLSearchParams()
  params.append('cat_id', id)
  params.append('page', page)
  
  if (filters.year && filters.year !== '') {
    params.append('year', filters.year)
  }
  if (filters.month && filters.month !== '') {
    params.append('month', filters.month)
  }
  
  url = url + '?' + params.toString()
  
  console.log('Requesting:', url)
  
  const { data } = await $fetch.get(url, {
    headers: {
      'User-Agent': UA,
    },
  })
  
  if (data && data.includes('Just a moment...')) {
    $utils.openSafari(url, UA)
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
        } else {
          pic = appConfig.site + imgSrc
        }
      }
      
      let remark = ''
      const parent = $(e).closest('li') || $(e).closest('div[class*="item"], div[class*="entry"]')
      if (parent && parent.length) {
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
  
  if (pageCount < parseInt(page)) {
    pageCount = parseInt(page)
  }
  
  return jsonify({
    list: videos,
    page: parseInt(page),
    pagecount: pageCount,
    limit: 30,
    total: videos.length,
  })
}

async function getTracks(ext) {
  ext = argsify(ext)
  const vid = ext.vid
  const url = `${appConfig.site}/program_download-${vid}.html`
  
  console.log('获取详情页:', url)
  
  const { data } = await $fetch.get(url, {
    headers: {
      'User-Agent': UA,
    },
  })
  
  if (data && data.includes('Just a moment...')) {
    $utils.openSafari(url, UA)
    return jsonify({ list: [] })
  }
  
  const $ = cheerio.load(data)
  
  // 提取原标题
  let originalTitle = $('title').text().trim()
  originalTitle = originalTitle.replace(/[-|]\s*LoveQ.*$/, '').trim()
  if (!originalTitle) originalTitle = `节目${vid}`
  
  // 提取发布日期和内容
  let pubDate = ''
  let content = ''
  
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
  if (!content) {
    content = '暂无节目简介'
  }
  
  // 新标题格式：发布日期 + 节目内容
  let newTitle = originalTitle
  if (pubDate) {
    const formattedDate = pubDate.replace(/\//g, '-')
    const contentPreview = content.length > 50 ? content.slice(0, 50) : content
    newTitle = `${formattedDate} - ${contentPreview}`
  }
  
  // 描述信息
  const desc = pubDate ? `📅 发布日期：${pubDate}\n📝 ${content}` : content
  
  // ========== 提取音频链接（与Python版本完全一致）==========
  let playUrl = '暂无音频'
  
  // 匹配完整格式的音频链接
  // 格式: https://dl2.loveq.cn:8090/live/program/2017/1500229358423534874.mp3?sign=xxx&timestamp=xxx
  const pattern = /https?:\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi
  const matches = data.match(pattern)
  
  if (matches && matches.length > 0) {
    playUrl = `LoveQ音频$${matches[0]}`
    console.log('找到音频:', matches[0])
  } else {
    // 匹配协议相对路径的版本
    const patternRel = /\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi
    const matchesRel = data.match(patternRel)
    if (matchesRel && matchesRel.length > 0) {
      playUrl = `LoveQ音频$https:${matchesRel[0]}`
      console.log('找到相对路径音频:', matchesRel[0])
    } else {
      // 从audio或source标签中提取
      let audioSrc = ''
      $('audio, source').each((_, tag) => {
        const src = $(tag).attr('src') || ''
        if (src && src.includes('dl2.loveq.cn') && src.includes('.mp3') && src.includes('sign=') && src.includes('timestamp=')) {
          audioSrc = src
          return false
        }
      })
      if (audioSrc) {
        if (audioSrc.startsWith('//')) {
          playUrl = `LoveQ音频$https:${audioSrc}`
        } else {
          playUrl = `LoveQ音频$${audioSrc}`
        }
        console.log('从标签找到音频:', audioSrc)
      }
    }
  }
  
  // 封面图片
  let vodPic = appConfig.defaultPic
  if (originalTitle.includes('得闲小叙') || originalTitle.includes('得闲')) {
    vodPic = appConfig.dexianPic
  } else {
    const imgTag = $('img[class*="cover"], img[class*="poster"], img[class*="pic"]')
    if (imgTag.length && imgTag.attr('src')) {
      let imgSrc = imgTag.attr('src')
      if (imgSrc.startsWith('http')) {
        vodPic = imgSrc
      } else {
        vodPic = appConfig.site + imgSrc
      }
    }
  }
  
  if (playUrl === '暂无音频') {
    console.log('未找到音频链接')
    $utils.toastError('未找到音频链接')
  }
  
  return jsonify({
    list: [{
      vod_id: vid,
      vod_name: newTitle,
      vod_pic: vodPic,
      vod_content: desc,
      vod_play_from: '木凡的天空',
      vod_play_url: playUrl,
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
  
  let html = ''
  for (const url of searchUrls) {
    try {
      const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA },
      })
      if (data) {
        html = data
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
      if (key.toLowerCase().includes(key.toLowerCase()) || key.includes(key)) {
        if (!seenIds.has(vid)) {
          seenIds.add(vid)
          results.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: appConfig.defaultPic,
            vod_remarks: '搜索结果',
          })
        }
      }
    }
  })
  
  return jsonify({ list: results })
}