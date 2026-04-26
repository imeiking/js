/**
 * XPTV Extension - Cineby  v2.0
 * https://www.cineby.sc
 *
 * ✅ 完整实现，包括播放地址提取
 *
 * 架构说明：
 *  - 列表/搜索/详情  → db.videasy.net TMDB 镜像 API
 *  - 播放地址提取    → player.cineby.workers.dev (Cineby 自有 VidApi 实例)
 *                     embed URL：/movie/{tmdbId}  /tv/{tmdbId}/{season}/{episode}
 *                     无需 wasm/内存读取，跟进 iframe 用正则提取 m3u8
 */

const cheerio = createCheerio()

/* ─────────────────── 常量 ─────────────────────────────────────── */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'

const BASE     = 'https://www.cineby.sc'
const DB_BASE  = 'https://db.videasy.net/3'
const PLAYER   = 'https://player.cineby.workers.dev'   // VidApi 实例
const IMG_BASE = 'https://image.tmdb.org/t/p'

const HEADERS = {
    'User-Agent':      UA,
    'Accept':          'application/json,text/plain,*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin':          BASE,
    'Referer':         BASE + '/',
}

const MEDIA = { MOVIE: 'movie', TV: 'tv' }

const MOVIE_GENRES = {
    28:'Action',12:'Adventure',16:'Animation',35:'Comedy',80:'Crime',
    99:'Documentary',18:'Drama',10751:'Family',14:'Fantasy',36:'History',
    27:'Horror',10402:'Music',9648:'Mystery',10749:'Romance',878:'Science Fiction',
    10770:'TV Movie',53:'Thriller',10752:'War',37:'Western',
}
const TV_GENRES = {
    10759:'Action & Adventure',16:'Animation',35:'Comedy',80:'Crime',
    99:'Documentary',18:'Drama',10751:'Family',10762:'Kids',9648:'Mystery',
    10763:'News',10764:'Reality',10765:'Sci-Fi & Fantasy',10766:'Soap',
    10767:'Talk',10768:'War & Politics',37:'Western',
}

const SORT_OPTIONS = [
    { n: 'Popular',   v: 'popularity.desc'   },
    { n: 'Top Rated', v: 'vote_average.desc'  },
    { n: 'Latest',    v: 'release_date.desc'  },
]

const TABS = [
    { name: '🎬 Movies',   ext: { kind: MEDIA.MOVIE, sort_by: 'popularity.desc',  page: 1 } },
    { name: '📺 TV Shows', ext: { kind: MEDIA.TV,    sort_by: 'popularity.desc',  page: 1 } },
    { name: '⭐ Top Movies',ext: { kind: MEDIA.MOVIE, sort_by: 'vote_average.desc', page: 1 } },
    { name: '🏆 Top TV',   ext: { kind: MEDIA.TV,    sort_by: 'vote_average.desc', page: 1 } },
]

const appConfig = { ver: 1, title: 'Cineby', site: BASE, tabs: TABS }

/* ─────────────────── 工具函数 ─────────────────────────────────── */
function tidy(text) { return String(text || '').replace(/\s+/g, ' ').trim() }

function toImg(path, size) {
    const clean = tidy(path)
    if (!clean) return ''
    return /^https?:\/\//i.test(clean) ? clean : `${IMG_BASE}/${size}${clean}`
}

function pickYear(item) {
    const m = String(item.release_date || item.first_air_date || '').match(/\d{4}/)
    return m ? m[0] : ''
}

function pickTitle(item, kind) {
    return tidy(kind === MEDIA.TV
        ? (item.name || item.original_name)
        : (item.title || item.original_title))
}

function pickGenres(item, kind) {
    const table = kind === MEDIA.TV ? TV_GENRES : MOVIE_GENRES
    return (item.genre_ids || []).map(id => table[id] || '').filter(Boolean)
}

function buildRemark(item, kind) {
    const parts = []
    const year  = pickYear(item)
    const score = item.vote_average ? Number(item.vote_average).toFixed(1) : ''
    const genres = pickGenres(item, kind)
    if (year)  parts.push(year)
    if (score && score !== '0.0') parts.push('⭐' + score)
    if (genres.length > 0) parts.push(genres.slice(0, 2).join('/'))
    return parts.join(' · ')
}

function makeVodId(kind, id) { return `${kind}:${id}` }

