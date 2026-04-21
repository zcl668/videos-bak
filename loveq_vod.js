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
  defaultPic: 'https://www.loveq.cn/themes/loveq/loveautumn/appimg/qr-code.gif?20180304.gif',
  dexianPic: 'https://www.loveq.cn/themes/loveq/loveautumn/appimg/qr-code.gif?20180304.gif',
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
  
  console.log('Requesting:', url)
  
  const { data } = await $fetch.get(url, {
    headers: {
      'User-Agent': UA,
    },
  })
  
  if (data && data.includes('Just a moment...')) {
    $utils.openSafari(url, UA)
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
  
  return jsonify({
    list: cards,
    page: parseInt(page),
    pagecount: pageCount,
    limit: 30,
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

async function getTracks(ext) {
  ext = argsify(ext)
  let url = ext.url || `${appConfig.site}/program_download-${ext.vid}.html`
  
  const { data } = await $fetch.get(url, {
    headers: {
      'User-Agent': UA,
    },
  })
  
  if (data && data.includes('Just a moment...')) {
    $utils.openSafari(url, UA)
  }
  
  const $ = cheerio.load(data)
  
  // 提取标题和内容
  let originalTitle = $('title').text().trim()
  originalTitle = originalTitle.replace(/[-|]\s*LoveQ.*$/, '').trim()
  if (!originalTitle) originalTitle = `节目${ext.vid}`
  
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
  
  if (!content || (content && /^\d{4}[-\/]\d{2}[-\/]\d{2}\s*$/.test(content))) {
    content = '暂无节目简介'
  }
  
  // 新标题格式
  let vodName = originalTitle
  if (pubDate) {
    const formattedDate = pubDate.replace(/\//g, '-')
    const contentPreview = content.length > 50 ? content.slice(0, 50) : content
    vodName = `${formattedDate} - ${contentPreview}`
  }
  
  const desc = pubDate ? `📅 发布日期：${pubDate}\n📝 ${content}` : content
  
  // ========== 提取音频链接 ==========
  const audioUrls = []
  const seen = new Set()
  
  // 方法1：匹配完整格式的音频链接
  const pattern1 = /https?:\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi
  let matches = data.match(pattern1) || []
  matches.forEach(link => {
    if (!seen.has(link)) {
      seen.add(link)
      audioUrls.push(link)
    }
  })
  
  // 方法2：匹配协议相对路径
  const pattern2 = /\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi
  matches = data.match(pattern2) || []
  matches.forEach(link => {
    const fullLink = 'https:' + link
    if (!seen.has(fullLink)) {
      seen.add(fullLink)
      audioUrls.push(fullLink)
    }
  })
  
  // 方法3：从audio/source标签提取
  $('audio, source').each((_, tag) => {
    let src = $(tag).attr('src') || ''
    if (src && src.includes('dl2.loveq.cn') && src.includes('.mp3')) {
      if (src.startsWith('//')) src = 'https:' + src
      if (!seen.has(src)) {
        seen.add(src)
        audioUrls.push(src)
      }
    }
  })
  
  // 方法4：从script中提取（有些网站会动态生成）
  const scriptMatches = data.match(/https?:\/\/[^\s"']+\.mp3\?[^\s"']+/gi) || []
  scriptMatches.forEach(link => {
    if (link.includes('dl2.loveq.cn') && !seen.has(link)) {
      seen.add(link)
      audioUrls.push(link)
    }
  })
  
  console.log('找到音频链接:', audioUrls)
  
  // 构建播放URL - 修复格式
  let playUrl = ''
  if (audioUrls.length > 0) {
    // 直接返回第一个音频URL，不添加额外前缀
    playUrl = audioUrls[0]
    if (audioUrls.length > 1) {
      // 多个音频用$$$分隔
      playUrl = audioUrls.join('$$$')
    }
  } else {
    playUrl = ''
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
  
  return jsonify({
    list: [{
      vod_id: ext.vid,
      vod_name: vodName,
      vod_pic: vodPic,
      vod_content: desc,
      vod_play_from: 'LoveQ',
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
  
  let data = null
  for (const url of searchUrls) {
    try {
      const resp = await $fetch.get(url, {
        headers: { 'User-Agent': UA },
      })
      if (resp && resp.data) {
        data = resp.data
        break
      }
    } catch(e) {
      console.log('搜索请求失败:', url)
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
      if ((key.toLowerCase() === title.toLowerCase() || title.toLowerCase().includes(key.toLowerCase())) && !seenIds.has(vid)) {
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

// 播放器处理 - 新增
async function playerContent(flag, id, vipFlags) {
  // 直接返回音频URL
  let audioUrl = id
  // 如果包含$$$，取第一个
  if (id && id.includes('$$$')) {
    audioUrl = id.split('$$$')[0]
  }
  
  const playHeaders = {
    "User-Agent": UA,
    "Referer": appConfig.site + "/",
    "Accept": "audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,*/*;q=0.5",
  }
  
  return {
    parse: 0,
    playUrl: "",
    url: audioUrl,
    header: playHeaders
  }
}