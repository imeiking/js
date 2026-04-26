/**
 * XPTV Extension — ANIMOTVSLASH v4.0
 * https://animotvslash.org
 *
 * 站点目前为 WordPress anime 归档结构：
 * 1. 五个 Tab 统一走 /anime/ 查询参数，不再依赖旧的 Blogger label 页面
 * 2. 列表页解析 .bs/.bsx 卡片，保留封面与标签，去掉重复标题
 * 3. 详情页优先解析系列页 .eplister，单集页会自动回跳到 "All Episodes" 列表
 * 4. 支持归档分页 ?page=N&status=&type=&order=
 */

const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'

const HEADERS = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Referer': 'https://animotvslash.org/',
}

const BASE = 'https://animotvslash.org'
const ARCHIVE = BASE + '/anime/'

const TAB_CONFIGS = [
    { name: 'Latest',   ext: { mode: 'home-latest', url: BASE + '/' } },
    { name: 'Ongoing',  ext: { status: 'ongoing',   type: '',      order: 'update' } },
    { name: 'Completed', ext: { status: 'completed', type: '',      order: 'update' } },
    { name: 'Movies',   ext: { status: '',          type: 'movie', order: 'update' } },
    { name: 'A-Z List', ext: { status: '',          type: '',      order: 'title' } },
]

let appConfig = {
    ver: 1,
    title: 'ANIMOTVSLASH',
    site: BASE,
    tabs: TAB_CONFIGS,
}