function parseVodId(vodId) {
    const parts = tidy(vodId).split(':')
    return parts.length === 2
        ? { kind: parts[0], id: parseInt(parts[1], 10) || 0 }
        : { kind: '', id: 0 }
}

function mapCard(item, kind) {
    const id    = item.id || 0
    const title = pickTitle(item, kind)
    if (!id || !title) return null
    return {
        vod_id:      makeVodId(kind, id),
        vod_name:    title,
        vod_pic:     toImg(item.poster_path, 'w342'),
        vod_remarks: buildRemark(item, kind),
        ext: { kind, id, title, year: pickYear(item) },
    }
}

function buildQuery(params) {
    return Object.keys(params)
        .filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '')
        .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
        .join('&')
}

async function fetchJson(url, params) {
    const qs      = buildQuery(params || {})
    const fullUrl = qs ? `${url}?${qs}` : url
    const { data } = await $fetch.get(fullUrl, { headers: HEADERS })
    return typeof data === 'string' ? JSON.parse(data) : data
}

function buildFilters(ext) {
    const genres = ext.kind === MEDIA.TV ? TV_GENRES : MOVIE_GENRES
    const genreValues = [{ n: 'All', v: '' }].concat(
        Object.keys(genres).map(id => ({ n: genres[id], v: id }))
    )
    return [
        { key: 'sort_by', name: 'Sort',  init: 'popularity.desc', value: SORT_OPTIONS },
        { key: 'genre',   name: 'Genre', init: '',                 value: genreValues  },
    ]
}

function normalizeExt(ext) {
    const next = argsify(ext)
    next.kind    = next.kind    || MEDIA.MOVIE
    next.page    = parseInt(next.page || '1', 10) || 1
    next.sort_by = next.sort_by || (next.filters && next.filters.sort_by) || 'popularity.desc'
    next.genre   = next.genre   || (next.filters && next.filters.genre)   || ''
    return next
}

/* ═══════════════════════════════════════════════════════════════
   1. getConfig
═══════════════════════════════════════════════════════════════ */
async function getConfig() {
    return jsonify(appConfig)
}

/* ═══════════════════════════════════════════════════════════════
   2. getCards
═══════════════════════════════════════════════════════════════ */
async function getCards(ext) {
    ext = normalizeExt(ext)

    const params = {
        page:                    ext.page,
        language:                'en',
        with_original_language:  'en',
        sort_by:                 ext.sort_by,
    }
    if (ext.genre) params.with_genres = ext.genre

    const endpoint = `${DB_BASE}/discover/${ext.kind === MEDIA.TV ? 'tv' : 'movie'}`
    let json = { results: [], total_pages: 1 }
    let list = []

    try {
        json = await fetchJson(endpoint, params)
        list = (json.results || []).map(item => mapCard(item, ext.kind)).filter(Boolean)
    } catch (e) {
        $print('getCards error: ' + e)
    }

    return jsonify({
        list,
        hasMore: ext.page < (json.total_pages || 1),
        ext:     { ...ext, page: ext.page + 1 },
        filter:  buildFilters(ext),
    })
}

/* ═══════════════════════════════════════════════════════════════
   3. getTracks
═══════════════════════════════════════════════════════════════ */
async function getMovieTracks(id) {
    const json  = await fetchJson(`${DB_BASE}/movie/${id}`, {
        append_to_response: 'external_ids',
        language:           'en',
    })
    const title = tidy(json.title || json.original_title || '')
    const year  = pickYear(json)

    return {
        list: [{
            title:  title || 'Movie',
            tracks: [{
                name: year ? `${title} (${year})` : (title || 'Play'),
                pan:  '',
                ext:  {
                    kind:   MEDIA.MOVIE,
                    id:     json.id,
                    tmdbId: json.id,
                    imdbId: (json.external_ids && json.external_ids.imdb_id) || '',
                    title,
                    year,
                },
            }],
        }],
    }
}

