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
        $print(`[getCards] Loading: ${url}`)
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
        $print(`[getCards] Found ${cards.length} items`)
    } catch (error) {
        $print('[getCards] Error: ' + error)
    }

    return jsonify({
        list: cards,
    })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let groups = []
    let url = ext.url
    $print(`[getTracks] Analyzying: ${url}`)

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
            },
        })

        const $ = cheerio.load(data)
        
        // === 核心逻辑：获取 ID ===
        // 1. 尝试从 URL 提取 (例如 /movie/name-12345)
        let idMatch = url.match(/-(\d+)(\/|$)/)
        let urlId = idMatch ? idMatch[1] : ''
        
        // 2. 尝试从 DOM 提取
        let domId = $('#watch_block').attr('data-id') || $('.watch_block').attr('data-id') || $('[data-id]').first().attr('data-id')
        
        // 3. 尝试从 JS 变量提取 (var movie_id = '...')
        let jsId = ''
        const scripts = $('script').text()
        const jsMatch = scripts.match(/movie_id\s*=\s*['"](\d+)['"]/) || scripts.match(/id\s*:\s*['"](\d+)['"]/)
        if (jsMatch) jsId = jsMatch[1]

        let movie = {
            id: domId || jsId || urlId,
            type: $('#watch_block').attr('data-type') || $('.watch_block').attr('data-type') || (url.includes('tv-show') ? '2' : '1'),
        }

        $print(`[getTracks] ID Found -> DOM:${domId} / JS:${jsId} / URL:${urlId} => FINAL: ${movie.id}`)

        if (!movie.id) {
            $print('[getTracks] No ID found! Fallback to Webview.')
            groups.push({
                title: 'Error: Cannot find ID',
                tracks: [{
                    name: 'Click to Open Website',
                    pan: '',
                    ext: { id: url, type: 'webview' }
                }]
            })
            return jsonify({ list: groups })
        }

        // === 根据类型获取选集 ===
        if (movie.type == '2') {
            // TV Show
            $print(`[getTracks] Processing TV Show ID: ${movie.id}`)
            
            // 请求季列表
            let seasonUrl = `${appConfig.site}/ajax/season/list/${movie.id}`
            const listRes = await $fetch.get(seasonUrl, {
                headers: {
                    'User-Agent': UA,
                    'X-Requested-With': 'XMLHttpRequest',
                    Referer: url,
                },
            })
            
            if (!listRes.data) {
                 $print('[getTracks] Season list API returned empty.')
            }

            const $list = cheerio.load(listRes.data)
            // 尝试多种选择器
            let seasons = $list('.dropdown-menu a').toArray()
            if (seasons.length == 0) seasons = $list('.sl-title a.ss-item').toArray()
            if (seasons.length == 0) seasons = $list('a.season-item').toArray()
            
            $print(`[getTracks] Found ${seasons.length} seasons`)

            // 遍历每一季
            for (const s of seasons) {
                const seasonId = $list(s).attr('data-id')
                const seasonTitle = $list(s).text().trim()
                
                let epUrl = `${appConfig.site}/ajax/season/episodes/${seasonId}`
                const epRes = await $fetch.get(epUrl, {
                    headers: {
                        'User-Agent': UA,
