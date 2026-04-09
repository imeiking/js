const cheerio = createCheerio()

let $config = argsify($config_str)
const SITE = $config.site || "https://animotvslash.org"
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
const headers = {
    'Referer': `${SITE}/`,
    'Origin': `${SITE}`,
    'User-Agent': UA,
}

// 1. 获取分类菜单
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
}

async function getConfig() {
    return jsonify(appConfig)
}

// 2. 获取列表页
async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let page = ext.page || 1
    
    let url = appConfig.site + ext.url
    if (page > 1) {
        if (url.includes('?')) {
            url = url.replace('?', `/page/${page}/?`)
        } else {
            url = url.replace(/\/$/, '') + `/page/${page}/`
        }
    }

    const { data } = await $fetch.get(url, { headers })
    const $ = cheerio.load(data)

    $('article.bs').each((_, each) => {
        const path = $(each).find('a').attr('href')
        if (path) {
            const ep = $(each).find('.epx').text().trim()
            const subDub = $(each).find('.sb').text().trim()
            const remarks = ep + (subDub ? ` | ${subDub}` : '')

            cards.push({
                vod_id: path,
                vod_name: $(each).find('.tt h2').text().trim(),
                vod_pic: $(each).find('img').attr('src'),
                vod_remarks: remarks,
                ext: {
                    url: path.startsWith('http') ? path : appConfig.site + path,
                },
            })
        }
    })

    return jsonify({ list: cards })
}

// 3. 获取剧集列表
async function getTracks(ext) {
    const { url } = argsify(ext)
    const { data } = await $fetch.get(url, { headers })
    const $ = cheerio.load(data)

    let group = { 
        title: '播放列表', 
        tracks: [] 
    };

    // 分析源码发现，播放页侧边栏有一个 .episodelist 包含了所有集数
    const listItems = $('.episodelist ul li a');
    
    if (listItems.length > 0) {
        // 如果能找到列表，就遍历进去
        listItems.each((_, item) => {
            let epName = $(item).find('.playinfo h3').text().trim() || $(item).find('.playinfo span').text().trim();
            // 简化名字，比如只提取 "Episode 12"
            if(epName.includes('Episode')){
               let match = epName.match(/(Episode \d+)/);
               if(match) epName = match[1];
            }
            
            group.tracks.push({
                name: epName || '播放',
                ext: { url: $(item).attr('href') }
            });
        });
        
        // 网站的列表通常是最新的在前面（倒序），我们把它翻转一下变成正序（1,2,3...）
        group.tracks.reverse();
    } else {
        // 如果是单集电影没有列表，就只播放当前页
        group.tracks.push({
            name: '播放本集',
            ext: { url: url }
        });
    }

    return jsonify({ list: [group] })
}

// 4. 获取真实播放链接
async function getPlayinfo(ext) {
    ext = argsify(ext)
    let url = ext.url
    const { data } = await $fetch.get(url, { headers })
    const $ = cheerio.load(data)
    
    let player = ""

    // 分析源码：网站有多个线路，都藏在 <select class="mirror"> 里面，通过 Base64 加密
    // 我们提取第一个可用线路（通常是 value 不为空的第一个 option）
    let base64Code = '';
    $('select.mirror option').each((_, item) => {
        let val = $(item).attr('value');
        // 找到第一个有值的线路并跳出循环
        if (val && val.length > 10 && !base64Code) {
            base64Code = val;
        }
    });

    if (base64Code) {
        // 进行 Base64 解码，还原出包含 iframe 的 HTML 代码
        let decodedHtml = decodeURIComponent(escape(atob(base64Code)));
        const $$ = cheerio.load(decodedHtml);
        player = $$('iframe').attr('src') || "";
    } else {
        // 备用方案：如果网页里有直链（像你源码里有一段 "contentUrl":"https://rumble..."）
        let match = data.match(/"contentUrl":"(.*?\.m3u8)"/);
        if (match && match[1]) {
            player = match[1];
        }
    }

    return jsonify({
        urls: [ player ],
        headers: [ headers ],
    })
}

// 5. 搜索功能
async function search(ext) {
    ext = argsify(ext)
    let cards = [];
    let text = encodeURIComponent(ext.text)
    let page = ext.page || 1
    
    let url = appConfig.site + `/page/${page}/?s=${text}`
    if (page === 1) {
        url = appConfig.site + `/?s=${text}`
    }
    
    const { data } = await $fetch.get(url, { headers })
    const $ = cheerio.load(data)

    $('article.bs').each((_, each) => {
        const path = $(each).find('a').attr('href')
        if (path) {
            const ep = $(each).find('.epx').text().trim()
            const subDub = $(each).find('.sb').text().trim()
            cards.push({
                vod_id: path,
                vod_name: $(each).find('.tt h2').text().trim(),
                vod_pic: $(each).find('img').attr('src'),
                vod_remarks: ep + (subDub ? ` | ${subDub}` : ''),
                ext: {
                    url: path.startsWith('http') ? path : appConfig.site + path,
                },
            })
        }
    })

    return jsonify({ list: cards })
}
