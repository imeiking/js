const cheerio = createCheerio();

// === 1. 基础全局配置 ===
let $config = argsify($config_str);
const SITE = $config.site || "https://animotvslash.org";
// 伪装成常规电脑浏览器
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
// 基础请求头
const baseHeaders = {
    'Referer': `${SITE}/`,
    'Origin': `${SITE}`,
    'User-Agent': UA,
};

// === 2. 获取分类菜单 ===
async function getConfig() {
    const appConfig = {
        ver: 1,
        title: "AnimoTV",
        site: SITE,
        tabs: [
            { name: 'TV动画', ext: { url: '/anime/?type=tv' } },
            { name: '剧场版', ext: { url: '/anime/?type=movie' } },
            { name: '最新更新', ext: { url: '/anime/?status=&type=&order=update' } },
            { name: '热门排行', ext: { url: '/anime/?status=&type=&order=popular' } }
        ]
    };
    return jsonify(appConfig);
}

// === 3. 获取视频列表（支持翻页） ===
async function getCards(ext) {
    ext = argsify(ext);
    let cards = [];
    let page = ext.page || 1;
    
    // 处理翻页网址逻辑
    let url = SITE + ext.url;
    if (page > 1) {
        if (url.includes('?')) {
            url = url.replace('?', `/page/${page}/?`);
        } else {
            url = url.replace(/\/$/, '') + `/page/${page}/`;
        }
    }

    const { data } = await $fetch.get(url, { headers: baseHeaders });
    const $ = cheerio.load(data);

    $('article.bs').each((_, each) => {
        const path = $(each).find('a').attr('href');
        if (path) {
            // 提取集数和语言标识
            const ep = $(each).find('.epx').text().trim();
            const subDub = $(each).find('.sb').text().trim();
            const remarks = ep + (subDub ? ` | ${subDub}` : '');

            cards.push({
                vod_id: path,
                vod_name: $(each).find('.tt h2').text().trim(),
                vod_pic: $(each).find('img').attr('src'),
                vod_remarks: remarks,
                ext: {
                    url: path.startsWith('http') ? path : SITE + path,
                },
            });
        }
    });

    return jsonify({ list: cards });
}

// === 4. 获取剧集列表（自动正序排列） ===
async function getTracks(ext) {
    const { url } = argsify(ext);
    const { data } = await $fetch.get(url, { headers: baseHeaders });
    const $ = cheerio.load(data);

    let group = { 
        title: '播放列表', 
        tracks: [] 
    };

    // 兼容详情页和播放页的列表标签
    const listItems = $('.eplister ul li a, .episodelist ul li a');
    
    if (listItems.length > 0) {
        listItems.each((_, item) => {
            // 提取原始名称
            let epName = $(item).find('.epl-num').text().trim() || $(item).find('.playinfo h3').text().trim() || $(item).text().trim();
            
            // 精简名称，例如把 "Episode 12" 变成 "第12集"
            if(epName.match(/Episode\s*(\d+)/i)){
               let match = epName.match(/Episode\s*(\d+)/i);
               epName = '第' + match[1] + '集';
            }
            
            let link = $(item).attr('href');
            if (link) {
                group.tracks.push({
                    name: epName,
                    ext: { url: link.startsWith('http') ? link : SITE + link }
                });
            }
        });
        
        // 自动排序判断：如果抓取到的列表是倒序（比如第12集在最上面），则将其翻转为正序
        if (group.tracks.length > 1) {
            let firstMatch = group.tracks[0].name.match(/\d+/);
            let lastMatch = group.tracks[group.tracks.length - 1].name.match(/\d+/);
            if (firstMatch && lastMatch && parseInt(firstMatch[0]) > parseInt(lastMatch[0])) {
                group.tracks.reverse();
            }
        }
    } else {
        // 如果是电影或单集，没有找到列表，默认播放当前页
        group.tracks.push({
            name: '播放本片',
            ext: { url: url }
        });
    }

    return jsonify({ list: [group] });
}

// === 5. 获取真实播放直链（xptv 专版） ===
async function getPlayinfo(ext) {
    ext = argsify(ext);
    let url = ext.url;
    
    // 访问播放页面
    const { data } = await $fetch.get(url, { headers: baseHeaders });
    let finalUrl = "";

    // 优选方案：直接利用正则从源码中的 JSON-LD 数据里提取最高清的 m3u8 直链
    let m3u8Match = data.match(/"contentUrl"\s*:\s*"(https?:\/\/[^"]+\.(m3u8|mp4)[^"]*)"/i);
    
    if (m3u8Match && m3u8Match[1]) {
        finalUrl = m3u8Match[1];
    } else {
        // 兜底方案：如果页面结构变化，尝试解密下拉菜单中的 Rumble 线路
        const $ = cheerio.load(data);
        let options = $('select.mirror option').toArray();
        for (let item of options) {
            let val = $(item).attr('value');
            // 寻找加密的长字符串
            if (val && val.length > 20) {
                try {
                    let decodedHtml = decodeURIComponent(escape(atob(val)));
                    // 只要带有 jw-player，通常就是官方隐藏的直链
                    if (decodedHtml.includes('jw-player')) {
                        let base64Param = decodedHtml.split('/jw-player/')[1].split('"')[0];
                        let jwConfig = JSON.parse(decodeURIComponent(escape(atob(base64Param))));
                        if (jwConfig.url) {
                            finalUrl = jwConfig.url;
                            break;
                        }
                    }
                } catch(e) {}
            }
        }
    }

    // 构建 xptv 专用的返回结构
    return jsonify({
        urls: [ finalUrl ],
        // xptv 中 Headers 直接用对象包裹，加入 Rumble 的 Referer 破解防盗链
        headers: {
            'User-Agent': UA,
            'Referer': 'https://rumble.com/',
            'Origin': 'https://rumble.com'
        }
    });
}

// === 6. 搜索功能 ===
async function search(ext) {
    ext = argsify(ext);
    let cards = [];
    let text = encodeURIComponent(ext.text);
    let page = ext.page || 1;
    
    let url = SITE + `/page/${page}/?s=${text}`;
    if (page === 1) {
        url = SITE + `/?s=${text}`;
    }
    
    const { data } = await $fetch.get(url, { headers: baseHeaders });
    const $ = cheerio.load(data);

    $('article.bs').each((_, each) => {
        const path = $(each).find('a').attr('href');
        if (path) {
            const ep = $(each).find('.epx').text().trim();
            const subDub = $(each).find('.sb').text().trim();
            
            cards.push({
                vod_id: path,
                vod_name: $(each).find('.tt h2').text().trim(),
                vod_pic: $(each).find('img').attr('src'),
                vod_remarks: ep + (subDub ? ` | ${subDub}` : ''),
                ext: {
                    url: path.startsWith('http') ? path : SITE + path,
                },
            });
        }
    });

    return jsonify({ list: cards });
}
