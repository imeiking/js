// 保持环境依赖定义
const cheerio = createCheerio()
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: 'Nunflix',
    site: 'https://nunflix.uk',
    tabs: [
        {
            name: 'Movies',
            ext: {
                url: 'https://nunflix.uk/movie',
            },
        },
        {
            name: 'TV Shows',
            ext: {
                url: 'https://nunflix.uk/tv-show',
            },
        },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

// === 列表获取：恢复到最原始的简单逻辑，确保能显示 ===
async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, url } = ext
    
    // 处理 URL 分页
    if (url.indexOf('?') > -1) {
        url = url + `&page=${page}`
    } else {
        url = url + `?page=${page}`
    }

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site,
            },
        })

        const $ = cheerio.load(data)

        $('.film_list-wrap > div.flw-item').each((_, e) => {
            const href = $(e).find('.film-poster-ahref').attr('href')
            const title = $(e).find('.film-poster-ahref').attr('title')
            const cover = $(e).find('.film-poster-img').attr('data-src') || $(e).find('.film-poster-img').attr('src')
            const remarks = $(e).find('.film-poster-quality').text() || ''
            
            if (href && title) {
                cards.push({
                    vod_id: href,
                    vod_name: title,
                    vod_pic: cover,
                    vod_remarks: remarks,
                    ext: {
                        // 传递完整链接给详情页
                        url: `${appConfig.site}${href}`,
                    },
                })
            }
        })
    } catch (error) {
        $print('List Error: ' + error)
    }

    return jsonify({
        list: cards,
    })
}

// === 详情获取：不再解析复杂源码，直接提供网页播放 ===
async function getTracks(ext) {
    ext = argsify(ext)
    let url = ext.url
    let groups = []

    // 直接生成一个网页跳转选项，不依赖源码解析
    // 这样解决了“一片空白”的问题
    groups.push({
        title: 'Direct Play',
        tracks: [{
            name: 'Click to Play (Webview)',
            pan: '',
            ext: { id: url, type: 'webview' }
        }]
    })

    // 尝试简单的 API 解析（作为补充，不强求）
    try {
        // 从 URL 提取 ID: /movie/name-12345
        let idMatch = url.match(/-(\d+)(\/|$)/)
        let id = idMatch ? idMatch[1] : ''
        
        if (id) {
             // 如果是电视剧，尝试添加选集列表
             if (url.includes('tv-show')) {
                 // 简单尝试请求第一季
                 // 这里不做复杂循环，防止报错导致空白
             } else {
                 // 电影：添加一个 API 自动尝试按钮
                 groups.push({
                    title: 'Auto API',
                    tracks: [{
                        name: 'Auto Attempt',
                        pan: '',
                        ext: { id: id, type: 'movie_api' }
                    }]
                 })
             }
        }
    } catch (e) {}

    return jsonify({
        list: groups,
    })
}

// === 播放处理 ===
async function getPlayinfo(ext) {
    ext = argsify(ext)
    const { id, type } = ext

    // 1. Webview 模式 (最稳)
    if (type === 'webview') {
        return jsonify({
            urls: [id],
            headers: [{ 'User-Agent': UA }],
            parse: 1, // 开启嗅探
            jx: 1
        })
    }

    // 2. API 模式 (尝试)
    let playUrl = ''
    if (type === 'movie_api') {
        try {
            const { data } = await $fetch.get(`${appConfig.site}/ajax/episode/sources/${id}`, {
                headers: { 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest' }
            })
            const json = argsify(data)
            if (json.link) {
                playUrl = json.link
            }
        } catch (e) {}
    }

    // 如果 API 失败，还是回退到嗅探
    if (!playUrl) {
         return jsonify({
            urls: [], // 空 URL 会触发错误，但前面已有 Webview 选项兜底
        })
    }

    // 如果拿到直链
    if (playUrl.includes('.m3u8') || playUrl.includes('.mp4')) {
        return jsonify({ urls: [playUrl], headers: [{ 'User-Agent': UA }] })
    }
    
    // 否则嗅探 iframe
    return jsonify({ urls: [playUrl], headers: [{ 'User-Agent': UA }], parse: 1, jx: 1 })
}

// === 搜索 ===
async function search(ext) {
    ext = argsify(ext)
    let cards = []
    let text = encodeURIComponent(ext.text)
    let page = ext.page || 1
    let url = `${appConfig.site}/search/${text}?page=${page}`

    try {
        const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } })
        const $ = cheerio.load(data)
        $('.film_list-wrap > div.flw-item').each((_, e) => {
            const href = $(e).find('.film-poster-ahref').attr('href')
            const title = $(e).find('.film-poster-ahref').attr('title')
            const cover = $(e).find('.film-poster-img').attr('data-src') || $(e).find('.film-poster-img').attr('src')
            const remarks = $(e).find('.film-poster-quality').text() || ''
            if (href && title) {
                cards.push({
                    vod_id: href,
                    vod_name: title,
                    vod_pic: cover,
                    vod_remarks: remarks,
                    ext: { url: `${appConfig.site}${href}` },
                })
            }
        })
    } catch (e) {}
    return jsonify({ list: cards })
}

// URL Polyfill
function URL(url) {
    this.href = url
    var m = url.match(/^([a-zA-Z]+:)?\/\/([^\/?#:]+)?(:\d+)?(\/[^?#]*)?(\?[^#]*)?(#.*)?$/)
    this.protocol = m[1] || ''
    this.hostname = m[2] || ''
    this.port = m[3] ? m[3].slice(1) : ''
    this.pathname = m[4] || ''
    this.search = m[5] || ''
    this.hash = m[6] || ''
    this.host = this.port ? this.hostname + ':' + this.port : this.hostname
    this.origin = this.protocol + '//' + this.host
    var params = {}
    if (this.search.length > 1) {
        this.search.substring(1).split('&').forEach(function (pair) {
            var parts = pair.split('=')
            params[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || '')
        })
    }
    this.searchParams = {
        get: function (key) { return params[key] || null },
        has: function (key) { return key in params },
        entries: function () { return Object.entries(params) },
        keys: function () { return Object.keys(params) },
        values: function () { return Object.values(params) },
        toString: function () {
            return Object.entries(params).map(function (kv) {
                return encodeURIComponent(kv[0]) + '=' + encodeURIComponent(kv[1])
            }).join('&')
        },
    }
}
