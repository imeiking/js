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
            const remarks = $(e).find('.film-poster-quality').text() || $(e).find('.fdi-item.type').text() || ''
            
            if (href && title) {
                cards.push({
                    vod_id: href,
                    vod_name: title,
                    vod_pic: cover,
                    vod_remarks: remarks,
                    ext: {
                        url: `${appConfig.site}${href}`,
                    },
                })
            }
        })
    } catch (error) {
        $print('getCards error: ' + error)
    }

    return jsonify({
        list: cards,
    })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let groups = []
    let url = ext.url
    
    // 1. 尝试从 URL 中提取 ID (Nunflix 格式通常是 name-12345)
    let idMatch = url.match(/-(\d+)(\/|$)/)
    let urlId = idMatch ? idMatch[1] : ''

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
            },
        })

        const $ = cheerio.load(data)
        
        // 2. 尝试从 DOM 获取 ID 和 Type
        // 优先使用 DOM 中的 ID，如果没有则使用 URL 中的 ID
        let movie = {
            id: $('#watch_block').attr('data-id') || $('.watch_block').attr('data-id') || urlId,
            type: $('#watch_block').attr('data-type') || $('.watch_block').attr('data-type') || (url.includes('tv-show') ? '2' : '1'),
        }

        // 如果连 ID 都找不到，直接返回网页跳转
        if (!movie.id) {
            groups.push({
                title: 'Web Parse',
                tracks: [{
                    name: 'Go to Website',
                    pan: '',
                    ext: { id: url, type: 'webview' }
                }]
            })
            return jsonify({ list: groups })
        }

        if (movie.type == '2') {
            // === TV Show 逻辑 ===
            // 获取季列表
            const listRes = await $fetch.get(`${appConfig.site}/ajax/season/list/${movie.id}`, {
                headers: {
                    'User-Agent': UA,
                    'X-Requested-With': 'XMLHttpRequest',
                    Referer: url,
                },
            })
            
            const $list = cheerio.load(listRes.data)
            const seasons = $list('.dropdown-menu a').toArray()
            
            let seasonInfo = []
            if (seasons.length > 0) {
                 seasonInfo = seasons.map((e) => ({
                    title: $list(e).text().trim(),
                    id: $list(e).attr('data-id'),
                }))
            } else {
                // 备选选择器
                 $list('.sl-title a.ss-item').each((_, e) => {
                    seasonInfo.push({
                        title: $list(e).text().trim(),
                        id: $list(e).attr('data-id'),
                    })
                })
            }

            // 遍历获取每一季的集数
            for (const { title, id: seasonId } of seasonInfo) {
                let epUrl = `${appConfig.site}/ajax/season/episodes/${seasonId}`
                const { data } = await $fetch.get(epUrl, {
                    headers: {
                        'User-Agent': UA,
                        'X-Requested-With': 'XMLHttpRequest',
                        Referer: url,
                    },
                })

                const $ep = cheerio.load(data)
                const eps = $ep('li a')
                const group = {
                    title: title,
                    tracks: [],
                }

                eps.each((_, el) => {
                    const name = $ep(el).attr('title') || $ep(el).text().trim()
                    const epId = $ep(el).attr('data-id')
                    
                    if (epId) {
                         group.tracks.push({
                            name: name,
                            pan: '',
                            ext: { id: epId, type: 'ep' },
                        })
                    }
                })
                if(group.tracks.length > 0) groups.push(group)
            }
        } else {
            // === Movie 逻辑 ===
            let mgroup = {
                title: 'Servers',
                tracks: [],
            }

            // 尝试获取服务器列表
            let serverUrl = `${appConfig.site}/ajax/episode/list/${movie.id}`
            try {
                const serverRes = await $fetch.get(serverUrl, {
                    headers: {
                        'User-Agent': UA,
                        'X-Requested-With': 'XMLHttpRequest',
                        Referer: url,
                    },
                })
                const $server = cheerio.load(serverRes.data)
                const servers = $server('.server-select ul li a')
                
                if (servers.length > 0) {
                    servers.each((_, el) => {
                        const name = $server(el).text().trim()
                        const sId = $server(el).attr('data-linkid') || $server(el).attr('data-id')
                        mgroup.tracks.push({
                            name: name,
                            pan: '',
                            ext: { id: sId, type: 'server' },
                        })
                    })
                }
            } catch (e) {
                // 如果获取服务器失败，忽略错误，直接添加默认源
            }

            // 无论是否获取到服务器，都添加一个默认项，防止为空
            if (mgroup.tracks.length === 0) {
                mgroup.tracks.push({
                    name: 'Auto Play',
                    pan: '',
                    ext: { id: movie.id, type: 'movie_direct' },
                })
            }
            groups.push(mgroup)
        }
    } catch (error) {
        $print('getTracks error: ' + error)
        // 出错时，提供一个直接跳转网页的选项
        groups.push({
            title: 'Fallback',
            tracks: [{
                name: 'Web Play (Source)',
                pan: '',
                ext: { id: url, type: 'webview' }
            }]
        })
    }

    return jsonify({
        list: groups,
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const { id, type } = ext
    
    // 如果是 Webview 兜底模式
    if (type === 'webview') {
        return jsonify({
            urls: [id],
            headers: [{ 'User-Agent': UA }],
            parse: 1, // 开启嗅探
            jx: 1
        })
    }

    let playId = id
    let playUrl = ''
    
    try {
        // Step 1: Movie 类型如果没有具体的 Server ID，可能需要先请求 Server
        if (type === 'movie_direct') {
             // 简化的处理，直接尝试获取默认源
             // 实际上 Nunflix 需要先 server -> sources
             // 这里为了容错，直接构造可能的 API
             playId = id 
        }

        // Step 2: EP 类型 (电视剧) 通常 ID 就是 server ID
        // 如果需要可以像原代码一样先请求 /servers/ 但通常列表页拿到的已经是引用 ID

        // Step 3: 请求源链接
        const { data } = await $fetch.get(`${appConfig.site}/ajax/episode/sources/${playId}`, {
            headers: {
                'User-Agent': UA,
                'X-Requested-With': 'XMLHttpRequest',
            },
        })

        const json = argsify(data)
        
        if (json.link) {
            playUrl = json.link
            
            // 如果链接不是直连 (m3u8/mp4)，则开启 webview 嗅探
            if (!playUrl.includes('.m3u8') && !playUrl.includes('.mp4')) {
                return jsonify({ 
                    urls: [playUrl], 
                    headers: [{ 'User-Agent': UA, Referer: appConfig.site }],
                    parse: 1, 
                    jx: 1 
                })
            }
        } else {
            // API 没返回 link，可能是 ID 错误或反爬
            // 此时没有 URL，播放器会报错
        }

    } catch (error) {
        $print('getPlayinfo error: ' + error)
    }

    return jsonify({ 
        urls: [playUrl], 
        headers: [{ 'User-Agent': UA, Referer: appConfig.site }] 
    })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []

    let text = encodeURIComponent(ext.text)
    let page = ext.page || 1
    // 搜索 URL
    let url = `${appConfig.site}/search/${text}?page=${page}`

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
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
                        url: `${appConfig.site}${href}`,
                    },
                })
            }
        })
    } catch (error) {}

    return jsonify({
        list: cards,
    })
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