async function getTvTracks(id) {
    const detail = await fetchJson(`${DB_BASE}/tv/${id}`, {
        append_to_response: 'external_ids',
        language:           'en',
    })
    const title       = tidy(detail.name || detail.original_name || '')
    const year        = pickYear(detail)
    const totalSeasons = detail.number_of_seasons || 0
    const imdbId      = (detail.external_ids && detail.external_ids.imdb_id) || ''
    const groups      = []

    for (let s = 1; s <= totalSeasons; s++) {
        let season
        try {
            season = await fetchJson(`${DB_BASE}/tv/${id}/season/${s}`, { language: 'en' })
        } catch (e) {
            $print(`getTvTracks season ${s} error: ${e}`)
            continue
        }

        const episodes = (season.episodes || []).map(ep => ({
            name: ep.name
                ? `E${ep.episode_number} ${tidy(ep.name)}`
                : `Episode ${ep.episode_number}`,
            pan:  '',
            ext:  {
                kind:         MEDIA.TV,
                id,
                tmdbId:       id,
                imdbId,
                title,
                year,
                seasonId:     season.season_number,
                episodeId:    ep.episode_number,
                totalSeasons,
            },
        }))

        if (episodes.length > 0) {
            groups.push({
                title:  season.name || `Season ${season.season_number}`,
                tracks: episodes,
            })
        }
    }

    return { list: groups }
}

async function getTracks(ext) {
    ext = argsify(ext)
    let kind = ext.kind
    let id   = parseInt(ext.id || '0', 10)

    if ((!kind || !id) && ext.vod_id) {
        const parsed = parseVodId(ext.vod_id)
        kind = kind || parsed.kind
        id   = id   || parsed.id
    }

    try {
        if (kind === MEDIA.MOVIE) return jsonify(await getMovieTracks(id))
        if (kind === MEDIA.TV)    return jsonify(await getTvTracks(id))
    } catch (e) {
        $print('getTracks error: ' + e)
    }

    return jsonify({ list: [] })
}

/* ═══════════════════════════════════════════════════════════════
   4. getPlayinfo  ★ 核心修复
   
   流程：
     1. 构造 VidApi embed URL（Cineby 自有实例）
        Movie : https://player.cineby.workers.dev/movie/{tmdbId}
        TV    : https://player.cineby.workers.dev/tv/{tmdbId}/{season}/{episode}
     
     2. GET embed 页面 → 在 HTML / inline script 里搜索：
        a. hls.loadSource("https://...m3u8")
        b. file: "https://...m3u8"
        c. source: "https://..."
        d. 嵌套 <iframe src="..."> → 跟进再提取
     
     3. 多源降级：videasy embed → vidsrc embed → autoembed
        任何一源成功即返回
═══════════════════════════════════════════════════════════════ */

