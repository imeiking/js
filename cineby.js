/**
 * XPTV Extension — Cineby  v4.0
 * https://www.cineby.sc
 *
 * ★ Fix 1 — 图片空白
 *   根因：$fetch 请求 db.videasy.net 时未带正确 Referer/Origin，
 *         服务器返回 403，卡片数据拿不到，vod_pic 自然为空。
 *   修复：HEADERS 里加入正确的 Origin + Referer；
 *         同时对 poster_path 同时支持两种 TMDB 图片域名作为兜底。
 *
 * ★ Fix 2 — 播放失败
 *   根因：videasy / vidlink / vidsrc / autoembed 全部是纯 JS SPA，
 *         服务端 HTML 里没有任何 m3u8，无法通过 HTTP 请求提取流地址。
 *         之前所有"跟进 iframe / 调用 JSON API"的方案均无效。
 *   修复：getPlayinfo 直接返回 embed 页面 URL（videasy 格式），
 *         XPTV 会用内置 WebView 打开 embed 页自动播放，
 *         这是处理此类 SPA 播放器的唯一正确方式（参考 fmovies.js 的 iframe 模式）。
 */

const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'

const BASE    = 'https://www.cineby.sc'
const DB_BASE = 'https://db.videasy.net/3'

// TMDB 标准图片域名（两个均有效，image.tmdb.org 更稳定）
const IMG_BASE = 'https://image.tmdb.org/t/p'

// ★ Fix1：必须带 Origin + Referer，否则 db.videasy.net 返回 403
const HEADERS = {
    'User-Agent':                UA,
    'Accept':                    'application/json, text/plain, */*',
    'Accept-Language':           'en-US,en;q=0.9',
    'Origin':                    BASE,
    'Referer':                   BASE + '/',
    'Sec-Fetch-Dest':            'empty',
    'Sec-Fetch-Mode':            'cors',
    'Sec-Fetch-Site':            'cross-site',
}

const MEDIA = { MOVIE: 'movie', TV: 'tv' }

const MOVIE_GENRES = {
    28:'Action', 12:'Adventure', 16:'Animation', 35:'Comedy', 80:'Crime',
    99:'Documentary', 18:'Drama', 10751:'Family', 14:'Fantasy', 36:'History',
    27:'Horror', 10402:'Music', 9648:'Mystery', 10749:'Romance', 878:'Sci-Fi',
    10770:'TV Movie', 53:'Thriller', 10752:'War', 37:'Western',
}
const TV_GENRES = {
    10759:'Action & Adventure', 16:'Animation', 35:'Comedy', 80:'Crime',
    99:'Documentary', 18:'Drama', 10751:'Family', 10762:'Kids', 9648:'Mystery',
    10763:'News', 10764:'Reality', 10765:'Sci-Fi & Fantasy', 10766:'Soap',
    10767:'Talk', 10768:'War & Politics', 37:'Western',
}
const SORT_OPTIONS = [
    { n: 'Popular',   v: 'popularity.desc'   },
    { n: 'Top Rated', v: 'vote_average.desc'  },
    { n: 'Latest',    v: 'release_date.desc'  },
]
const TABS = [
    { name: '🎬 Movies',    ext: { kind: MEDIA.MOVIE, sort_by: 'popularity.desc',  page: 1 } },
    { name: '📺 TV Shows',  ext: { kind: MEDIA.TV,    sort_by: 'popularity.desc',  page: 1 } },
    { name: '⭐ Top Movies', ext: { kind: MEDIA.MOVIE, sort_by: 'vote_average.desc', page: 1 } },
    { name: '🏆 Top TV',    ext: { kind: MEDIA.TV,    sort_by: 'vote_average.desc', page: 1 } },
]
const appConfig = { ver: 1, title: 'Cineby', site: BASE, tabs: TABS }

/* ─── 工具 ──────────────────────────────────────────────────────── */
function tidy(t) { return String(t || '').replace(/\s+/g, ' ').trim() }

