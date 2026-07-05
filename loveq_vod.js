// ========== LoveQ 音频爬虫 ==========
// 由木凡的天空 提供

async function getLocalInfo() {
  const appConfig = {
    ver: 1,
    name: "木凡的天空(LoveQ音频)",
    api: "csp_loveq",
  };
  return jsonify(appConfig);
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const cheerio = createCheerio();

// 配置
const $config = argsify($config_str);

const appConfig = {
  ver: 1,
  title: "木凡的天空(LoveQ音频)",
  site: "https://www.loveq.cn",
  default_pic: "https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg",
  dexian_pic: "https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg",
  // 需要过滤的分类
  filter_categories: ["盛世乾坤", "一些事一些情", "一些事一些情精华剪辑"],
  tabs: [
    {
      name: "全部节目",
      ui: 1,
      ext: {
        id: "all",
        cat_id: "1",
      },
    },
  ],
};

// ========== 获取分类列表 ==========
async function getConfig() {
  let config = { ...appConfig };
  
  try {
    const { data } = await $fetch.get(`${appConfig.site}/program.html`, {
      headers: { "User-Agent": UA },
    });
    
    const $ = cheerio.load(data);
    const categories = [];
    const seen = new Set();
    
    $("a[href]").each((_, a) => {
      const href = $(a).attr("href");
      const title = $(a).text().trim();
      
      const catMatch = href.match(/program-cat(\d+)-p\d+\.html/);
      if (catMatch && title && !appConfig.filter_categories.includes(title)) {
        const catId = catMatch[1];
        if (catId !== "0" && !seen.has(catId)) {
          seen.add(catId);
          categories.push({
            name: title,
            ui: 1,
            ext: {
              id: "category",
              cat_id: catId,
              cat_name: title,
            },
          });
        }
      }
    });
    
    // 按ID排序
    categories.sort((a, b) => parseInt(a.ext.cat_id) - parseInt(b.ext.cat_id));
    
    if (categories.length > 0) {
      config.tabs = categories;
    }
  } catch (e) {
    console.log("获取分类失败:", e);
  }
  
  return jsonify(config);
}

// ========== 获取卡片列表 ==========
async function getCards(ext) {
  ext = argsify(ext);
  let cards = [];
  let { page = 1, cat_id = "1", filters = {} } = ext;
  
  // 构建URL
  let url = `${appConfig.site}/program.html`;
  let params = new URLSearchParams();
  params.append("cat_id", cat_id);
  params.append("page", page);
  
  // 添加年份和月份筛选
  if (filters.year) params.append("year", filters.year);
  if (filters.month) params.append("month", filters.month);
  
  if (params.toString()) {
    url += "?" + params.toString();
  }
  
  console.log("请求:", url);
  
  try {
    const { data } = await $fetch.get(url, {
      headers: { "User-Agent": UA },
    });
    
    const $ = cheerio.load(data);
    
    // 查找节目列表
    $("a[href*='program_download']").each((_, a) => {
      const href = $(a).attr("href");
      let title = $(a).text().trim();
      
      if (!title || title.length < 2) return;
      
      const vidMatch = href.match(/program_download-?(\d+)\.html/);
      if (vidMatch) {
        const vid = vidMatch[1];
        
        // 查找图片
        let pic = appConfig.default_pic;
        const img = $(a).find("img");
        if (img.length > 0) {
          let imgSrc = img.attr("src");
          if (imgSrc) {
            if (imgSrc.startsWith("http")) {
              pic = imgSrc;
            } else {
              pic = new URL(imgSrc, appConfig.site).href;
            }
          }
        }
        
        // 获取备注（日期）
        let remark = "";
        const parent = $(a).closest("li");
        if (parent.length > 0) {
          const dateSpan = parent.find("span[class*='date'], span[class*='time']");
          if (dateSpan.length > 0) {
            remark = dateSpan.text().trim();
          }
        }
        
        cards.push({
          vod_id: vid,
          vod_name: title,
          vod_pic: pic,
          vod_remarks: remark,
          ext: {
            vid: vid,
            url: `${appConfig.site}/program_download-${vid}.html`,
          },
        });
      }
    });
    
    // 计算分页
    let pageCount = 1;
    const pagination = $("div[class*='page'], div[class*='pagination']");
    if (pagination.length > 0) {
      const pageLinks = pagination.find("a");
      if (pageLinks.length > 0) {
        const lastPage = pageLinks.length >= 2 ? pageLinks.eq(-2) : pageLinks.last();
        const pageText = lastPage.text().trim();
        if (/^\d+$/.test(pageText)) {
          pageCount = parseInt(pageText);
        } else {
          pageLinks.each((_, link) => {
            const href = $(link).attr("href") || "";
            const pageMatch = href.match(/[?&]page=(\d+)/);
            if (pageMatch) {
              const pgNum = parseInt(pageMatch[1]);
              if (pgNum > pageCount) pageCount = pgNum;
            }
          });
        }
      }
    }
    
    return jsonify({
      list: cards,
      page: parseInt(page),
      pagecount: pageCount,
      limit: 30,
      total: cards.length,
      filter: [
        {
          key: "year",
          name: "年份",
          init: "",
          value: (() => {
            const currentYear = new Date().getFullYear();
            const years = [{ n: "全部年份", v: "" }];
            for (let y = currentYear; y > 2002; y--) {
              years.push({ n: String(y), v: String(y) });
            }
            return years;
          })(),
        },
        {
          key: "month",
          name: "月份",
          init: "",
          value: (() => {
            const months = [{ n: "全部月份", v: "" }];
            for (let m = 1; m <= 12; m++) {
              months.push({ n: m + "月", v: String(m) });
            }
            return months;
          })(),
        },
      ],
    });
  } catch (e) {
    console.log("获取列表失败:", e);
    return jsonify({ list: [], page: 1, pagecount: 0, limit: 30, total: 0 });
  }
}

// ========== 搜索 ==========
async function search(ext) {
  ext = argsify(ext);
  let cards = [];
  let text = encodeURIComponent(ext.text);
  let page = ext.page || 1;
  
  const searchUrls = [
    `${appConfig.site}/so-${page}-${text}.html`,
    `${appConfig.site}/so.html?wd=${text}&page=${page}`,
    `${appConfig.site}/search.php?keyword=${text}&page=${page}`,
  ];
  
  let data = null;
  for (const url of searchUrls) {
    try {
      const resp = await $fetch.get(url, { headers: { "User-Agent": UA } });
      if (resp.data) {
        data = resp.data;
        break;
      }
    } catch (e) {
      continue;
    }
  }
  
  if (!data) {
    return jsonify({ list: [] });
  }
  
  const $ = cheerio.load(data);
  const seenIds = new Set();
  
  $("a[href*='program_download']").each((_, a) => {
    const href = $(a).attr("href");
    let title = $(a).text().trim();
    
    if (!title || title.length < 2) return;
    
    const vidMatch = href.match(/program_download-?(\d+)\.html/);
    if (vidMatch) {
      const vid = vidMatch[1];
      const keyword = ext.text.toLowerCase();
      if ((title.toLowerCase().includes(keyword) || title.includes(ext.text)) && !seenIds.has(vid)) {
        seenIds.add(vid);
        cards.push({
          vod_id: vid,
          vod_name: title,
          vod_pic: appConfig.default_pic,
          vod_remarks: "搜索结果",
          ext: {
            vid: vid,
            url: `${appConfig.site}/program_download-${vid}.html`,
          },
        });
      }
    }
  });
  
  return jsonify({ list: cards });
}

// ========== 获取播放地址 ==========
async function getTracks(ext) {
  ext = argsify(ext);
  let url = ext.url || `${appConfig.site}/program_download-${ext.vid}.html`;
  let tracks = [];
  
  try {
    const { data } = await $fetch.get(url, {
      headers: { "User-Agent": UA },
    });
    
    const $ = cheerio.load(data);
    
    // 提取原标题
    let originalTitle = "";
    const titleTag = $("title");
    if (titleTag.length > 0) {
      originalTitle = titleTag.text().trim().replace(/[-|]\s*LoveQ.*$/, "").trim();
    }
    if (!originalTitle) {
      originalTitle = `节目${ext.vid || ""}`;
    }
    
    // 提取发布日期和内容
    let pubDate = "";
    let content = "";
    
    const pdl1List = $("ul.pdl1");
    if (pdl1List.length > 0) {
      pdl1List.find("li").each((_, li) => {
        const liText = $(li).text().trim();
        
        if (liText.includes("发布日期：") || liText.includes("发布时间：")) {
          const dateMatch = liText.match(/(\d{4}[-/]\d{2}[-/]\d{2})/);
          if (dateMatch) {
            pubDate = dateMatch[1];
          } else {
            pubDate = liText.replace(/^(发布日期|发布时间)[：:]/, "").trim();
          }
        } else if (liText.includes("节目内容：") || liText.includes("内容简介：")) {
          content = liText.replace(/^(节目内容|内容简介)[：:]/, "").trim();
        }
      });
    }
    
    if (!content) {
      const metaDesc = $('meta[name="description"]');
      if (metaDesc.length > 0) {
        content = metaDesc.attr("content") || "";
      }
    }
    
    if (!content) {
      const contentDiv = $("div[class*='content'], div[class*='intro'], div[class*='desc']");
      if (contentDiv.length > 0) {
        content = contentDiv.text().trim().substring(0, 500);
      }
    }
    
    if (content && /^\d{4}[-/]\d{2}[-/]\d{2}\s*$/.test(content)) {
      content = "暂无节目简介";
    }
    if (!content) content = "暂无节目简介";
    
    // ========== 提取音频链接 ==========
    const audioLinks = [];
    const html = data;
    
    // 匹配完整格式的音频链接
    const pattern = /https?:\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi;
    const matches = html.match(pattern) || [];
    audioLinks.push(...matches);
    
    // 匹配协议相对路径
    const patternRel = /\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi;
    const matchesRel = html.match(patternRel) || [];
    audioLinks.push(...matchesRel);
    
    // 从audio/source标签提取
    $("audio, source").each((_, tag) => {
      const src = $(tag).attr("src") || "";
      if (src.includes("dl2.loveq.cn") && /\.mp3\?/.test(src) && src.includes("sign=") && src.includes("timestamp=")) {
        audioLinks.push(src);
      }
    });
    
    // 去重并完善链接
    const seen = new Set();
    const validLinks = [];
    for (let link of audioLinks) {
      if (seen.has(link)) continue;
      seen.add(link);
      if (link.startsWith("//")) {
        link = "https:" + link;
      }
      validLinks.push(link);
    }
    
    // 构建播放URL
    let playUrl = "";
    if (validLinks.length > 0) {
      if (validLinks.length > 1) {
        playUrl = validLinks.map((link, i) => `LoveQ音频$${link}`).join("$$$");
      } else {
        playUrl = `LoveQ音频$${validLinks[0]}`;
      }
    } else {
      playUrl = "暂无音频";
    }
    
    // 判断是否为得闲小叙
    let vodPic = appConfig.default_pic;
    if (originalTitle.includes("得闲小叙") || originalTitle.includes("得闲")) {
      vodPic = appConfig.dexian_pic;
    } else {
      const imgTag = $("img[class*='cover'], img[class*='poster'], img[class*='pic']");
      if (imgTag.length > 0) {
        let imgSrc = imgTag.attr("src");
        if (imgSrc) {
          if (imgSrc.startsWith("http")) {
            vodPic = imgSrc;
          } else {
            vodPic = new URL(imgSrc, appConfig.site).href;
          }
        }
      }
    }
    
    // 构建标题：日期 + 内容预览
    let newTitle = originalTitle;
    if (pubDate) {
      const formattedDate = pubDate.replace("/", "-");
      const contentPreview = content.length > 50 ? content.substring(0, 50) : content;
      newTitle = `${formattedDate} - ${contentPreview}`;
    }
    
    const desc = pubDate ? `📅 发布日期：${pubDate}\n📝 ${content}` : content;
    
    // 返回音轨
    if (validLinks.length > 0) {
      validLinks.forEach((link, index) => {
        tracks.push({
          name: `音轨 ${index + 1}`,
          pan: "",
          ext: {
            url: link,
            title: newTitle,
            desc: desc,
            pic: vodPic,
          },
        });
      });
    } else {
      tracks.push({
        name: "暂无音频",
        pan: "",
        ext: {
          url: "",
          title: newTitle,
          desc: desc,
          pic: vodPic,
        },
      });
    }
    
    return jsonify({
      list: [
        {
          title: newTitle,
          tracks: tracks,
        },
      ],
    });
  } catch (e) {
    console.log("获取详情失败:", e);
    return jsonify({ list: [{ title: "获取失败", tracks: [] }] });
  }
}

// ========== 获取播放信息 ==========
async function getPlayinfo(ext) {
  ext = argsify(ext);
  const url = ext.url;
  
  // 处理多音轨情况
  let playUrl = url;
  if (url && url.includes("$$$")) {
    const firstTrack = url.split("$$$")[0];
    if (firstTrack && firstTrack.includes("$")) {
      playUrl = firstTrack.split("$")[1];
    } else {
      playUrl = firstTrack;
    }
  } else if (url && url.includes("$")) {
    playUrl = url.split("$")[1];
  }
  
  const headers = {
    "User-Agent": UA,
    "Referer": appConfig.site + "/",
    "Origin": appConfig.site,
    "Accept": "audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*/*;q=0.5",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Range": "bytes=0-",
    "Connection": "keep-alive",
  };
  
  return jsonify({
    urls: [playUrl],
    headers: [headers],
  });
}

// ========== 主页内容 ==========
async function homeVideoContent() {
  return getCards({ cat_id: "1", page: "1" });
}