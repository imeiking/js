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

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, url } = ext
    
    // 简单拼接分页参数
    url = url + `?page=${page}`

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
                        // 传递完整的网页地址
                        url: `${appConfig.site}${href}`,
                    },
                })
            }
        })
    } catch (error) {
        $print('getCards Error: ' + error)
    }

    return jsonify({
        list: cards,
    })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let url = ext.url
    let groups = []

    // 核心修改：不做任何复杂的 API 请求，直接生成一个“网页嗅探”按钮
    // 这样 100% 保证有按钮可点，不会空白
    groups.push({
        title: '快速播放',
        tracks: [{
            name: '点击播放 (网页嗅探)',
            pan: '',
            ext: { id: url, type: 'webview' }
        }]
    })

    return jsonify({
        list: groups,
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const { id, type } = ext

    // 直接把网页 URL 扔给播放器，开启嗅探模式 (parse: 1, jx: 1)
    if (type === 'webview') {
        return jsonify({
            urls: [id],
            headers: [{ 'User-Agent': UA }],
            parse: 1, 
            jx: 1
        })
    }

    return jsonify({ urls: [] })
}

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
