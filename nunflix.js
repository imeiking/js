const cheerio = createCheerio()
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

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
    // 大部分此类站点分页参数为 ?page=N
    url = url + `?page=${page}`

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Referer': appConfig.site,
        },
    })

    const $ = cheerio.load(data)

    // 选择器保持原 Fmovies 模板结构
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

    return jsonify({
        list: cards,
    })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let groups = []
    let url = ext.url

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
            },
        })

        const $ = cheerio.load(data)
        
        // 获取影片ID和类型，通常在页面的隐藏字段或特定元素中
        const movie = {
            id: $('#watch_block').attr('data-id') || $('.watch_block').attr('data-id') || '',
            type: $('#watch_block').attr('data-type') || $('.watch_block').attr('data-type') || '', // 1: Movie, 2: TV
        }

        if (!movie.id) {
             // 备用方案：尝试从 URL 或其他 meta 标签提取 ID
             const scriptContent = $('script').text();
             const match = scriptContent.match(/movie_id\s*=\s*'(\d+)'/) || scriptContent.match(/id\s*:\s*'(\d+)'/);
             if (match) movie.id = match[1];
        }

        if (movie.type == '2') {
            // TV Show 处理逻辑
            // 1. 获取季列表
            const listRes = await $fetch.get(`${appConfig.site}/ajax/season/list/${movie.id}`, {
                headers: {
                    'User-Agent': UA,
                    'X-Requested-With': 'XMLHttpRequest',
                    Referer: url,
                },
            })
            
            const $list = cheerio.load(listRes.data)
            const seasons = $list('.dropdown-menu a').toArray() // 可能需要根据实际DOM调整选择器，通常是 .sl-title a 或 .dropdown-menu a
            
            let seasonInfo = []
            if (seasons.length > 0) {
                 seasonInfo = seasons.map((e) => ({
                    title: $list(e).text().trim(),
                    id: $list(e).attr('data-id'),
                }))
            } else {
                // 如果没有下拉菜单，尝试查找直接列表
                $list('.sl-title a.ss-item').each((_, e) => {
                    seasonInfo.push({
                        title: $list(e).text().trim(),
                        id: $list(e).attr('data-id'),
                    })
                })
            }

            // 2. 获取每一季的集数
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
                const eps = $ep('li a') // 选择集数列表中的链接
                const group = {
                    title: title,
                    tracks: [],
                }

                eps.each((_, el) => {
                    const name = $ep(el).attr('title') || $ep(el).text().trim()
                    const id = $ep(el).attr('data-id')
                    const href = $ep(el).attr('href') // 有些站点用 href 跳转，有些用 data-id AJAX
                    
                    // 如果是用 data-id
                    if (id) {
                         group.tracks.push({
                            name,
                            pan: '',
                            ext: { id: id, type: 'ep' },
                        })
                    }
                })

                groups.push(group)
            }
        } else {
            // Movie 处理逻辑
            let mgroup = {
                title: 'Servers',
                tracks: [],
            }

            // 获取服务器列表
            let serverUrl = `${appConfig.site}/ajax/episode/list/${movie.id}`
            const serverRes = await $fetch.get(serverUrl, {
                headers: {
                    'User-Agent': UA,
                    'X-Requested-With': 'XMLHttpRequest',
                    Referer: url,
                },
            })
            const $server = cheerio.load(serverRes.data)
            const servers = $server('.server-select ul li a') // 这里的选择器可能需要根据 nunflix 实际微调
            
            if (servers.length > 0) {
                servers.each((_, el) => {
                    const name = $server(el).text().trim()
                    const id = $server(el).attr('data-linkid') || $server(el).attr('data-id')
                    mgroup.tracks.push({
                        name,
                        pan: '',
                        ext: { id: id, type: 'server' },
                    })
                })
            } else {
                 // 或者是单服务器直接 ID
                 mgroup.tracks.push({
                    name: 'Default',
                    pan: '',
                    ext: { id: movie.id, type: 'movie_direct' },
                })
            }
            groups.push(mgroup)
        }
    } catch (error) {
        $print(jsonify(error))
    }

    return jsonify({
        list: groups,
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const { id, type } = ext

    let playId = id
    let playUrl = ''
    let referer = appConfig.site

    try {
        // Step 1: 获取服务器/源 ID (如果是 EP 类型)
        if (type == 'ep') {
             // 获取该集的所有服务器源
            let url = `${appConfig.site}/ajax/episode/servers/${id}`
            const { data } = await $fetch.get(url, {
                headers: {
                    'User-Agent': UA,
                    'X-Requested-With': 'XMLHttpRequest',
                },
            })
            let $ = cheerio.load(data)
            // 选取第一个可用的服务器，或者随机
            const serverItem = $('.server-select ul li a').first()
            if (serverItem.length > 0) {
                playId = serverItem.attr('data-id')
            }
        }

        // Step 2: 获取具体的播放链接 (Embed Link)
        // 注意：这里的 API 路径 /ajax/episode/sources/ 是 Fmovies 模板通用的，但 nunflix 可能略有不同
        const { data } = await $fetch.get(`${appConfig.site}/ajax/episode/sources/${playId}`, {
            headers: {
                'User-Agent': UA,
                'X-Requested-With': 'XMLHttpRequest',
            },
        })

        const json = argsify(data)
        
        if (json.link) {
            const iframeUrl = json.link
            
            // 简单的直接解析：如果是 m3u8 或 mp4 直链
            if (iframeUrl.indexOf('.m3u8') > -1 || iframeUrl.indexOf('.mp4') > -1) {
                playUrl = iframeUrl
            } else {
                // 复杂的 iframe 解析 (类似原代码中的 nonce 提取)
                // 这里针对通用模板尝试获取
                const { data: iframeData } = await $fetch.get(iframeUrl, {
                    headers: {
                        'User-Agent': UA,
                        Referer: appConfig.site,
                    },
                })
                
                // 尝试提取 Source
                // 这是一个简化版的解析，如果 Nunflix 加密方式与 Fmovies 完全一致，可以使用原代码的 nonce 逻辑
                // 如果是 Vidsrc 等其他源，可能需要重写
                
                // 这里保留原有的 Fmovies 解密尝试结构
                const $ = cheerio.load(iframeData)
                let parseURL = new URL(iframeUrl)
                let fileId = iframeUrl.split('/').pop().split('?')[0] // 假设 ID 在 URL 末尾
                
                // 尝试寻找通用 API
                // 许多此类站点使用 /getSources?id=xxx
                let apiUrl = `https://${parseURL.hostname}/embed-1/v3/e-1/getSources?id=${fileId}` // 这是一个假设的 API 路径
                
                // 由于无法确定 nunflix 具体的播放器加密，这里返回 iframe 本身供 Webview 播放
                // 或者返回嗅探标志
                playUrl = iframeUrl
                return jsonify({ 
                    urls: [playUrl], 
                    headers: [{ 'User-Agent': UA, Referer: referer }],
                    parse: 1, // 开启嗅探模式，因为无法确定具体解密算法
                    jx: 1 
                })
            }
        }

    } catch (error) {
        $print(error)
    }

    return jsonify({ 
        urls: [playUrl], 
        headers: [{ 'User-Agent': UA, Referer: referer }] 
    })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []

    let text = encodeURIComponent(ext.text)
    let page = ext.page || 1
    // Nunflix 搜索路径通常是 /search/keyword 或 /search?keyword=
    let url = `${appConfig.site}/search/${text}?page=${page}`

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Referer': appConfig.site
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

    return jsonify({
        list: cards,
    })
}

// URL Polyfill for environments without URL class
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
        this.search
            .substring(1)
            .split('&')
            .forEach(function (pair) {
                var parts = pair.split('=')
                var key = decodeURIComponent(parts[0])
                var value = decodeURIComponent(parts[1] || '')
                params[key] = value
            })
    }

    this.searchParams = {
        get: function (key) {
            return params[key] || null
        },
        has: function (key) {
            return key in params
        },
        entries: function () {
            return Object.entries(params)
        },
        keys: function () {
            return Object.keys(params)
        },
        values: function () {
            return Object.values(params)
        },
        toString: function () {
            return Object.entries(params)
                .map(function (kv) {
                    return encodeURIComponent(kv[0]) + '=' + encodeURIComponent(kv[1])
                })
                .join('&')
        },
    }
}
