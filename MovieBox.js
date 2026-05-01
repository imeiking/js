// MovieBox (movie-box.co / h5.aoneroom.com) XPTV VOD Script
// 作者: 自制脚本
// 适用: XPTV type:3 + ext

const cheerio = createCheerio()

const UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const BASE = 'https://h5.aoneroom.com'
const API  = 'https://h5-api.aoneroom.com'

let appConfig = {
    ver: 1,
    title: 'MovieBox',
    site: BASE,
    tabs: [
        {
            name: '电视剧',
            ext: { url: `${BASE}/web/tv-series`, pg: 1 },
        },
        {
            name: '电影',
            ext: { url: `${BASE}/web/movie`, pg: 1 },
        },
        {
            name: '动漫',
            ext: { url: `${BASE}/web/animated-series`, pg: 1 },
        },
        {
            name: '韩剧',
            ext: { url: `${BASE}/web/tv-series?country=Korea`, pg: 1 },
        },
        {
            name: '日剧',
            ext: { url: `${BASE}/web/tv-series?country=Japan`, pg: 1 },
        },
        {
            name: '热门榜',
            ext: { url: `${BASE}/web/ranking-list`, pg: 1 },
        },
    ],
}

// ─────────────────────────────────────────────
// 辅助: 通用请求头
// ─────────────────────────────────────────────
function headers(referer) {
    return {
        'User-Agent': UA,
        'Referer': referer || BASE + '/',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    }
}