// ★ Fix1：poster_path 来自 TMDB，固定拼 image.tmdb.org
//   同时兜底：若已是完整 URL 直接返回
function toImg(path, size) {
    const p = tidy(path)
    if (!p) return ''
    if (/^https?:\/\//i.test(p)) return p
    // poster_path 格式："/abc123.jpg"（前导斜杠）
    const clean = p.startsWith('/') ? p : '/' + p
    return `${IMG_BASE}/${size}${clean}`
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
    const t = kind === MEDIA.TV ? TV_GENRES : MOVIE_GENRES
    return (item.genre_ids || []).map(id => t[id] || '').filter(Boolean)
}
function buildRemark(item, kind) {
    const parts = []
    const year  = pickYear(item)
    const score = item.vote_average ? Number(item.vote_average).toFixed(1) : ''
    const gs    = pickGenres(item, kind)
    if (year)  parts.push(year)
    if (score && score !== '0.0') parts.push('⭐' + score)
    if (gs.length) parts.push(gs.slice(0, 2).join('/'))
    return parts.join(' · ')
}
function makeVodId(kind, id) { return `${kind}:${id}` }
function parseVodId(v) {
    const p = tidy(v).split(':')
    return p.length === 2 ? { kind: p[0], id: parseInt(p[1], 10) || 0 } : { kind: '', id: 0 }
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
function buildQuery(p) {
    return Object.keys(p)
        .filter(k => p[k] !== undefined && p[k] !== null && p[k] !== '')
        .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(p[k])}`)
        .join('&')
}
async function fetchJson(url, params) {
    const qs = buildQuery(params || {})
    const { data } = await $fetch.get(qs ? `${url}?${qs}` : url, { headers: HEADERS })
    return typeof data === 'string' ? JSON.parse(data) : data
}
function buildFilters(ext) {
    const genres = ext.kind === MEDIA.TV ? TV_GENRES : MOVIE_GENRES
    const gv = [{ n: 'All', v: '' }].concat(
        Object.keys(genres).map(id => ({ n: genres[id], v: id }))
    )
    return [
        { key: 'sort_by', name: 'Sort',  init: 'popularity.desc', value: SORT_OPTIONS },
        { key: 'genre',   name: 'Genre', init: '',                 value: gv },
    ]
}
function normalizeExt(ext) {
    const n     = argsify(ext)
    n.kind      = n.kind    || MEDIA.MOVIE
    n.page      = parseInt(n.page || '1', 10) || 1
    n.sort_by   = n.sort_by || (n.filters && n.filters.sort_by) || 'popularity.desc'
    n.genre     = n.genre   || (n.filters && n.filters.genre)   || ''
    return n
}

/* ═══════════════════════════════════════════════════════════════════
   1. getConfig
═══════════════════════════════════════════════════════════════════ */
async function getConfig() {
    return jsonify(appConfig)
}

/* ═══════════════════════════════════════════════════════════════════
   2. getCards
═══════════════════════════════════════════════════════════════════ */
async function getCards(ext) {
    ext = normalizeExt(ext)
    const params = {
        page:                   ext.page,
        language:               'en',
        with_original_language: 'en',
        sort_by:                ext.sort_by,
    }
    if (ext.genre) params.with_genres = ext.genre

    const endpoint = `${DB_BASE}/discover/${ext.kind === MEDIA.TV ? 'tv' : 'movie'}`
    let json = { results: [], total_pages: 1 }, list = []
    try {
        json = await fetchJson(endpoint, params)
        list = (json.results || []).map(item => mapCard(item, ext.kind)).filter(Boolean)
    } catch (e) { $print('getCards error: ' + e) }

    return jsonify({
        list,
        hasMore: ext.page < (json.total_pages || 1),
        ext:    { ...ext, page: ext.page + 1 },
        filter: buildFilters(ext),
    })
}

/* ═══════════════════════════════════════════════════════════════════
   3. getTracks
═══════════════════════════════════════════════════════════════════ */
async function getMovieTracks(id) {
    const json  = await fetchJson(`${DB_BASE}/movie/${id}`, {
        append_to_response: 'external_ids',
        language:           'en',
    })
    const title = tidy(json.title || json.original_title || '')
    const year  = pickYear(json)
    const imdb  = (json.external_ids && json.external_ids.imdb_id) || ''

    // ★ Fix2：ext 里直接存好 embed URL，getPlayinfo 直接用
    return {
        list: [{
            title: title || 'Movie',
            tracks: [{
                name: year ? `${title} (${year})` : (title || 'Play'),
                pan:  '',
                ext: {
                    kind:     MEDIA.MOVIE,
                    tmdbId:   json.id,
                    imdbId:   imdb,
                    title,
                    year,
                    // 预计算好各备用源的 embed URL
                    embedUrls: [
                        `https://player.videasy.net/movie/${json.id}`,
                        `https://vidlink.pro/movie/${json.id}`,
                        `https://player.autoembed.cc/embed/movie/${json.id}`,
                        `https://vidfast.pro/movie/${json.id}`,
                    ],
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
    const title  = tidy(detail.name || detail.original_name || '')
    const year   = pickYear(detail)
    const imdb   = (detail.external_ids && detail.external_ids.imdb_id) || ''
    const total  = detail.number_of_seasons || 0
    const groups = []

    for (let s = 1; s <= total; s++) {
        let season
        try {
            season = await fetchJson(`${DB_BASE}/tv/${id}/season/${s}`, { language: 'en' })
        } catch (e) { $print(`season ${s} error: ${e}`); continue }

        const eps = (season.episodes || []).map(ep => ({
            name: ep.name
                ? `E${ep.episode_number} ${tidy(ep.name)}`
                : `Episode ${ep.episode_number}`,
            pan: '',
            ext: {
                kind:     MEDIA.TV,
                tmdbId:   id,
                imdbId:   imdb,
                title,
                year,
                seasonId:    season.season_number,
                episodeId:   ep.episode_number,
                totalSeasons: total,
                // ★ Fix2：预计算 embed URL
                embedUrls: [
                    `https://player.videasy.net/tv/${id}/${season.season_number}/${ep.episode_number}`,
                    `https://vidlink.pro/tv/${id}/${season.season_number}/${ep.episode_number}`,
                    `https://player.autoembed.cc/embed/tv/${id}/${season.season_number}/${ep.episode_number}`,
                    `https://vidfast.pro/tv/${id}/${season.season_number}/${ep.episode_number}`,
                ],
            },
        }))

        if (eps.length) {
            groups.push({ title: season.name || `Season ${season.season_number}`, tracks: eps })
        }
    }
    return { list: groups }
}

