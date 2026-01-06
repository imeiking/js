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

// === 获取列表 ===
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
            // 同时兼容 data-src (懒加载) 和 src
            const cover = $(e).find('.film-poster-img').attr('data-src') || $(e).find('.film-poster-img').attr('src')
            const remarks = $(e).find('.film-poster-quality').text() || $(e).find('.fdi-item.type').text() || ''
            
            if (href && title) {
                cards.push({
                    vod_id: href, // 这里传递相对路径
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

// === 获取选集 (核心修复部分) ===
async function getTracks(ext) {
    ext = argsify(ext)
    let url = ext.url
    let groups = []
    
    // 策略1：构建一个“兜底”的 Webview 播放选项
    // 确保无论解析是否成功，用户界面上至少有一个按钮，不会空白
    let webviewGroup = {
        title: '快速播放',
        tracks: [{
            name: '跳转网页播放 (Webview)',
            pan: '',
            ext: { id: url, type: 'webview' }
        }]
    }

    try {
        // 策略2：尝试从 URL 中直接提取 ID (绕过网页源码解析)
        // 例子: https://nunflix.uk/movie/wonka-12345 -> 提取 12345
        let idMatch = url.match(/-(\d+)(\/|$)/)
        let id = idMatch ? idMatch[1] : ''
        
        // 判断类型: 如果 URL 包含 'tv-show' 则是剧集
        let type = url.includes('tv-show') ? '2' : '1'

        // 策略3：如果 URL 没提取到，再尝试请求网页源码查找 ID
        if (!id) {
            $print('URL ID extraction failed, fetching HTML...')
            const { data } = await $fetch.get(url, {
                headers: { 'User-Agent': UA, 'Referer': appConfig.site }
            })
            const $ = cheerio.load(data)
            // 尝试多种选择器
            id = $('#watch_block').attr('data-id') || 
                 $('.watch_block').attr('data-id') || 
                 $('[data-id]').first().attr('data-id')
            
            // 尝试从 JS 变量提取
            if (!id) {
                 const scripts = $('script').text()
                 const jsMatch = scripts.match(/movie_id\s*=\s*['"](\d+)['"]/)
                 if (jsMatch) id = jsMatch[1]
            }
        }

        $print(`Final ID: ${id}, Type: ${type}`)

        // 如果获取到了 ID，尝试获取详细选集
        if (id) {
            if (type == '2') { 
                // === 电视剧逻辑 ===
                // 1. 获取季列表
                const listRes = await $fetch.get(`${appConfig.site}/ajax/season/list/${id}`, {
                    headers: { 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest', 'Referer': url }
                })
                const $list = cheerio.load(listRes.data)
                // 兼容 dropdown-menu 和 sl-title 两种结构
                let seasons = $list('.dropdown-menu a').toArray()
                if (seasons.length === 0) seasons = $list('.sl-title a.ss-item').toArray()
                
                // 2. 遍历获取集
                for (const s of seasons) {
                    const seasonId = $list(s).attr('data-id')
                    const seasonTitle = $list(s).text().trim()
                    
                    const epRes = await $fetch.get(`${appConfig.site}/ajax/season/episodes/${seasonId}`, {
                        headers: { 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest', 'Referer': url }
                    })
                    const $ep = cheerio.load(epRes.data)
                    let tracks = []
                    
                    $ep('li a').each((_, el) => {
                        const epId = $ep(el).attr('data-id')
                        const name = $ep(el).attr('title') || $ep(el).text().trim()
                        if (epId) {
                            tracks.push({
                                name: name,
                                pan: '',
                                ext: { id: epId, type: 'ep' }
                            })
                        }
                    })
                    
                    if (tracks.length > 0) {
                        groups.push({ title: seasonTitle, tracks: tracks })
                    }
                }

            } else { 
                // === 电影逻辑 ===
                let serverGroup = { title: '线路选择', tracks: [] }
                
                // 尝试获取服务器列表 (即使失败也没关系，有自动播放兜底)
                try {
                    const serverRes = await $fetch.get(`${appConfig.site}/ajax/episode/list/${id}`, {
                        headers: { 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest', 'Referer': url }
                    })
                    const $server = cheerio.load(serverRes.data)
                    $server('.server-select ul li a').each((_, el) => {
                        serverGroup.tracks.push({
                            name: $server(el).text().trim(),
                            pan: '',
                            ext: { id: $server(el).attr('data-id') || $server(el).attr('data-linkid'), type: 'server' }
                        })
                    })
                } catch (e) {}

                // 添加一个自动播放选项
                serverGroup.tracks.push({
                    name: '自动播放 (Auto)',
                    pan: '',
                    ext: { id: id, type: 'movie_direct' }
                })
                
                groups.push(serverGroup)
            }
        }

    } catch (e) {
        $print('Detailed Parsing Failed: ' + e)
    }

    // 关键步骤：将兜底的分组加入到结果中
    // 这样即便上面全挂了，你依然能看到“快速播放”分组
    groups.push(webviewGroup)

    return jsonify({
        list: groups,
    })
}

// === 播放解析 ===
async function getPlayinfo(ext) {
    ext = argsify(ext)
    const { id, type } = ext
    
    // 如果是 Webview 模式，直接返回原页面 URL 并开启嗅探
    if (type === 'webview') {
        return jsonify({
            urls: [id],
            headers: [{ 'User-Agent': UA }],
            parse: 1, 
            jx: 1
        })
    }

    // API 解析模式
    let playUrl = ''
    try {
        // 构造 API 请求
        // 即使是 movie_direct，很多站点也支持直接用 movie ID 请求 sources
        let apiUrl = `${appConfig.site}/ajax/episode/sources/${id}`
        
        const { data } = await $fetch.get(apiUrl, {
            headers