// ─────────────────────────────────────────────
// 辅助: 从 Nuxt SSR 页面提取 __NUXT_DATA__ JSON
// ─────────────────────────────────────────────
function extractNuxtData(html) {
    try {
        // Nuxt 3 方式: <script id="__NUXT_DATA__" type="application/json">
        let m = html.match(/<script[^>]+id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
        if (m) return JSON.parse(m[1])

        // Nuxt 2 方式: window.__NUXT__=
        m = html.match(/window\.__NUXT__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/)
        if (m) return JSON.parse(m[1])
    } catch (e) {
        // ignore
    }
    return null
}

// ─────────────────────────────────────────────
// 辅助: 从 URL 中提取 itemId (slug 末尾字母数字串)
// /detail/bleach-aXbUbO2R79  →  aXbUbO2R79
// ─────────────────────────────────────────────
function extractItemId(href) {
    const m = href.match(/\/detail\/[^?]+-([A-Za-z0-9]+)(\?.*)?$/)
    return m ? m[1] : null
}

// ─────────────────────────────────────────────
// getConfig
// ─────────────────────────────────────────────
async function getConfig() {
    return jsonify(appConfig)
}

// ─────────────────────────────────────────────
// getCards  —  列表页 (翻页)
// ─────────────────────────────────────────────
async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { pg = 1, url } = ext

    // 构建翻页 URL
    let fetchUrl = url
    if (pg > 1) {
        fetchUrl = url.includes('?')
            ? `${url}&page=${pg}`
            : `${url}?page=${pg}`
    }

    let data
    try {
        const res = await $fetch.get(fetchUrl, { headers: headers() })
        data = res.data
    } catch (e) {
        $print('getCards fetch error: ' + e)
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(data)

    // MovieBox 列表卡片: <a href="/detail/..."> 包含图片、标题等
    $('a[href*="/detail/"]').each((_, el) => {
        const href = $(el).attr('href') || ''
        if (!href.startsWith('/detail/')) return

        // 标题: 优先 h2 > title 属性 > data-title
        const title =
            $(el).find('h2').first().text().trim() ||
            $(el).attr('title') ||
            ''
        if (!title) return

        // 封面: img src 或 data-src
        const imgEl = $(el).find('img').first()
        const cover =
            imgEl.attr('src') ||
            imgEl.attr('data-src') ||
            imgEl.attr('data-lazy-src') ||
            ''

        // 评分 / 年份 (作为备注)
        const ratingText = $(el).find('[class*="score"], [class*="rating"], [class*="imdb"]').first().text().trim()
        const yearText   = $(el).find('[class*="year"]').first().text().trim()
        const remarks    = ratingText || yearText || ''

        const fullUrl = href.startsWith('http') ? href : `${BASE}${href}`

        cards.push({
            vod_id:      href,
            vod_name:    title,
            vod_pic:     cover,
            vod_remarks: remarks,
            ext: {
                url: fullUrl,
            },
        })
    })

    // 如果 cheerio 选择器没有命中，尝试从 Nuxt 数据中解析
    if (cards.length === 0) {
        const nuxt = extractNuxtData(data)
        if (nuxt) {
            // Nuxt 数据结构因版本而异，尝试遍历找 items/list
            const raw = JSON.stringify(nuxt)
            const hrefs = [...raw.matchAll(/"page_url"\s*:\s*"(\/detail\/[^"]+)"/g)]
            hrefs.forEach((m) => {
                const href = m[1]
                cards.push({
                    vod_id:   href,
                    vod_name: href.replace(/\/detail\//, '').replace(/-[A-Za-z0-9]+$/, '').replace(/-/g, ' '),
                    vod_pic:  '',
                    ext: { url: `${BASE}${href}` },
                })
            })
        }
    }

    return jsonify({ list: cards })
}

// ─────────────────────────────────────────────
// getTracks  —  详情页 (剧集/季)
// ─────────────────────────────────────────────
async function getTracks(ext) {
    ext = argsify(ext)
    const url = ext.url
    let groups = []

    let data
    try {
        const res = await $fetch.get(url, { headers: headers(BASE + '/') })
        data = res.data
    } catch (e) {
        $print('getTracks fetch error: ' + e)
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(data)
    const itemId = extractItemId(url)

    // ── 方法1: 从页面 Nuxt 数据提取 ──
    const nuxt = extractNuxtData(data)
    if (nuxt) {
        try {
            const str = JSON.stringify(nuxt)

            // 提取季/集数据 (匹配常见字段名)
            // 尝试解析结构化 seasonList / episodeList
            const seasons = []
            const seasonMatches = [...str.matchAll(/"season_num"\s*:\s*(\d+)/g)]
            const uniqueSeasons = [...new Set(seasonMatches.map((m) => parseInt(m[1])))]

            if (uniqueSeasons.length > 0) {
                uniqueSeasons.sort((a, b) => a - b)
                for (const sNum of uniqueSeasons) {
                    // 找同一季的所有集
                    const episodeRegex = new RegExp(
                        `"season_num"\\s*:\\s*${sNum}[^}]*?"episode_num"\\s*:\\s*(\\d+)[^}]*?"id"\\s*:\\s*"?([A-Za-z0-9]+)"?`,
                        'g'
                    )
                    const eps = [...str.matchAll(episodeRegex)]
                    const tracks = eps.map((m) => ({
                        name: `S${sNum}E${m[1]}`,
                        pan: '',
                        ext: { episodeId: m[2], seasonNum: sNum, epNum: parseInt(m[1]) },
                    }))
                    if (tracks.length > 0) {
                        groups.push({ title: `第${sNum}季`, tracks })
                    }
                }
            }

            // 如果没有季结构，尝试找单集 id 列表
            if (groups.length === 0) {
                const epIds = [...str.matchAll(/"episode_id"\s*:\s*"?([A-Za-z0-9_-]+)"?/g)]
                    .map((m) => m[1])
                    .filter((v, i, a) => a.indexOf(v) === i)

                if (epIds.length > 0) {
                    const tracks = epIds.map((id, i) => ({
                        name: `第${i + 1}集`,
                        pan: '',
                        ext: { episodeId: id },
                    }))
                    groups.push({ title: '全集', tracks })
                }
            }
        } catch (e) {
            $print('getTracks nuxt parse error: ' + e)
        }
    }

    // ── 方法2: cheerio 直接解析 HTML ──
    if (groups.length === 0) {
        // 常见剧集列表 selector
        const episodeSelectors = [
            '.episode-list a',
            '.episodes-list a',
            '[class*="episode"] a',
            '.ep-list a',
            'ul.episodes li a',
        ]
        for (const sel of episodeSelectors) {
            const eps = $(sel)
            if (eps.length > 0) {
                const tracks = []
                eps.each((i, el) => {
                    const epHref = $(el).attr('href') || ''
                    const epName = $(el).text().trim() || `第${i + 1}集`
                    const epId = extractItemId(epHref) || epHref
                    tracks.push({
                        name: epName,
                        pan: '',
                        ext: { episodeUrl: `${BASE}${epHref}`, episodeId: epId },
                    })
                })
                if (tracks.length > 0) {
                    groups.push({ title: '全集', tracks })
                    break
                }
            }
        }
    }

    // ── 方法3: 调用 API 获取集数 ──
    if (groups.length === 0 && itemId) {
        try {
            // 尝试 v2 API: GET /v1/items/{itemId}/seasons-episodes
            const apiRes = await $fetch.get(`${API}/v1/items/${itemId}/seasons-episodes`, {
                headers: {
                    'User-Agent': UA,
                    'Referer': BASE + '/',
                    'Origin': BASE,
                },
            })
            const json = argsify(apiRes.data)
            if (json && json.data) {
                const seasons = json.data
                for (const season of seasons) {
                    const sTitle = season.season_name || `第${season.season_num}季`
                    const tracks = (season.episodes || []).map((ep) => ({
                        name: ep.episode_name || `E${ep.episode_num}`,
                        pan: '',
                        ext: { episodeId: ep.id || ep.episode_id, itemId: itemId },
                    }))
                    if (tracks.length > 0) {
                        groups.push({ title: sTitle, tracks })
                    }
                }
            }
        } catch (e) {
            $print('getTracks api error: ' + e)
        }
    }

    // ── 兜底: 电影单集 ──
    if (groups.length === 0 && itemId) {
        groups.push({
            title: '播放',
            tracks: [{ name: '播放', pan: '', ext: { itemId: itemId, isMovie: true } }],
        })
    }

    return jsonify({ list: groups })
}

// ─────────────────────────────────────────────
// getPlayinfo  —  获取播放地址
// ─────────────────────────────────────────────
async function getPlayinfo(ext) {
    ext = argsify(ext)
    const { episodeId, itemId, isMovie, episodeUrl } = ext

    let playUrl = ''
    const hdrs = headers(BASE + '/')

    // ── 路径1: 通过 episodeId 调用 API ──
    if (episodeId) {
        try {
            // 尝试获取 episode 播放信息
            const res = await $fetch.get(`${API}/v1/episodes/${episodeId}/play-info`, {
                headers: { ...hdrs, 'Origin': BASE },
            })
            const json = argsify(res.data)
            playUrl = extractPlayUrl(json)
        } catch (e) {
            $print('getPlayinfo episode api error: ' + e)
        }

        // 备用路径
        if (!playUrl) {
            try {
                const res2 = await $fetch.get(`${API}/v1/episodes/${episodeId}/sources`, {
                    headers: { ...hdrs, 'Origin': BASE },
                })
                const json2 = argsify(res2.data)
                playUrl = extractPlayUrl(json2)
            } catch (e2) { /* ignore */ }
        }
    }

    // ── 路径2: 通过 itemId (电影) ──
    if (!playUrl && itemId && isMovie) {
        try {
            const res = await $fetch.get(`${API}/v1/items/${itemId}/play-info`, {
                headers: { ...hdrs, 'Origin': BASE },
            })
            const json = argsify(res.data)
            playUrl = extractPlayUrl(json)
        } catch (e) {
            $print('getPlayinfo movie api error: ' + e)
        }
    }

    // ── 路径3: 从集详情页面提取 ──
    if (!playUrl && episodeUrl) {
        try {
            const res = await $fetch.get(episodeUrl, { headers: hdrs })
            const $ = cheerio.load(res.data)

            // 找嵌入的 video src
            const videoSrc =
                $('video source').attr('src') ||
                $('video').attr('src') ||
                ''
            if (videoSrc && videoSrc.startsWith('http')) {
                playUrl = videoSrc
            }

            // 从 Nuxt 数据提取
            if (!playUrl) {
                const nuxt = extractNuxtData(res.data)
                if (nuxt) {
                    playUrl = extractPlayUrl(nuxt) || ''
                }
            }
        } catch (e) {
            $print('getPlayinfo page scrape error: ' + e)
        }
    }

    if (!playUrl) {
        $print('getPlayinfo: 未找到播放地址')
    }

    return jsonify({
        urls: [playUrl],
        headers: [{ 'User-Agent': UA, 'Referer': BASE + '/' }],
    })
}

// ─────────────────────────────────────────────
// search  —  搜索
// ─────────────────────────────────────────────
async function search(ext) {
    ext = argsify(ext)
    let cards = []
    const text = encodeURIComponent(ext.text || '')
    const pg = ext.page || 1

    let data
    try {
        const res = await $fetch.get(`${BASE}/web/search?q=${text}&page=${pg}`, {
            headers: headers(),
        })
        data = res.data
    } catch (e) {
        $print('search fetch error: ' + e)
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(data)

    $('a[href*="/detail/"]').each((_, el) => {
        const href = $(el).attr('href') || ''
        if (!href.startsWith('/detail/')) return

        const title =
            $(el).find('h2').first().text().trim() ||
            $(el).attr('title') ||
            ''
        if (!title) return

        const imgEl = $(el).find('img').first()
        const cover =
            imgEl.attr('src') ||
            imgEl.attr('data-src') ||
            ''

        const ratingText = $(el).find('[class*="score"], [class*="rating"]').first().text().trim()
        const yearText   = $(el).find('[class*="year"]').first().text().trim()

        cards.push({
            vod_id:      href,
            vod_name:    title,
            vod_pic:     cover,
            vod_remarks: ratingText || yearText || '',
            ext: { url: `${BASE}${href}` },
        })
    })

    // 备用: Nuxt data 解析
    if (cards.length === 0) {
        const nuxt = extractNuxtData(data)
        if (nuxt) {
            const raw = JSON.stringify(nuxt)
            const hrefs = [...raw.matchAll(/"page_url"\s*:\s*"(\/detail\/[^"]+)"/g)]
            hrefs.forEach((m) => {
                const href = m[1]
                cards.push({
                    vod_id:   href,
                    vod_name: href.replace(/\/detail\//, '').replace(/-[A-Za-z0-9]+$/, '').replace(/-/g, ' '),
                    vod_pic:  '',
                    ext: { url: `${BASE}${href}` },
                })
            })
        }
    }

    return jsonify({ list: cards })
}

// ─────────────────────────────────────────────
// 辅助: 从各种 JSON 结构中提取播放 URL
// ─────────────────────────────────────────────
function extractPlayUrl(json) {
    if (!json) return ''
    const str = JSON.stringify(json)

    // 常见字段: download_url, url, file, src, stream_url, hls_url, mp4_url
    const patterns = [
        /"download_url"\s*:\s*"(https?:\/\/[^"]+\.(?:mp4|m3u8)[^"]*)"/,
        /"stream_url"\s*:\s*"(https?:\/\/[^"]+)"/,
        /"hls_url"\s*:\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/,
        /"mp4_url"\s*:\s*"(https?:\/\/[^"]+\.mp4[^"]*)"/,
        /"url"\s*:\s*"(https?:\/\/[^"]+\.(?:mp4|m3u8)[^"]*)"/,
        /"file"\s*:\s*"(https?:\/\/[^"]+\.(?:mp4|m3u8)[^"]*)"/,
        /"src"\s*:\s*"(https?:\/\/[^"]+\.(?:mp4|m3u8)[^"]*)"/,
        /"source"\s*:\s*"(https?:\/\/[^"]+\.(?:mp4|m3u8)[^"]*)"/,
    ]

    for (const pattern of patterns) {
        const m = str.match(pattern)
        if (m) return m[1].replace(/\\/g, '')
    }
    return ''
}