function tidy(text) {
    return String(text || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function stripSiteSuffix(text) {
    return tidy(text).replace(/\s*[-–]\s*ANIMOTVSLASH\s*$/i, '').trim()
}

function stripEpisodeSuffix(text) {
    return stripSiteSuffix(text)
        .replace(/\s*[:-]?\s*episode\s*\d+\b.*$/i, '')
        .trim()
}

function normalizeUrl(url) {
    let out = tidy(url)
    if (!out) return ''
    if (out.startsWith('//')) out = 'https:' + out
    if (out.startsWith('?')) out = ARCHIVE + out
    if (out.startsWith('/')) out = BASE + out
    if (!/^https?:\/\//i.test(out) && !out.startsWith('/')) out = BASE + '/' + out.replace(/^\.?\//, '')
    out = out.replace(/^https?:\/\/www\./i, 'https://')
    out = out.replace(/[?&]m=1\b/g, '')
    out = out.replace(/\?&/, '?')
    out = out.replace(/[?&]$/, '')
    return out.replace(/#.*$/, '')
}

function buildArchiveUrl(ext) {
    if (ext.mode === 'home-latest') {
        return normalizeUrl(ext.nextUrl || ext.url || (BASE + '/'))
    }

    if (ext.nextUrl) return normalizeUrl(ext.nextUrl)

    const page = parseInt(ext.page || '1', 10)
    const parts = []

    if (page > 1) parts.push(`page=${page}`)
    parts.push(`status=${encodeURIComponent((ext.status || '').toLowerCase())}`)
    parts.push(`type=${encodeURIComponent((ext.type || '').toLowerCase())}`)
    parts.push(`order=${encodeURIComponent((ext.order || 'update').toLowerCase())}`)

    return `${ARCHIVE}?${parts.join('&')}`
}

async function fetchHtml(url, referer) {
    const headers = referer ? { ...HEADERS, Referer: referer } : HEADERS
    const { data } = await $fetch.get(url, { headers })
    return { data, $: cheerio.load(data) }
}

function uniqueBy(items, keyFn) {
    const seen = new Set()
    return items.filter(item => {
        const key = keyFn(item)
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
    })
}

function extractEpisodeNumber(text) {
    const source = tidy(text)
    const match = source.match(/\bep(?:isode)?\.?\s*([0-9]+)\b/i) ||
                  source.match(/episode[-_\s]*([0-9]+)/i)
    return match ? match[1] : ''
}

function extractSeriesSlug(url) {
    const seriesMatch = String(url || '').match(/\/anime\/([^/?#]+)/i)
    if (seriesMatch) return seriesMatch[1].toLowerCase()

    const epMatch = String(url || '').match(/https?:\/\/[^/]+\/([^/?#]+)-episode[-_\s]*\d+/i)
    return epMatch ? epMatch[1].toLowerCase() : ''
}

function buildTrackName(label, url) {
    const cleaned = stripSiteSuffix(label)
    if (cleaned) {
        if (/episode/i.test(cleaned)) return cleaned
        const num = extractEpisodeNumber(cleaned)
        if (num) return `Episode ${num}`
    }

    const urlNum = extractEpisodeNumber(url)
    return urlNum ? `Episode ${urlNum}` : (cleaned || 'Play')
}

function getBestImage($scope) {
    const img = $scope.find('img').first()
    return normalizeUrl(
        img.attr('src') ||
        img.attr('data-src') ||
        img.attr('data-lazy-src') ||
        ''
    )
}

function buildRemark(card, $) {
    const epx = tidy(card.find('.bt .epx').first().text())
    const lang = tidy(card.find('.bt .sb').first().text())
    const status = tidy(card.find('.status').first().text())
    const type = tidy(card.find('.typez').first().text())

    const parts = []
    if (epx) parts.push(epx)
    if (lang) parts.push(lang)

    return parts.join(' ') || epx || status || type
}

function parseBsCard($, el) {
    const card = $(el)
    const a = card.find('.bsx > a[href], a.tip[href]').first()
    let href = normalizeUrl(a.attr('href'))

    if (!href || !/animotvslash\.org/i.test(href)) return null
    if (!href.includes('/anime/') && !/episode/i.test(href)) return null

    const titleBox = card.find('.tt').first()
    const primaryTitle = stripSiteSuffix(
        titleBox.clone().find('h1, h2, h3, h4').remove().end().text()
    )
    const headline = stripSiteSuffix(
        titleBox.find('h1, h2, h3, h4').first().text() ||
        a.attr('title') ||
        a.text()
    )
    const title = primaryTitle || stripEpisodeSuffix(headline) || stripEpisodeSuffix(a.attr('title') || a.text())
    const pic = getBestImage(card.find('.limit').first().length ? card.find('.limit').first() : card)
    const remarks = buildRemark(card, $)

    return {
        vod_id: href,
        vod_name: title,
        vod_pic: pic,
        vod_remarks: remarks,
        ext: { url: href },
    }
}

function parseLegacyCard($, el) {
    const card = $(el)
    const a = card.find('h3.post-title a, h2.post-title a, .entry-title a').first()
    const href = normalizeUrl(a.attr('href'))
    const title = stripEpisodeSuffix(a.text())

    if (!href || !title) return null

    return {
        vod_id: href,
        vod_name: title,
        vod_pic: getBestImage(card),
        vod_remarks: tidy(card.find('.label a, .post-labels a').first().text()),
        ext: { url: href },
    }
}

function parseSeriesCards($) {
    let cards = $('article.bs').map((_, el) => parseBsCard($, el)).get().filter(Boolean)

    if (cards.length === 0) {
        cards = $('article.hentry, .post-outer .post').map((_, el) => parseLegacyCard($, el)).get().filter(Boolean)
    }

    return uniqueBy(cards, item => item.vod_id)
}

function parseLatestHomeCards($) {
    const latestHeader = $('div.releases.latesthome').first()
    if (latestHeader.length === 0) return []

    const container = latestHeader.nextAll('.listupd').first()
    if (container.length === 0) return []

    return uniqueBy(
        container.find('article.bs').map((_, el) => parseBsCard($, el)).get().filter(Boolean),
        item => item.vod_id
    )
}

function findNextPage($, ext) {
    let nextUrl = normalizeUrl(
        $('a.r[href], a.next.page-numbers[href], .pagination a.next[href], .nav-links a.next[href]').first().attr('href')
    )

    if (nextUrl) return nextUrl

    const relNext = $('link[rel="next"]').attr('href') || ''
    const pageMatch = relNext.match(/\/page\/(\d+)\/?$/i)
    if (!pageMatch) return ''

    return buildArchiveUrl({ ...ext, page: pageMatch[1] })
}

function extractSeriesTitle($, fallbackUrl) {
    const title = stripEpisodeSuffix(
        $('h1.entry-title, h1.post-title, h1, .entry-title').first().text()
    )
    if (title) return title

    const slug = extractSeriesSlug(fallbackUrl)
    return slug ? slug.replace(/-/g, ' ') : ''
}

function extractSeriesUrlFromEpisodePage($) {
    return normalizeUrl(
        $('.nvs.nvsc a[href*="/anime/"], .nvs a[href*="/anime/"], .breadcrumb a[href*="/anime/"]').last().attr('href') ||
        ''
    )
}

function collectEpisodeLinks($) {
    const epMap = new Map()

    $('.eplister li a[href], .eplister a[href], #ts-episode-history a[href]').each((_, el) => {
        const $a = $(el)
        const href = normalizeUrl($a.attr('href'))
        if (!href || !/animotvslash\.org/i.test(href) || href.includes('/anime/')) return

        const num = tidy($a.find('.epl-num').first().text()) || extractEpisodeNumber(href)
        const title = tidy($a.find('.epl-title').first().text()) || (num ? `Episode ${num}` : '')
        const name = buildTrackName(title || $a.text(), href)

        if (!epMap.has(href)) epMap.set(href, name)
    })

    return epMap
}

function collectEpisodeLinksByRegex(html, seriesSlug) {
    const epMap = new Map()
    const re = /href=["'](https?:\/\/(?:www\.)?animotvslash\.org\/(?!anime\/)[^"'#]*?episode[^"'#]*?\/?)["']/gi
    let match

    while ((match = re.exec(html)) !== null) {
        const href = normalizeUrl(match[1])
        if (!href) continue
        if (seriesSlug && !href.toLowerCase().includes(`${seriesSlug}-episode`)) continue

        const num = extractEpisodeNumber(href)
        if (!epMap.has(href)) epMap.set(href, num ? `Episode ${num}` : href)
    }

    return epMap
}

function sortEpisodeEntries(entries) {
    return entries.sort((a, b) => {
        const na = parseInt(extractEpisodeNumber(a[0]) || extractEpisodeNumber(a[1]) || '0', 10)
        const nb = parseInt(extractEpisodeNumber(b[0]) || extractEpisodeNumber(b[1]) || '0', 10)

        if (na && nb && na !== nb) return na - nb
        return a[1].localeCompare(b[1], 'en', { numeric: true, sensitivity: 'base' })
    })
}

async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    const reqUrl = buildArchiveUrl(ext)

    let cards = []
    let nextUrl = ''

    try {
        const { $ } = await fetchHtml(reqUrl)
        if (ext.mode === 'home-latest') {
            cards = parseLatestHomeCards($)
            nextUrl = normalizeUrl(
                $('link[rel="next"]').attr('href') ||
                $('a.next.page-numbers[href], .pagination a.next[href], .nav-links a.next[href], a.r[href]').first().attr('href') ||
                ''
            )
        } else {
            cards = parseSeriesCards($)
            nextUrl = findNextPage($, ext)
        }
    } catch (e) {
        $print('getCards error: ' + e)
    }

    return jsonify({
        list: cards,
        ext: { ...ext, nextUrl },
        hasMore: !!nextUrl,
    })
}

async function getTracks(ext) {
    ext = argsify(ext)

    const targetUrl = normalizeUrl(ext.url)
    let groups = []

    try {
        let currentUrl = targetUrl
        let { data, $ } = await fetchHtml(currentUrl)
        let seriesUrl = currentUrl.includes('/anime/') ? currentUrl : ''
        let seriesName = extractSeriesTitle($, currentUrl)
        let epMap = collectEpisodeLinks($)

        if (epMap.size === 0 && !seriesUrl) {
            seriesUrl = extractSeriesUrlFromEpisodePage($)
            if (seriesUrl && seriesUrl !== currentUrl) {
                const seriesPage = await fetchHtml(seriesUrl, currentUrl)
                data = seriesPage.data
                $ = seriesPage.$
                currentUrl = seriesUrl
                seriesName = extractSeriesTitle($, currentUrl) || seriesName
                epMap = collectEpisodeLinks($)
            }
        }

        if (epMap.size === 0) {
            const seriesSlug = extractSeriesSlug(seriesUrl || targetUrl)
            epMap = collectEpisodeLinksByRegex(data, seriesSlug)
        }

        if (epMap.size > 0) {
            const tracks = sortEpisodeEntries(Array.from(epMap.entries())).map(([url, name]) => ({
                name: buildTrackName(name, url),
                pan: '',
                ext: { url },
            }))

            groups.push({
                title: seriesName || 'Episodes',
                tracks,
            })
        } else {
            groups.push({
                title: seriesName || 'Play',
                tracks: [{
                    name: buildTrackName('', targetUrl),
                    pan: '',
                    ext: { url: targetUrl },
                }],
            })
        }
    } catch (e) {
        $print('getTracks error: ' + e)
    }

    return jsonify({ list: groups })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)

    const targetUrl = normalizeUrl(ext.url)
    let playUrl = ''
    let referer = BASE

    function extract(html) {
        return (
            (html.match(/(?:contentUrl|file|src)\s*["':=]+\s*["'`](https?:\/\/[^"'`\s,)]+\.m3u8[^"'`\s,)]*)/i) || [])[1] ||
            (html.match(/(?:contentUrl|file|src)\s*["':=]+\s*["'`](https?:\/\/[^"'`\s,)]+\.mp4[^"'`\s,)]*)/i) || [])[1] ||
            (html.match(/"file"\s*:\s*"(https?:\/\/[^"]+)"/i) || [])[1] ||
            (html.match(/source:\s*["'`](https?:\/\/[^"'`]+)/i) || [])[1] ||
            ''
        )
    }

    function getIframeSrc($, baseUrl) {
        const src = $(
            '.player-embed iframe, .megavid iframe, .mvelement iframe, .aiovg-player iframe, iframe[src*="embed"], iframe'
        ).first().attr('src') || $('iframe').first().attr('data-src') || ''

        if (!src) return ''
        if (src.startsWith('//')) return 'https:' + src
        if (src.startsWith('/')) return baseUrl.match(/^https?:\/\/[^/]+/)[0] + src
        return src
    }

    try {
        const { data: html } = await fetchHtml(targetUrl)

        playUrl = extract(html)

        if (!playUrl) {
            const $ = cheerio.load(html)
            const src = getIframeSrc($, targetUrl)

            if (src) {
                const { data: iframeHtml } = await fetchHtml(src, targetUrl)
                referer = src
                playUrl = extract(iframeHtml)

                if (!playUrl) {
                    const $iframe = cheerio.load(iframeHtml)
                    const src2 = getIframeSrc($iframe, src)

                    if (src2 && src2 !== src) {
                        const { data: iframeHtml2 } = await fetchHtml(src2, src)
                        referer = src2
                        playUrl = extract(iframeHtml2)
                    }
                }
            }
        }
    } catch (e) {
        $print('getPlayinfo error: ' + e)
    }

    if (!playUrl) {
        $utils.toastError('无法获取播放地址，请尝试浏览器打开')
    }

    return jsonify({
        urls: [playUrl],
        headers: [{ 'User-Agent': UA, Referer: referer }],
    })
}

async function search(ext) {
    ext = argsify(ext)
    const q = encodeURIComponent(ext.text || '')
    const reqUrl = `${BASE}/?s=${q}`

    let cards = []

    try {
        const { $ } = await fetchHtml(reqUrl)
        cards = parseSeriesCards($)
    } catch (e) {
        $print('search error: ' + e)
    }

    return jsonify({ list: cards })
}
