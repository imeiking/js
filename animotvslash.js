/**
 * XPTV Extension Script — ANIMOTVSLASH
 * Site   : https://www.animotvslash.org
 * Engine : Google Blogger (Feed API + HTML parse)
 * Ver    : 2.0
 *
 * Architecture discovered:
 *   - Site is built on Google Blogger platform
 *   - Label (category) URLs: /search/label/Airing  /search/label/Movie  etc.
 *   - Each post = one anime episode, URL pattern: /[anime-name]-episode-[N]/
 *   - Episode index list lives inside each post body as <a href="...episode...">
 *   - Blogger Feed API (/feeds/posts/default?alt=json) used for listings
 *     to avoid 403 blocks on HTML pages
 *   - Player: JW Player or iframe embed inside .post-body
 */

const cheerio = createCheerio()

const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
             '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const BASE = 'https://www.animotvslash.org'
const FEED = BASE + '/feeds/posts/default'
const PER  = 20

/* ═══════════════════════════════════════════
   HELPER: Blogger JSON Feed → XPTV card list
═══════════════════════════════════════════ */
function feedToCards(json) {
    const feed    = json.feed || {}
    const entries = feed.entry || []

    return entries.map(e => {
        const linkObj = (e.link || []).find(l => l.rel === 'alternate') || {}
        const url     = linkObj.href || ''
        const title   = (e.title && e.title.$t || '')
            .replace(/\s*[-–|]\s*ANIMOTVSLASH\s*$/i, '').trim()
        const content = (e.content && e.content.$t) || (e.summary && e.summary.$t) || ''
        const imgM    = content.match(/<img[^>]+src=["']([^"']+)["']/i)
        const cover   = imgM ? imgM[1] : ''
        const labels  = (e.category || []).map(c => c.term)
            .filter(t => !['Airing','Completed','Movie','Ongoing','Sub','Dub'].includes(t))
            .slice(0, 2).join(' · ')

        return { vod_id: url, vod_name: title, vod_pic: cover, vod_remarks: labels, ext: { url } }
    }).filter(c => c.vod_name && c.vod_id)
}

