const cheerio = createCheerio()
const UA =
'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
let appConfig = {
ver: 1,
title: 'nunflix',
site: 'https://nunflix.uk',
tabs: [
{
name: 'movies',
ext: {
url: 'https://nunflix.uk/movies',
},
},
{
name: 'tv-shows',
ext: {
url: 'https://nunflix.uk/tv-shows',
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
// nunflix.uk 没有明显分页参数，直接追加 ?page=${page} 或根据实际观察调整（许多类似站点支持）
url = url + (url.includes('?') ? '&' : '?') + `page=${page}`

    const { data } = await $fetch.get(url, {
    headers: {
        'User-Agent': UA,
    },
})

const $ = cheerio.load(data)

// 根据类似 fmovies 站点常见结构调整选择器（flw-item 风格网格常见于此类克隆站）
// 如果实际不同，可进一步测试常见类：.film_list-wrap > .flw-item 或 .movie-item 等
$('.film_list-wrap > div.flw-item').each((_, e) => {
    const href = $(e).find('a').attr('href') || $(e).find('.film-poster a').attr('href') || $(e).find('.film-poster-ahref').attr('href')
    const title = $(e).find('a').attr('title') || $(e).find('.film-name').text().trim() || $(e).find('.film-poster-ahref').attr('title')
    const cover = $(e).find('img').attr('data-src') || $(e).find('img').attr('src') || $(e).find('.film-poster-img').attr('data-src')
    const remarks = $(e).find('.quality, .fd-quality, .film-poster-quality').text().trim() || ''
    cards.push({
        vod_id: href,
        vod_name: title,
        vod_pic: cover,
        vod_remarks: remarks,
        ext: {
            url: `${appConfig.site}${href}`,
        },
    })
})

return jsonify({
    list: cards,
})

}
async function getTracks(ext) {
ext = argsify(ext)
let tracks = []
let groups = []
let url = ext.url

    try {
    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    const $ = cheerio.load(data)
    // 许多 fmovies 克隆站使用 data-id 和 data-type 属性
    const movie = {
        id: $('#watch-area').attr('data-id') || $('.watch_block').attr('data-id') || $('[data-id]').first().attr('data-id') || '',
        type: $('.watch_block').attr('data-type') || '1', // 默认假设 movie=1, tv=2
    }

    if (movie.type == '2' || url.includes('/tv-')) {
        // tv show

        const listRes = await $fetch.get(`${appConfig.site}/ajax/season/list/${movie.id}`, {
            headers: {
                'User-Agent': UA,
                'X-Requested-With': 'XMLHttpRequest',
                Referer: url,
            },
        })
        const $list = cheerio.load(listRes.data)
        const seasons = $list('.sl-title a, .ss-item, .dropdown-menu a').toArray()
        const seasonInfo = seasons.map((e) => ({
            title: $list(e).text().trim(),
            id: $list(e).attr('data-id') || $list(e).attr('data-season-id'),
        }))

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
            const eps = $ep('li, .ep-item, a[data-id]')
            const group = {
                title: title,
                tracks: [],
            }

            eps.each((_, el) => {
                const name = $ep(el).attr('title') || $ep(el).text().trim()
                const id = $ep(el).attr('data-id') || $ep(el).attr('data-epid')
                group.tracks.push({
                    name,
                    pan: '',
                    ext: { id: id, type: 'ep' },
                })
            })

            groups.push(group)
        }
    } else {
        // movie
        let mgroup = {
            title: 'server',
            tracks: [],
        }

        let serverUrl = `${appConfig.site}/ajax/episode/list/${movie.id}`
        const serverRes = await $fetch.get(serverUrl, {
            headers: {
                'User-Agent': UA,
                'X-Requested-With': 'XMLHttpRequest',
                Referer: url,
            },
        })
        const $server = cheerio.load(serverRes.data)
        const servers = $server('li a, .server-item, .link-item')
        servers.each((_, el) => {
            const name = $server(el).text().trim()
            const id = $server(el).attr('data-linkid') || $server(el).attr('data-id')
            mgroup.tracks.push({
                name,
                pan: '',
                ext: { id: id, type: 'server' },
            })
        })
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

    let playId, playUrl, referer

try {
    if (type == 'ep') {
        let server = []
        let url = `${appConfig.site}/ajax/episode/servers/${id}`
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'X-Requested-With': 'XMLHttpRequest',
            },
        })
        let $ = cheerio.load(data)
        const servers = $('li a, .server-item')
        servers.each((_, el) => {
            const name = $(el).text().trim()
            const id = $(el).attr('data-id') || $(el).attr('data-link-id')
            server.push({
                name,
                id,
            })
        })

        const randomIndex = Math.floor(Math.random() * server.length)
        playId = server[randomIndex].id
        $utils.toastInfo(`Using ${server[randomIndex].name}...`)
    } else {
        playId = id
    }

    const { data } = await $fetch.get(`${appConfig.site}/ajax/episode/sources/${playId}`, {
        headers: {
            'User-Agent': UA,
            'X-Requested-With': 'XMLHttpRequest',
        },
    })

    const json = argsify(data)
    const iframe = json.link || json.sources?.[0]?.file || json.url
    const { data: iframeData } = await $fetch.get(iframe, {
        headers: {
            'User-Agent': UA,
            Referer: appConfig.site,
        },
    })

    const $ = cheerio.load(iframeData)
    let fileId = $('[id$="-player"]').attr('data-id') || iframeData.match(/id=([^&"']+)/)?.[1]
    let nonce = extractNonce(iframeData)

    let parseURL = new URL(iframe)
    const parse = await $fetch.get(
        `https://${parseURL.hostname}/ajax/getSources?id=${fileId}&_k=${nonce}`,
        {
            headers: {
                'User-Agent': UA,
                'X-Requested-With': 'XMLHttpRequest',
                Referer: appConfig.site,
            },
        }
    )
    const parseJSON = argsify(parse.data)
    if (!parseJSON.encrypted) {
        playUrl = parseJSON.sources[0].file || parseJSON.source || parseJSON.file
        referer = `https://${parseURL.hostname}/`
    }
} catch (error) {
    $print(error)
}

function extractNonce(r) {
    const m =
        r.match(/\b[a-zA-Z0-9]{48}\b/) ||
        r.match(/\b([a-zA-Z0-9]{16})\b.?\b([a-zA-Z0-9]{16})\b.?\b([a-zA-Z0-9]{16})\b/)
    return m ? (m.length === 4 ? m.slice(1).join('') : m[0]) : null
}

return jsonify({ urls: [playUrl], headers: [{ 'User-Agent': UA, Referer: referer }] })

}
async function search(ext) {
ext = argsify(ext)
let cards = []

    let text = encodeURIComponent(ext.text)
let page = ext.page || 1
let url = `${appConfig.site}/search/${text}?page=${page}`

const { data } = await $fetch.get(url, {
    headers: {
        'User-Agent': UA,
    },
})

const $ = cheerio.load(data)

// 复用 getCards 中的选择器逻辑
$('.film_list-wrap > div.flw-item').each((_, e) => {
    const href = $(e).find('a').attr('href') || $(e).find('.film-poster a').attr('href') || $(e).find('.film-poster-ahref').attr('href')
    const title = $(e).find('a').attr('title') || $(e).find('.film-name').text().trim() || $(e).find('.film-poster-ahref').attr('title')
    const cover = $(e).find('img').attr('data-src') || $(e).find('img').attr('src') || $(e).find('.film-poster-img').attr('data-src')
    const remarks = $(e).find('.quality, .fd-quality, .film-poster-quality').text().trim() || ''
    cards.push({
        vod_id: href,
        vod_name: title,
        vod_pic: cover,
        vod_remarks: remarks,
        ext: {
            url: `${appConfig.site}${href}`,
        },
    })
})

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

// searchParams
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
