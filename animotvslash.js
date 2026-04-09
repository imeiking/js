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

// 3. 获取剧集列表 (修复只显示1集的问题)
async function getTracks(ext) {
    const { url } = argsify(ext)
    const { data } = await $fetch.get(url, { headers })
    const $ = cheerio.load(data)

    let group = { 
        title: '播放列表', 
        tracks: [] 
    };

    // 同时兼容“详情页”和“播放页”的两种不同列表标签
    const listItems = $('.eplister ul li a, .episodelist ul li a');
    
    if (listItems.length > 0) {
        listItems.each((_, item) => {
            // 提取集数名称
            let epName = $(item).find('.epl-num').text().trim() || $(item).find('.playinfo h3').text().trim() || $(item).text().trim();
            
            // 把冗长的名字清理一下，提取数字，比如变成 "第12集"
            if(epName.match(/Episode\s*(\d+)/i)){
               let match = epName.match(/Episode\s*(\d+)/i);
               epName = '第' + match[1] + '集';
            }
            
            let link = $(item).attr('href');
            if (link) {
                group.tracks.push({
                    name: epName,
                    ext: { url: link.startsWith('http') ? link : appConfig.site + link }
                });
            }
        });
        
        // 自动倒序判断：如果网站把最新一集（如第12集）放最前面，我们将其反转为正常的1,2,3顺序
        if (group.tracks.length > 1) {
            let firstMatch = group.tracks[0].name.match(/\d+/);
            let lastMatch = group.tracks[group.tracks.length - 1].name.match(/\d+/);
            if (firstMatch && lastMatch && parseInt(firstMatch[0]) > parseInt(lastMatch[0])) {
                group.tracks.reverse();
            }
        }
    } else {
        // 如果网页上完全没有列表（比如单部电影），就当做单集处理
        group.tracks.push({
            name: '播放本集',
            ext: { url: url }
        });
    }

    return jsonify({ list: [group] })
}

// 4. 获取真实播放链接 (修复无法播放的问题)
async function getPlayinfo(ext) {
    ext = argsify(ext)
    let url = ext.url
    const { data } = await $fetch.get(url, { headers })
    const $ = cheerio.load(data)
    
    let player = ""

    // 方案A：直接抓取源码中藏在配置信息里的最纯净的 .m3u8 源（效率最高，播放最快）
    let match = data.match(/"contentUrl"\s*:\s*"(https?:\/\/[^"]+\.(m3u8|mp4)[^"]*)"/i);
    if (match && match[1]) {
        player = match[1];
    }

    // 方案B：如果源码没有，去解析页面中的内部加密播放器代码
    if (!player) {
        let iframeSrc = $('#pembed iframe, .playvideo iframe').attr('src');
        if (iframeSrc && iframeSrc.includes('/jw-player/')) {
            let base64Param = iframeSrc.split('/jw-player/')[1];
            if (base64Param) {
                try {
                    let decoded = decodeURIComponent(escape(atob(base64Param)));
                    let jwConfig = JSON.parse(decoded);
                    if (jwConfig.url) player = jwConfig.url;
                } catch(e) {}
            }
        }
    }

    // 方案C：如果还是没找到，破解旁边的路线切换菜单（.mirror）
    if (!player) {
        let options = $('select.mirror option').toArray();
        for (let item of options) {
            let val = $(item).attr('value');
            if (val && val.length > 20) {
                try {
                    let decodedHtml = decodeURIComponent(escape(atob(val)));
                    
                    // 再次尝试从中提取 m3u8
                    let m3u8Match = decodedHtml.match(/"contentUrl"\s*:\s*"(https?:\/\/[^"]+\.(m3u8|mp4)[^"]*)"/i);
                    if (m3u8Match && m3u8Match[1]) {
                        player = m3u8Match[1];
                        break;
                    }
                    
                    // 提取里面的 iframe 给解析层
                    const $$ = cheerio.load(decodedHtml);
                    let innerIframe = $$('iframe').attr('src');
                    if (innerIframe && innerIframe.includes('/jw-player/')) {
                        let base64Param = innerIframe.split('/jw-player/')[1];
                        let jwConfig = JSON.parse(decodeURIComponent(escape(atob(base64Param))));
                        if (jwConfig.url) { player = jwConfig.url; break; }
                    } else if (innerIframe) {
                        player = innerIframe; 
                        break; 
                    }
                } catch(e) {}
            }
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
