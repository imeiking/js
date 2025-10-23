const cheerio = createCheerio()

// 定义请求头 User-Agent
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const appConfig = {
    ver: 1,
    title: '海归影视',
    site: 'https://www.haigui.tv',
    tabs: [
        { name: '电影', ext: { id: 1 } },
        { name: '剧集', ext: { id: 2 } },
        { name: '综艺', ext: { id: 3 } },
        { name: '动漫', ext: { id: 4 } },
        { name: '纪录片', ext: { id: 5 } }
    ]
}

// 获取配置信息
async function getConfig() {
    return jsonify(appConfig)
}

// 获取分类影片列表
async function getCards(ext) {
    ext = argsify(ext)
    const cards = []
    const { page = 1, id } = ext
    const url = `${appConfig.site}/category/${id}?page=${page}`

    try {
        const { data } = await $fetch.get(url, {
            headers: { 'User-Agent': UA }
        })
        const $ = cheerio.load(data)

        $('.movie-item').each((_, e) => {
            const $el = $(e)
            const href = $el.find('a').attr('href')
            const title = $el.find('.movie-name').text().trim()
            const cover = $el.find('img').attr('src')
            const remarks = $el.find('.movie-score').text().trim()

            if (href && title) {
                cards.push({
                    vod_id: href,
                    vod_name: title,
                    vod_pic: cover,
                    vod_remarks: remarks,
                    ext: { url: `${appConfig.site}${href}` }
                })
            }
        })
    } catch (error) {
        $print('getCards error:', error)
    }

    return jsonify({ list: cards })
}

// 获取播放列表
async function getTracks(ext) {
    ext = argsify(ext)
    const tracks = []
    const { url } = ext

    try {
        const { data } = await $fetch.get(url, {
            headers: { 'User-Agent': UA }
        })
        const $ = cheerio.load(data)

        $('.episode-item').each((_, e) => {
            const $el = $(e)
            const name = $el.text().trim()
            const playUrl = $el.attr('data-url')

            if (name && playUrl) {
                tracks.push({
                    name,
                    ext: { url: playUrl }
                })
            }
        })
    } catch (error) {
        $print('getTracks error:', error)
    }

    return jsonify({
        list: [{ title: '默认线路', tracks }]
    })
}

// 获取播放信息
async function getPlayinfo(ext) {
    ext = argsify(ext)
    try {
        const { url } = ext
        // 这里假设播放地址是直接可播放的URL
        return jsonify({ urls: [url] })
    } catch (error) {
        $print('getPlayinfo error:', error)
        return jsonify({ urls: [] })
    }
}

// 搜索功能
async function search(ext) {
    ext = argsify(ext)
    const cards = []
    const { text, page = 1 } = ext
    const searchUrl = `${appConfig.site}/search?q=${encodeURIComponent(text)}&page=${page}`

    try {
        const { data } = await $fetch.get(searchUrl, {
            headers: { 'User-Agent': UA }
        })
        const $ = cheerio.load(data)

        $('.movie-item').each((_, e) => {
            const $el = $(e)
            const href = $el.find('a').attr('href')
            const title = $el.find('.movie-name').text().trim()
            const cover = $el.find('img').attr('src')
            const remarks = $el.find('.movie-score').text().trim()

            if (href && title) {
                cards.push({
                    vod_id: href,
                    vod_name: title,
                    vod_pic: cover,
                    vod_remarks: remarks,
                    ext: { url: `${appConfig.site}${href}` }
                })
            }
        })
    } catch (error) {
        $print('search error:', error)
    }

    return jsonify({ list: cards })
}
