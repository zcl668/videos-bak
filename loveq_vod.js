// by @木凡的天空
const axios = require('axios');
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const appConfig = {
    ver: 1,
    title: 'LoveQ',
    site: 'https://www.loveq.cn',
    default_pic: 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg',
    dexian_pic: 'https://raw.githubusercontent.com/zcl668/videos-bak/main/loveq2026.jpg',
    filter_categories: ["盛世乾坤", "一些事一些情", "一些事一些情精华剪辑"]
};

// 获取首页分类
async function homeContent(filter) {
    const url = `${appConfig.site}/program.html`;
    const html = await get(url);
    if (!html) return { class: [] };

    const $ = cheerio.load(html);
    const categories = [];
    const seen = new Set();

    $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        const title = $(el).text().trim();
        const catMatch = href.match(/program-cat(\d+)-p\d+\.html/);
        
        if (catMatch && title && !appConfig.filter_categories.includes(title)) {
            const catId = catMatch[1];
            if (catId !== "0" && !seen.has(catId)) {
                seen.add(catId);
                categories.push({
                    type_name: title,
                    type_id: catId
                });
            }
        }
    });

    categories.sort((a, b) => parseInt(a.type_id) - parseInt(b.type_id));

    const currentYear = new Date().getFullYear();
    const years = [{ n: "全部年份", v: "" }];
    for (let y = currentYear; y > 2002; y--) {
        years.push({ n: String(y), v: String(y) });
    }

    const months = [{ n: "全部月份", v: "" }];
    for (let m = 1; m <= 12; m++) {
        months.push({ n: `${m}月`, v: String(m) });
    }

    const filters = {};
    for (const cat of categories) {
        filters[cat.type_id] = [
            { key: "year", name: "年份", value: years },
            { key: "month", name: "月份", value: months }
        ];
    }

    return jsonify({ class: categories, filters: filters });
}

async function homeVideoContent() {
    return categoryContent("1", "1", false, {});
}

// 分类内容
async function categoryContent(tid, pg, filter, extend) {
    const page = parseInt(pg);
    const params = new URLSearchParams();
    params.append('cat_id', tid);
    params.append('page', pg);
    
    if (extend.year) params.append('year', extend.year);
    if (extend.month) params.append('month', extend.month);

    const url = `${appConfig.site}/program.html?${params.toString