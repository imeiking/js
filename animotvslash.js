/**
 * XPTV Extension Script
 * Site   : animotvslash.org
 * Author : community
 * Ver    : 1.0
 * Desc   : English sub/dub anime streaming
 *
 * Functions required by XPTV Curd engine:
 *   getConfig()     → app config / tabs
 *   getCards(ext)   → list cards for a tab / page
 *   getTracks(ext)  → episode / server groups for a detail page
 *   getPlayinfo(ext)→ final play URL
 *   search(ext)     → search results
 */

const cheerio = createCheerio()

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const BASE = 'https://animotvslash.org'

/* ─────────────────────────────────────────
   1.  App Config
───────────────────────────────────────── */
let appConfig = {
    ver: 1,
    title: 'ANIMOTVSLASH',
    site: BASE,
    tabs: [
        {
            name: '🔥 Latest',
            ext: { url: BASE + '/', type: 'home' },
        },
        {
            name: '📺 Ongoing',
            ext: { url: BASE + '/category/ongoing-anime/', type: 'list' },
        },
        {
            name: '✅ Completed',
            ext: { url: BASE + '/category/completed-anime/', type: 'list' },
        },
        {
            name: '🎬 Movies',
            ext: { url: BASE + '/category/anime-movie/', type: 'list' },
        },
        {
            name: '📋 A–Z List',
            ext: { url: BASE + '/az-list/', type: 'az' },
        },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

/* ─────────────────────────────────────────
   2.  Card List (homepage / category / az)
───────────────────────────────────────── */
async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { url, type = 'list', page = 1 } = ext

    // append page number for paginated category pages
    if (type === 'list' && page > 1) {
        url = url.replace(/\/$/, '') + '/page/' + page + '/'
    }

    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA },
    })

    const $ = cheerio.load(data)

    if (type === 'home') {
        // Homepage: recent update items  (.listupd .bs  or  .excstf .bs)
        $('.listupd .bs, .excstf .bs').each((_, el) => {
            const a      = $(el).find('a').first()
            const href   = a.attr('href') || ''
            const title  = $(el).find('.tt, .ntitle, h2').first().text().trim()
            const cover  = $(el).find('img').attr('src') ||
                           $(el).find('img').attr('data-src') || ''
            const badge  = $(el).find('.epx, .epxs, .sb').first().text().trim()

            if (href && title) {
                cards.push({
                    vod_id:      href,
                    vod_name:    title,
                    vod_pic:     cover,
                    vod_remarks: badge,
                    ext:         { url: href },
                })
            }
        })

        // fallback: article cards
        if (cards.length === 0) {
            $('article').each((_, el) => {
                const a     = $(el).find('a').first()
                const href  = a.attr('href') || ''
                const title = $(el).find('h2, .entry-title').first().text().trim() ||
                              a.attr('title') || ''
                const cover = $(el).find('img').attr('src') ||
                              $(el).find('img').attr('data-src') || ''
                if (href && title) {
                    cards.push({
                        vod_id:   href,
                        vod_name: title,
                        vod_pic:  cover,
                        ext:      { url: href },
                    })
                }
            })
        }

    } else if (type === 'az') {
        // AZ List: links of anime series
        $('.azlist .bs, .cl ul li, .azlistall a').each((_, el) => {
            const a     = $(el).is('a') ? $(el) : $(el).find('a').first()
            const href  = a.attr('href') || ''
            const title = a.text().trim() || a.attr('title') || ''
            const cover = $(el).find('img').attr('src') || ''
            if (href && title) {
                cards.push({
                    vod_id:   href,
                    vod_name: title,
                    vod_pic:  cover,
                    ext:      { url: href },
                })
            }
        })

    } else {
        // Generic category / search list
        $('.listupd .bs, .bs, article').each((_, el) => {
            const a     = $(el).find('a').first()
            const href  = a.attr('href') || ''
            const title = $(el).find('.tt, .ntitle, h2').first().text().trim() ||
                          a.attr('title') || ''
            const cover = $(el).find('img').attr('src') ||
                          $(el).find('img').attr('data-src') || ''
            const badge = $(el).find('.epx, .epxs, .sb, .status').first().text().trim()
            if (href && title) {
                cards.push({
                    vod_id:      href,
                    vod_name:    title,
                    vod_pic:     cover,
                    vod_remarks: badge,
                    ext:         { url: href },
                })
            }
        })
    }

    // pagination: detect next page
    const hasNext = $('a.next, .pagination .next, a[aria-label="Next"]').length > 0

    return jsonify({
        list: cards,
        page,
        nextPage: hasNext ? page + 1 : undefined,
    })
}

/* ─────────────────────────────────────────
   3.  Detail / Episode Tracks
───────────────────────────────────────── */
async function getTracks(ext) {
    ext = argsify(ext)
    const url = ext.url

    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA },
    })

    const $ = cheerio.load(data)
    let groups = []

    // ── A: Series with episode list ───────────────────────────────────
    // animotvslash uses  #episodelist  or  .eplister  ul li  with episode links
    const epItems = $('#episodelist li, .eplister ul li, .eplisterfull li').toArray()

    if (epItems.length > 0) {
        const group = { title: 'Episodes', tracks: [] }

        epItems.reverse().forEach((el) => {
            const a    = $(el).find('a').first()
            const href = a.attr('href') || ''
            const num  = $(el).find('.epl-num').text().trim() ||
                         $(el).find('.epnum').text().trim() ||
                         a.text().trim() || ''
            const title = $(el).find('.epl-title').text().trim() || ''
            const name  = num ? (title ? `Ep ${num} ${title}` : `Ep ${num}`) : title || a.text().trim()

            if (href) {
                group.tracks.push({
                    name: name || href,
                    pan:  '',
                    ext:  { url: href },
                })
            }
        })

        if (group.tracks.length > 0) groups.push(group)

    } else {
        // ── B: Movie / single episode (current page IS the player) ───
        const movieGroup = { title: 'Play', tracks: [] }
        movieGroup.tracks.push({
            name: $('h1.entry-title, h1.title').first().text().trim() || 'Watch',
            pan:  '',
            ext:  { url: url, isPlayer: true },
        })
        groups.push(movieGroup)
    }

    return jsonify({ list: groups })
}

