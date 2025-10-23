const cheerio = createCheerio()
const CryptoJS = createCryptoJS()

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

// 获取分类影片列表（优化选择器适配）
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

        // 尝试多种可能的影片列表选择器
        const selectors = ['.movie-item', '.vod-item', '.video-card', '#list .item']
        let videoElements = null
        for (const selector of selectors) {
            videoElements = $(selector)
            if (videoElements.length > 0) break
        }

        if (!videoElements || videoElements.length === 0) {
            $print('未找到影片列表元素')
            return jsonify({ list: cards })
        }

        videoElements.each((_, e) => {
            const $el = $(e)
            const aTag = $el.find('a').first()
            const href = aTag.attr('href') || $el.attr('data-href')
            const title = aTag.attr('title') || $el.find('.title, .name').text().trim()
            const cover = $el.find('img').attr('src') || $el.find('img').attr('data-src')
            const remarks = $el.find('.score, .info, .tag').text().trim()

            if (href && title) {
                // 处理相对路径
                const fullHref = href.startsWith('http') ? href : `${appConfig.site}${href}`
                cards.push({
                    vod_id: href,
                    vod_name: title,
                    vod_pic: cover,
                    vod_remarks: remarks,
                    ext: { url: fullHref }
                })
            }
        })
    } catch (error) {
        $print('getCards error:', error)
    }

    return jsonify({ list: cards })
}

// 获取播放列表（优化剧集解析）
async function getTracks(ext) {
    ext = argsify(ext)
    const tracks = []
    const { url } = ext

    if (!url) {
        $print('播放页URL为空')
        return jsonify({ list: [{ title: '默认线路', tracks }] })
    }

    try {
        const { data } = await $fetch.get(url, {
            headers: { 
                'User-Agent': UA,
                'Referer': appConfig.site
            }
        })
        const $ = cheerio.load(data)

        // 尝试多种剧集列表选择器
        const episodeSelectors = ['.episode-item', '.play-list li', '.video-episode a', '.playlist-item']
        let episodeElements = null
        for (const selector of episodeSelectors) {
            episodeElements = $(selector)
            if (episodeElements.length > 0) break
        }

        if (!episodeElements || episodeElements.length === 0) {
            $print('未找到剧集元素')
            return jsonify({ list: [{ title: '默认线路', tracks }] })
        }

        episodeElements.each((_, e) => {
            const $el = $(e)
            const name = $el.text().trim() || `第${_ + 1}集`
            const playUrl = $el.attr('data-url') || $el.attr('href')

            if (playUrl) {
                const fullPlayUrl = playUrl.startsWith('http') ? playUrl : `${appConfig.site}${playUrl}`
                tracks.push({
                    name,
                    ext: { url: fullPlayUrl }
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

// 获取播放信息（增加加密解析适配）
async function getPlayinfo(ext) {
    ext = argsify(ext)
    try {
        const { url } = ext
        if (!url) {
            return jsonify({ urls: [] })
        }

        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site
            }
        })
        const $ = cheerio.load(data)

        // 尝试直接获取视频源
        let playurl = $('video source').attr('src')
        
        // 尝试解析iframe中的源
        if (!playurl) {
            const iframeSrc = $('iframe').attr('src')
            if (iframeSrc) {
                const fullIframeUrl = iframeSrc.startsWith('http') ? iframeSrc : `${appConfig.site}${iframeSrc}`
                const iframeRes = await $fetch.get(fullIframeUrl, {
                    headers: {
                        'User-Agent': UA,
                        'Referer': url
                    }
                })
                const $iframe = cheerio.load(iframeRes.data)
                playurl = $iframe('video source').attr('src') || $iframe('iframe').attr('src')
            }
        }

        // 尝试解析加密的播放地址（适配常见加密方式）
        if (!playurl) {
            const scripts = $('script').text()
            // 匹配常见的加密地址格式
            const urlMatches = scripts.match(/url\s*[:=]\s*["'](.*?)["']/) || 
                              scripts.match(/src\s*[:=]\s*["'](.*?)["']/) ||
                              scripts.match(/videoUrl\s*[:=]\s*["'](.*?)["']/)
            if (urlMatches && urlMatches[1]) {
                playurl = urlMatches[1]
                // 尝试解密AES加密的地址
                if (playurl.length > 50 && (playurl.includes('=') || playurl.includes('/'))) {
                    try {
                        // 尝试常见密钥解密（实际密钥需根据网站调整）
                        const decrypted = CryptoJS.AES.decrypt(playurl, CryptoJS.enc.Utf8.parse('commonkey'), {
                            mode: CryptoJS.mode.ECB,
                            padding: CryptoJS.pad.Pkcs7
                        }).toString(CryptoJS.enc.Utf8)
                        if (decrypted.startsWith('http')) playurl = decrypted
                    } catch (e) {
                        $print('AES解密失败，使用原始地址', e)
                    }
                }
            }
        }

        // 处理相对路径
        if (playurl && !playurl.startsWith('http')) {
            playurl = `${appConfig.site}${playurl}`
        }

        return jsonify({ urls: playurl ? [playurl] : [] })
    } catch (error) {
        $print('getPlayinfo error:', error)
        return jsonify({ urls: [] })
    }
}

// 搜索功能（优化搜索URL和选择器）
async function search(ext) {
    ext = argsify(ext)
    const cards = []
    const { text, page = 1 } = ext
    if (!text) return jsonify({ list: cards })

    // 尝试多种搜索URL格式
    const searchUrls = [
        `${appConfig.site}/search?q=${encodeURIComponent(text)}&page=${page}`,
        `${appConfig.site}/search/${encodeURIComponent(text)}/page/${page}`,
        `${appConfig.site}?s=${encodeURIComponent(text)}&page=${page}`
    ]

    try {
        let data = null
        for (const searchUrl of searchUrls) {
            try {
                const res = await $fetch.get(searchUrl, {
                    headers: { 'User-Agent': UA }
                })
                data = res.data
                break
            } catch (e) {
                $print(`尝试搜索URL ${searchUrl} 失败`, e)
            }
        }

        if (!data) {
            $print('所有搜索URL均请求失败')
            return jsonify({ list: cards })
        }

        const $ = cheerio.load(data)
        // 复用getCards中的选择器逻辑
        const selectors = ['.movie-item', '.vod-item', '.video-card', '#search-results .item']
        let videoElements = null
        for (const selector of selectors) {
            videoElements = $(selector)
            if (videoElements.length > 0) break
        }

        if (videoElements && videoElements.length > 0) {
            videoElements.each((_, e) => {
                const $el = $(e)
                const aTag = $el.find('a').first()
                const href = aTag.attr('href') || $el.attr('data-href')
                const title = aTag.attr('title') || $el.find('.title, .name').text().trim()
                const cover = $el.find('img').attr('src') || $el.find('img').attr('data-src')
                const remarks = $el.find('.score, .info').text().trim()

                if (href && title) {
                    const fullHref = href.startsWith('http') ? href : `${appConfig.site}${href}`
                    cards.push({
                        vod_id: href,
                        vod_name: title,
                        vod_pic: cover,
                        vod_remarks: remarks,
                        ext: { url: fullHref }
                    })
                }
            })
        } else {
            $print('未找到搜索结果元素')
        }
    } catch (error) {
        $print('search error:', error)
    }

    return jsonify({ list: cards })
}
