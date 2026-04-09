const cheerio = createCheerio()

let $config = argsify($config_str)
const SITE = $config.site || "https://animotvslash.org"
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

// 1. 获取配置
async function getConfig() {
    const appConfig = {
        ver: 1,
        title: "AnimoTV",
        site: SITE,
        tabs: [
            { name: 'TV动画', ext: { url: '/anime/?type=tv' } },
            { name: '剧场版', ext: { url: '/anime/?type=movie' } },
            { name: '最新更新', ext: { url: '/anime/?status=&type=&order=update' } }
        ]
    }
    return jsonify(appConfig)
}

// 2. 获取列表
async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let page = ext.page || 1
    let url = SITE + ext.url + (page > 1 ? (ext.url.includes('?') ? `&page=${page}` : `/page/${page}/`) : '')

    const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } })
    const $ = cheerio.load(data)

    $('article.bs').each((_, each) => {
        const path = $(each).find('a').attr('href')
        if (path) {
            cards.push({
                vod_id: path,
                vod_name: $(each).find('.tt h2').text().trim(),
                vod_pic: $(each).find('img').attr('src'),
                vod_remarks: $(each).find('.epx').text().trim(),
                ext: { url: path.startsWith('http') ? path : SITE + path }
            })
        }
    })
    return jsonify({ list: cards })
}

// 3. 获取剧集（修复列表显示）
async function getTracks(ext) {
    const { url } = argsify(ext)
    const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } })
    const $ = cheerio.load(data)

    let group = { title: '在线播放', tracks: [] }
    const listItems = $('.eplister ul li a, .episodelist ul li a')
    
    if (listItems.length > 0) {
        listItems.each((_, item) => {
            let epName = $(item).find('.epl-num').text().trim() || $(item).find('.playinfo h3').text().trim() || $(item).text().trim()
            if(epName.match(/Episode\s*(\d+)/i)) epName = '第' + epName.match(/Episode\s*(\d+)/i)[1] + '集'
            
            group.tracks.push({
                name: epName,
                ext: { url: $(item).attr('href'), referer: url } // 记录当前页面作为引用页
            })
        })
        // 自动排序
        let firstNum = parseInt(group.tracks[0].name.replace(/[^\d]/g, ""))
        let lastNum = parseInt(group.tracks[group.tracks.length-1].name.replace(/[^\d]/g, ""))
        if (firstNum > lastNum) group.tracks.reverse()
    } else {
        group.tracks.push({ name: '播放本集', ext: { url: url, referer: url } })
    }
    return jsonify({ list: [group] })
}

// 4. 获取播放链接（核心修复：增加Referer伪装）
async function getPlayinfo(ext) {
    ext = argsify(ext)
    const episodeUrl = ext.url
    const { data } = await $fetch.get(episodeUrl, { headers: { 'User-Agent': UA, 'Referer': SITE + '/' } })
    
    let realUrl = ""

    // 尝试直接从源码中提取 m3u8（这是最稳的方式）
    let m3u8Match = data.match(/"contentUrl"\s*:\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/i)
    if (m3u8Match) {
        realUrl = m3u8Match[1]
    }

    // 如果没找到，解密下拉菜单里的线路
    if (!realUrl) {
        const $ = cheerio.load(data)
        let base64Code = ""
        $('select.mirror option').each((_, item) => {
            let val = $(item).attr('value')
            if (val && val.length > 50) base64Code = val
        })

        if (base64Code) {
            try {
                let decoded = decodeURIComponent(escape(atob(base64Code)))
                let innerM3u8 = decoded.match(/https?:\/\/[^"']+\.m3u8[^"']*/i)
                if (innerM3u8) realUrl = innerM3u8[0]
            } catch(e) {}
        }
    }

    // 关键：构建骗过服务器的请求头
    const playHeaders = {
        'User-Agent': UA,
        'Referer': episodeUrl, // 必须是当前这一集的网址
        'Origin': SITE,
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    }

    return jsonify({
        urls: [ realUrl ],
        headers: playHeaders  // 注意：这里不再用数组包裹
    })
}

// 5. 搜索
async function search(ext) {
    ext = argsify(ext)
    const url = SITE + `/?s=${encodeURIComponent(ext.text)}`
    const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } })
    const $ = cheerio.load(data)
    let cards = []

    $('article.bs').each((_, each) => {
        cards.push({
            vod_id: $(each).find('a').attr('href'),
            vod_name: $(each).find('.tt h2').text().trim(),
            vod_pic: $(each).find('img').attr('src'),
            ext: { url: $(each).find('a').attr('href') }
        })
    })
    return jsonify({ list: cards })
}