/* ═══════════════════════════════════════════
   1. getConfig
═══════════════════════════════════════════ */
let appConfig = {
    ver:   1,
    title: 'ANIMOTVSLASH',
    site:  BASE,
    tabs: [
        {
            name: '🔥 Latest',
            ext:  { feedUrl: `${FEED}?alt=json&max-results=${PER}` },
        },
        {
            name: '📡 Airing',
            ext:  { feedUrl: `${FEED}/-/Airing?alt=json&max-results=${PER}` },
        },
        {
            name: '✅ Completed',
            ext:  { feedUrl: `${FEED}/-/Completed?alt=json&max-results=${PER}` },
        },
        {
            name: '🎬 Movie',
            ext:  { feedUrl: `${FEED}/-/Movie?alt=json&max-results=${PER}` },
        },
        {
            name: '📺 Ongoing',
            ext:  { feedUrl: `${FEED}/-/Ongoing?alt=json&max-results=${PER}` },
        },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

/* ═══════════════════════════════════════════
   2. getCards  — Blogger Feed API + pagination
   Blogger paginates via start-index (1-based)
═══════════════════════════════════════════ */
async function getCards(ext) {
    ext = argsify(ext)
    const page  = ext.page || 1
    const start = (page - 1) * PER + 1

    // Insert / replace start-index in feedUrl
    let feedUrl = ext.feedUrl || `${FEED}?alt=json&max-results=${PER}`
    feedUrl = feedUrl.replace(/[?&]start-index=\d+/g, '')
    if (start > 1) {
        feedUrl += '&start-index=' + start
    }

    let cards   = []
    let hasNext = false

    try {
        const { data } = await $fetch.get(feedUrl, {
            headers: { 'User-Agent': UA },
        })
        const json  = typeof data === 'string' ? argsify(data) : data
        cards       = feedToCards(json)
        const total = parseInt(
            ((json.feed || {})['openSearch$totalResults'] || {}).$t || '0', 10
        )
        hasNext = start + PER - 1 < total
    } catch (e) {
        $print('getCards error: ' + e)
    }

    return jsonify({ list: cards, page, nextPage: hasNext ? page + 1 : undefined })
}

/* ═══════════════════════════════════════════
   3. getTracks — episode list from post body
   
   Each episode post body contains links to
   other episodes of the same anime like:
     <a href="/one-piece-episode-1035/">Eps 1035 - Title - Date</a>
   
   We scrape those links and group them.
   If no episode links found → post IS the player, return 1 track.
═══════════════════════════════════════════ */
async function getTracks(ext) {
    ext = argsify(ext)
    const url = ext.url

    let groups = []

    try {
        const { data } = await $fetch.get(url, {
            headers: { 'User-Agent': UA, Referer: BASE },
        })
        const $ = cheerio.load(data)

        // Derive series name from post title
        const rawTitle = $('h1.post-title, .post-title, h1.entry-title, h1').first().text().trim()
        const seriesName = rawTitle
            .replace(/\s*[-–]\s*ANIMOTVSLASH\s*$/i, '')
            .replace(/\s*episode\s*\d+.*/i, '')
            .trim()

        // Collect episode links — any anchor in post body
        // whose href contains "episode" and points to this site
        const epMap = new Map()  // url → name (Map deduplicates automatically)

        $('div.post-body a[href], .entry-content a[href]').each((_, el) => {
            const raw  = $(el).attr('href') || ''
            const text = $(el).text().trim()

            // Must contain "episode" in path
            if (!/episode/i.test(raw)) return

            // Resolve to absolute URL
            const abs = raw.startsWith('http') ? raw
                      : raw.startsWith('/')    ? BASE + raw
                      : null
            if (!abs) return

            // Must be on the same domain
            if (!abs.includes('animotvslash.org')) return

            if (!epMap.has(abs)) {
                epMap.set(abs, text || raw)
            }
        })

        const epList = Array.from(epMap.entries()) // [ [url, name], ... ]

        if (epList.length > 0) {
            groups.push({
                title:  seriesName || 'Episodes',
                tracks: epList.map(([epUrl, name]) => ({
                    name,
                    pan: '',
                    ext: { url: epUrl },
                })),
            })
        } else {
            // No sibling episode links — this post is itself the only/player page
            const epNum  = url.match(/episode[-\s_]*(\d+)/i)
            const epName = epNum ? `Episode ${epNum[1]}` : (seriesName || 'Watch')
            groups.push({
                title:  seriesName || 'Play',
                tracks: [{ name: epName, pan: '', ext: { url } }],
            })
        }

    } catch (e) {
        $print('getTracks error: ' + e)
    }

    return jsonify({ list: groups })
}

/* ═══════════════════════════════════════════
   4. getPlayinfo — extract real stream URL
   Priority:
     1. JW Player  file:"https://..."
     2. Inline m3u8 / mp4 in page source
     3. Follow <iframe src> → repeat regex
     4. Nested iframe (2nd level)
═══════════════════════════════════════════ */
async function getPlayinfo(ext) {
    ext = argsify(ext)
    const targetUrl = ext.url
    let playUrl = ''
    let referer = BASE

    // Generic regex extractors
    function extractFromHtml(html) {
        return (
            (html.match(/file\s*:\s*["'`](https?:\/\/[^"'`\s,}]+)["'`]/i) || [])[1] ||
            (html.match(/["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)["'`]/i) || [])[1] ||
            (html.match(/["'`](https?:\/\/[^"'`\s]+\.mp4(?:\?[^"'`\s]*)?)["'`]/i) || [])[1] ||
            (html.match(/source\s*:\s*["'`](https?:\/\/[^"'`\s]+)["'`]/i) || [])[1] ||
            ''
        )
    }

    // Extract iframe src from HTML
    function extractIframeSrc(html, pageUrl) {
        const $ = cheerio.load(html)
        let src = $('div.post-body iframe, .entry-content iframe, iframe').first().attr('src') ||
                  $('div.post-body iframe, .entry-content iframe, iframe').first().attr('data-src') || ''
        if (!src) return ''
        if (src.startsWith('//'))   src = 'https:' + src
        if (src.startsWith('/'))    src = BASE + src
        return src
    }

    try {
        const { data: pageHtml } = await $fetch.get(targetUrl, {
            headers: { 'User-Agent': UA, Referer: BASE },
        })

        // Step 1 — Try direct extraction from page
        playUrl = extractFromHtml(pageHtml)

        // Step 2 — Follow iframe
        if (!playUrl) {
            const iframeSrc = extractIframeSrc(pageHtml, targetUrl)
            if (iframeSrc) {
                try {
                    const { data: iframeHtml } = await $fetch.get(iframeSrc, {
                        headers: { 'User-Agent': UA, Referer: targetUrl },
                    })
                    referer = iframeSrc
                    playUrl = extractFromHtml(iframeHtml)

                    // Step 3 — Nested iframe
                    if (!playUrl) {
                        const nested = extractIframeSrc(iframeHtml, iframeSrc)
                        if (nested && nested !== iframeSrc) {
                            const { data: nested2Html } = await $fetch.get(nested, {
                                headers: { 'User-Agent': UA, Referer: iframeSrc },
                            })
                            referer = nested
                            playUrl = extractFromHtml(nested2Html)
                        }
                    }
                } catch (iframeErr) {
                    $print('iframe follow error: ' + iframeErr)
                }
            }
        }
    } catch (e) {
        $print('getPlayinfo error: ' + e)
    }

    if (!playUrl) {
        $utils.toastError('Stream not found — open in browser.')
    }

    return jsonify({
        urls:    [playUrl],
        headers: [{ 'User-Agent': UA, Referer: referer }],
    })
}

/* ═══════════════════════════════════════════
   5. search — Blogger Feed full-text search
═══════════════════════════════════════════ */
async function search(ext) {
    ext = argsify(ext)
    const q    = encodeURIComponent(ext.text || '')
    const page = ext.page || 1
    const url  = `${FEED}?alt=json&max-results=${PER}&q=${q}&start-index=${(page - 1) * PER + 1}`

    let cards = []
    try {
        const { data } = await $fetch.get(url, {
            headers: { 'User-Agent': UA },
        })
        const json = typeof data === 'string' ? argsify(data) : data
        cards = feedToCards(json)
    } catch (e) {
        $print('search error: ' + e)
    }

    return jsonify({ list: cards })
}