/* ─────────────────────────────────────────
   4.  Play Info – extract m3u8 / mp4
───────────────────────────────────────── */
async function getPlayinfo(ext) {
    ext = argsify(ext)
    const targetUrl = ext.url

    const { data } = await $fetch.get(targetUrl, {
        headers: { 'User-Agent': UA, Referer: BASE },
    })

    const $ = cheerio.load(data)
    let playUrl = ''
    let referer = targetUrl

    // ── Strategy 1: direct iframe embed ──────────────────────────────
    // animotvslash commonly uses an  <iframe src="...">  or data-src
    let iframeSrc =
        $('iframe#player, .entry-content iframe, iframe[src*="embed"], iframe[data-src]')
            .first()
            .attr('src') ||
        $('iframe').first().attr('data-src') ||
        $('iframe').first().attr('src') ||
        ''

    if (iframeSrc && !iframeSrc.startsWith('http')) {
        iframeSrc = BASE + iframeSrc
    }

    // ── Strategy 2: scan inline JS for file / m3u8 ───────────────────
    const rawHtml = data || ''
    const m3u8Match = rawHtml.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)['"]/i)
    const mp4Match  = rawHtml.match(/["'](https?:\/\/[^"']+\.mp4[^"'?]*(?:\?[^"']*)?)['"]/i)

    if (m3u8Match) {
        playUrl = m3u8Match[1]
    } else if (mp4Match) {
        playUrl = mp4Match[1]
    }

    // ── Strategy 3: follow the iframe ────────────────────────────────
    if (!playUrl && iframeSrc) {
        try {
            const { data: iframeData } = await $fetch.get(iframeSrc, {
                headers: {
                    'User-Agent': UA,
                    Referer: BASE,
                },
            })
            referer = iframeSrc

            // Try direct file in iframe source
            const im3u8 = iframeData.match(/["'`](https?:\/\/[^"'`]+\.m3u8[^"'`]*)['"` ]/i)
            const imp4  = iframeData.match(/["'`](https?:\/\/[^"'`]+\.mp4[^"'`?]*(?:\?[^"'`]*)?)['"` ]/i)
            // Also look for  file:"https://..."  (jwplayer / plyr patterns)
            const jw    = iframeData.match(/file\s*:\s*["'](https?:\/\/[^"']+)['"]/i)
            const src   = iframeData.match(/src\s*:\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)['"]/i)

            if (im3u8)       playUrl = im3u8[1]
            else if (imp4)   playUrl = imp4[1]
            else if (jw)     playUrl = jw[1]
            else if (src)    playUrl = src[1]

            // Strategy 4: nested iframe (2-level embed)
            if (!playUrl) {
                const $if = cheerio.load(iframeData)
                const nested = $if('iframe').first().attr('src') || ''
                if (nested && nested.startsWith('http')) {
                    const { data: nestedData } = await $fetch.get(nested, {
                        headers: { 'User-Agent': UA, Referer: iframeSrc },
                    })
                    referer = nested
                    const nm3u8 = nestedData.match(/["'`](https?:\/\/[^"'`]+\.m3u8[^"'`]*)['"` ]/i)
                    const nmp4  = nestedData.match(/["'`](https?:\/\/[^"'`]+\.mp4[^"'`?]*(?:\?[^"'`]*)?)['"` ]/i)
                    const njw   = nestedData.match(/file\s*:\s*["'](https?:\/\/[^"']+)['"]/i)
                    if (nm3u8)     playUrl = nm3u8[1]
                    else if (nmp4) playUrl = nmp4[1]
                    else if (njw)  playUrl = njw[1]
                }
            }
        } catch (e) {
            $print('iframe fetch error: ' + e)
        }
    }

    if (!playUrl) {
        $utils.toastError('Could not extract stream URL. The source may require a browser.')
    }

    return jsonify({
        urls:    [playUrl],
        headers: [{ 'User-Agent': UA, Referer: referer }],
    })
}

/* ─────────────────────────────────────────
   5.  Search
───────────────────────────────────────── */
async function search(ext) {
    ext = argsify(ext)
    let cards = []
    const text = encodeURIComponent(ext.text || '')
    const page = ext.page || 1
    const url  = `${BASE}/?s=${text}&page=${page}`

    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA },
    })

    const $ = cheerio.load(data)

    $('.listupd .bs, .bs, article').each((_, el) => {
        const a     = $(el).find('a').first()
        const href  = a.attr('href') || ''
        const title = $(el).find('.tt, .ntitle, h2').first().text().trim() ||
                      a.attr('title') || ''
        const cover = $(el).find('img').attr('src') ||
                      $(el).find('img').attr('data-src') || ''
        const badge = $(el).find('.epx, .epxs, .sb').first().text().trim()
        if (href && title) {
            cards.push({
                vod_id:      href,
                vod_name:    title,
                vod_pic:     cover,
                vod_remarks: badge,
                ext:         { url: href },
            })
        }
    })

    return jsonify({ list: cards })
}