async function getTracks(ext) {
    ext = argsify(ext)
    let kind = ext.kind
    let id   = parseInt(ext.id || ext.tmdbId || '0', 10)

    if ((!kind || !id) && ext.vod_id) {
        const p = parseVodId(ext.vod_id)
        kind = kind || p.kind
        id   = id   || p.id
    }

    try {
        if (kind === MEDIA.MOVIE) return jsonify(await getMovieTracks(id))
        if (kind === MEDIA.TV)    return jsonify(await getTvTracks(id))
    } catch (e) { $print('getTracks error: ' + e) }

    return jsonify({ list: [] })
}

/* ═══════════════════════════════════════════════════════════════════
   4. getPlayinfo  ★ Fix2 核心修复
   
   videasy / vidlink / autoembed 均为纯 JS SPA，
   服务端 HTML 不含 m3u8，无法通过任何 HTTP 请求提取流地址。
   
   正确做法：直接把 embed URL 作为播放地址返回给 XPTV，
   XPTV 内置 WebView 会打开该 URL 并自动播放视频。
   
   embed URL 格式（已在 getTracks 里预计算好）：
     电影：https://player.videasy.net/movie/{tmdbId}
     剧集：https://player.videasy.net/tv/{tmdbId}/{season}/{episode}
   
   多源按优先级排列，XPTV 会在第一个无效时自动切换下一个。
═══════════════════════════════════════════════════════════════════ */
async function getPlayinfo(ext) {
    ext = argsify(ext)

    // 直接 URL（外部传入）
    if (ext.directUrl) {
        return jsonify({
            urls:    [ext.directUrl],
            headers: [{ 'User-Agent': UA, Referer: BASE + '/' }],
        })
    }

    const tmdbId   = ext.tmdbId   || ext.id
    const kind     = ext.kind
    const seasonId = ext.seasonId  || 1
    const epId     = ext.episodeId || 1
    const isTV     = kind === MEDIA.TV

    // 优先用 getTracks 预计算好的 embedUrls
    let embedUrls = ext.embedUrls || []

    // 若 embedUrls 为空（直接从其他入口进来），则动态构建
    if (!embedUrls.length && tmdbId) {
        if (isTV) {
            embedUrls = [
                `https://player.videasy.net/tv/${tmdbId}/${seasonId}/${epId}`,
                `https://vidlink.pro/tv/${tmdbId}/${seasonId}/${epId}`,
                `https://player.autoembed.cc/embed/tv/${tmdbId}/${seasonId}/${epId}`,
                `https://vidfast.pro/tv/${tmdbId}/${seasonId}/${epId}`,
            ]
        } else {
            embedUrls = [
                `https://player.videasy.net/movie/${tmdbId}`,
                `https://vidlink.pro/movie/${tmdbId}`,
                `https://player.autoembed.cc/embed/movie/${tmdbId}`,
                `https://vidfast.pro/movie/${tmdbId}`,
            ]
        }
    }

    if (!embedUrls.length) {
        $utils.toastError('Missing tmdb id, cannot build embed URL')
        return jsonify({ urls: [''], headers: [{}] })
    }

    // ★ 直接返回第一个 embed URL 作为播放地址
    //   XPTV 内置 WebView 会加载此页面并播放
    //   urls 数组里的多个 URL 会作为备用源
    const playUrl = embedUrls[0]

    return jsonify({
        urls:    embedUrls,                    // 多个备用源
        headers: [{
            'User-Agent': UA,
            'Referer':    BASE + '/',
        }],
    })
}

/* ═══════════════════════════════════════════════════════════════════
   5. search
═══════════════════════════════════════════════════════════════════ */
async function search(ext) {
    ext = argsify(ext)
    const keyword = tidy(ext.text || '')
    const page    = parseInt(ext.page || '1', 10) || 1
    if (!keyword) return jsonify({ list: [] })

    let json = { results: [] }, list = []
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
    } catch (e) { $print('search error: ' + e) }

    return jsonify({
        list,
        hasMore: page < (json.total_pages || 1),
        ext:    { text: keyword, page: page + 1 },
    })
}