// 从任意 HTML/JS 字符串里提取第一个 m3u8/mp4 URL
function extractStream(html) {
    const patterns = [
        /hls\.loadSource\(["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)/i,
        /["'`](https?:\/\/[^"'`\s]+\.m3u8(?:\?[^"'`\s]*)?)/i,
        /file\s*:\s*["'`](https?:\/\/[^"'`\s,)]+)/i,
        /source\s*:\s*["'`](https?:\/\/[^"'`\s,)]+)/i,
        /src\s*:\s*["'`](https?:\/\/[^"'`\s,)]+\.(?:m3u8|mp4)[^"'`\s,)]*)/i,
        /["'`](https?:\/\/[^"'`\s]+\.mp4(?:\?[^"'`\s]*)?)/i,
    ]
    for (const re of patterns) {
        const m = html.match(re)
        if (m && m[1] && !m[1].includes('poster') && !m[1].includes('thumb')) {
            return m[1]
        }
    }
    return ''
}

// 从 HTML 里提取第一个 iframe src（绝对化）
function extractIframe(html, base) {
    const $  = cheerio.load(html)
    let src  = $('iframe[src]').first().attr('src') ||
               $('iframe[data-src]').first().attr('data-src') || ''
    if (!src) return ''
    if (src.startsWith('//'))  src = 'https:' + src
    if (src.startsWith('/'))   src = new URL(base).origin + src
    return src
}

// 带 Referer 的 GET，返回 data string
async function fetchHtml(url, referer) {
    const h = {
        'User-Agent':      UA,
        'Accept':          'text/html,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer':         referer || BASE + '/',
    }
    const { data } = await $fetch.get(url, { headers: h })
    return typeof data === 'string' ? data : JSON.stringify(data)
}

// 单源提取：embed URL → 最多 3 层 iframe
async function extractFromEmbed(embedUrl, depth) {
    depth = depth || 0
    if (depth > 3) return { url: '', referer: '' }

    let html
    try {
        html = await fetchHtml(embedUrl, depth === 0 ? BASE + '/' : embedUrl)
    } catch (e) {
        $print(`fetchHtml depth=${depth} error: ${e}`)
        return { url: '', referer: '' }
    }

    // 优先在当前页直接找流地址
    const direct = extractStream(html)
    if (direct) return { url: direct, referer: embedUrl }

    // 找嵌套 iframe
    const nested = extractIframe(html, embedUrl)
    if (nested && nested !== embedUrl) {
        return extractFromEmbed(nested, depth + 1)
    }

    return { url: '', referer: embedUrl }
}

async function getPlayinfo(ext) {
    ext = argsify(ext)

    // 如果上层已解析好直接 URL
    if (ext.directUrl) {
        return jsonify({
            urls:    [ext.directUrl],
            headers: [{ 'User-Agent': UA, Referer: BASE + '/' }],
        })
    }

    const tmdbId   = ext.tmdbId  || ext.id
    const kind     = ext.kind
    const seasonId = ext.seasonId
    const epId     = ext.episodeId

    if (!tmdbId || !kind) {
        $utils.toastError('Missing tmdbId or kind')
        return jsonify({ urls: [''], headers: [{}] })
    }

    // ── 构造多个候选 embed URL（优先级从高到低）────────────────────
    const embedUrls = []

    if (kind === MEDIA.MOVIE) {
        // 1. Cineby 自有 VidApi
        embedUrls.push(`${PLAYER}/movie/${tmdbId}`)
        // 2. player.videasy.net（同服务方）
        embedUrls.push(`https://player.videasy.net/movie/${tmdbId}`)
        // 3. vidsrc 备用
        embedUrls.push(`https://vidsrc.cc/v2/embed/movie/${tmdbId}`)
        // 4. autoembed 备用
        embedUrls.push(`https://player.autoembed.cc/embed/movie/${tmdbId}`)
    } else {
        // TV
        const s = seasonId  || 1
        const e = epId      || 1
        embedUrls.push(`${PLAYER}/tv/${tmdbId}/${s}/${e}`)
        embedUrls.push(`https://player.videasy.net/tv/${tmdbId}/${s}/${e}`)
        embedUrls.push(`https://vidsrc.cc/v2/embed/tv/${tmdbId}?season=${s}&episode=${e}`)
        embedUrls.push(`https://player.autoembed.cc/embed/tv/${tmdbId}/${s}/${e}`)
    }

    // ── 逐源尝试 ───────────────────────────────────────────────────
    let playUrl = ''
    let referer = BASE + '/'

    for (const embedUrl of embedUrls) {
        $print(`Trying embed: ${embedUrl}`)
        try {
            const result = await extractFromEmbed(embedUrl, 0)
            if (result.url) {
                playUrl = result.url
                referer = result.referer
                $print(`Found stream from: ${embedUrl}`)
                break
            }
        } catch (e) {
            $print(`Embed failed: ${embedUrl} - ${e}`)
        }
    }

    if (!playUrl) {
        $utils.toastError('All embed sources failed. Try a proxy.')
        return jsonify({
            urls:    [''],
            headers: [{ 'User-Agent': UA, Referer: BASE + '/' }],
        })
    }

    return jsonify({
        urls:    [playUrl],
        headers: [{ 'User-Agent': UA, Referer: referer }],
    })
}

/* ═══════════════════════════════════════════════════════════════
   5. search
═══════════════════════════════════════════════════════════════ */
async function search(ext) {
    ext = argsify(ext)
    const keyword = tidy(ext.text || '')
    const page    = parseInt(ext.page || '1', 10) || 1
    if (!keyword) return jsonify({ list: [] })

    let json = { results: [] }
    let list = []

    try {
        json = await fetchJson(`${DB_BASE}/search/multi`, {
            query:         keyword,
            page,
            language:      'en',
            include_adult: 'false',
        })
        list = (json.results || [])
            .filter(item => item.media_type === MEDIA.MOVIE || item.media_type === MEDIA.TV)
            .map(item => mapCard(item, item.media_type))
            .filter(Boolean)
    } catch (e) {
        $print('search error: ' + e)
    }

    return jsonify({
        list,
        hasMore: page < (json.total_pages || 1),
        ext:     { text: keyword, page: page + 1 },
    })
}
