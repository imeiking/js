/**
 * XPTV Extension - Cineby
 * https://www.cineby.sc
 *
 * Notes:
 * 1. Lists/search/detail use Cineby's current videasy TMDB-style APIs.
 * 2. Movie / TV playback on Cineby is protected by a runtime wasm + page-memory
 *    verification flow. This draft keeps the data side complete and leaves
 *    playback with an explicit toast until the runtime key extraction is
 *    finished.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'

const BASE = 'https://www.cineby.sc'
const DB_BASE = 'https://db.videasy.net/3'
const API_BASE = 'https://api.videasy.net'

const HEADERS = {
    'User-Agent': UA,
    'Accept': 'application/json,text/plain,*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': BASE,
    'Referer': BASE + '/',
}

const IMG_BASE = 'https://image.tmdb.org/t/p'

const MEDIA = {
    MOVIE: 'movie',
    TV: 'tv',
}

const MOVIE_GENRES = {
    28: 'Action',
    12: 'Adventure',
    16: 'Animation',
    35: 'Comedy',
    80: 'Crime',
    99: 'Documentary',
    18: 'Drama',
    10751: 'Family',
    14: 'Fantasy',
    36: 'History',
    27: 'Horror',
    10402: 'Music',
    9648: 'Mystery',
    10749: 'Romance',
    878: 'Science Fiction',
    10770: 'TV Movie',
    53: 'Thriller',
    10752: 'War',
    37: 'Western',
}

const TV_GENRES = {
    10759: 'Action & Adventure',
    16: 'Animation',
    35: 'Comedy',
    80: 'Crime',
    99: 'Documentary',
    18: 'Drama',
    10751: 'Family',
    10762: 'Kids',
    9648: 'Mystery',
    10763: 'News',
    10764: 'Reality',
    10765: 'Sci-Fi & Fantasy',
    10766: 'Soap',
    10767: 'Talk',
    10768: 'War & Politics',
    37: 'Western',
}

const SORT_OPTIONS = [
    { n: 'Popular', v: 'popularity.desc' },
    { n: 'Top Rated', v: 'vote_average.desc' },
    { n: 'Latest', v: 'release_date.desc' },
]

const TABS = [
    { name: 'Movies', ext: { kind: MEDIA.MOVIE, sort_by: 'popularity.desc', page: 1 } },
    { name: 'TV Shows', ext: { kind: MEDIA.TV, sort_by: 'popularity.desc', page: 1 } },
    { name: 'Top Movies', ext: { kind: MEDIA.MOVIE, sort_by: 'vote_average.desc', page: 1 } },
    { name: 'Top TV', ext: { kind: MEDIA.TV, sort_by: 'vote_average.desc', page: 1 } },
]

const appConfig = {
    ver: 1,
    title: 'Cineby',
    site: BASE,
    tabs: TABS,
}

function tidy(text) {
    return String(text || '').replace(/\s+/g, ' ').trim()
}

function toImg(path, size) {
    const clean = tidy(path)
    if (!clean) return ''
    if (/^https?:\/\//i.test(clean)) return clean
    return `${IMG_BASE}/${size}${clean}`
}

function pickYear(item) {
    const raw = item.release_date || item.first_air_date || ''
    const match = String(raw).match(/\d{4}/)
    return match ? match[0] : ''
}

function pickTitle(item, kind) {
    return tidy(
        kind === MEDIA.TV
            ? (item.name || item.original_name)
            : (item.title || item.original_title)
    )
}

function pickGenres(item, kind) {
    const table = kind === MEDIA.TV ? TV_GENRES : MOVIE_GENRES
    return (item.genre_ids || [])
        .map(id => table[id] || '')
        .filter(Boolean)
}

function buildRemark(item, kind) {
    const parts = []
    const year = pickYear(item)
    const score = item.vote_average ? Number(item.vote_average).toFixed(1) : ''
    const genres = pickGenres(item, kind)

    if (year) parts.push(year)
    if (score && score !== '0.0') parts.push('TMDB ' + score)
    if (genres.length > 0) parts.push(genres.slice(0, 2).join(' / '))

    return parts.join(' | ')
}

function makeVodId(kind, id) {
    return `${kind}:${id}`
}

function parseVodId(vodId) {
    const text = tidy(vodId)
    const parts = text.split(':')
    if (parts.length === 2) return { kind: parts[0], id: parseInt(parts[1], 10) || 0 }
    return { kind: '', id: 0 }
}

function mapCard(item, kind) {
    const id = item.id || 0
    const title = pickTitle(item, kind)
    if (!id || !title) return null

    return {
        vod_id: makeVodId(kind, id),
        vod_name: title,
        vod_pic: toImg(item.poster_path, 'w342'),
        vod_remarks: buildRemark(item, kind),
        ext: {
            kind,
            id,
            title,
            year: pickYear(item),
            imdbId: item.imdb_id || '',
        },
    }
}

function buildQuery(params) {
    return Object.keys(params)
        .filter(key => params[key] !== undefined && params[key] !== null && params[key] !== '')
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&')
}

async function fetchJson(url, params) {
    const qs = buildQuery(params || {})
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
        {
            key: 'sort_by',
            name: 'Sort',
            init: 'popularity.desc',
            value: SORT_OPTIONS,
        },
        {
            key: 'genre',
            name: 'Genre',
            init: '',
            value: genreValues,
        },
    ]
}

function normalizeExt(ext) {
    const next = argsify(ext)
    next.kind = next.kind || MEDIA.MOVIE
    next.page = parseInt(next.page || '1', 10) || 1
    next.sort_by = next.sort_by || (next.filters && next.filters.sort_by) || 'popularity.desc'
    next.genre = next.genre || (next.filters && next.filters.genre) || ''
    return next
}

async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = normalizeExt(ext)

    const params = {
        page: ext.page,
        language: 'en',
        with_original_language: 'en',
        sort_by: ext.sort_by,
    }

    if (ext.genre) params.with_genres = ext.genre

    const endpoint = `${DB_BASE}/discover/${ext.kind === MEDIA.TV ? 'tv' : 'movie'}`
    let json = { results: [], total_pages: 1 }
    let list = []

    try {
        json = await fetchJson(endpoint, params)
        list = (json.results || [])
            .map(item => mapCard(item, ext.kind))
            .filter(Boolean)
    } catch (e) {
        $print('getCards error: ' + e)
    }

    return jsonify({
        list,
        hasMore: ext.page < (json.total_pages || 1),
        ext: {
            ...ext,
            page: ext.page + 1,
        },
        filter: buildFilters(ext),
    })
}

async function getMovieTracks(id) {
    const json = await fetchJson(`${DB_BASE}/movie/${id}`, {
        append_to_response: 'external_ids,translations',
        language: 'en',
    })

    const title = tidy(json.title || json.original_title || '')
    const year = pickYear(json)

    return {
        list: [{
            title: title || 'Movie',
            tracks: [{
                name: year ? `${title} (${year})` : (title || 'Play'),
                pan: '',
                ext: {
                    kind: MEDIA.MOVIE,
                    id: json.id,
                    tmdbId: json.id,
                    imdbId: json.imdb_id || '',
                    title: title,
                    year,
                },
            }],
        }],
    }
}

async function getTvTracks(id) {
    const detail = await fetchJson(`${DB_BASE}/tv/${id}`, {
        append_to_response: 'external_ids',
        language: 'en',
    })

    const groups = []
    const totalSeasons = detail.number_of_seasons || 0
    const title = tidy(detail.name || detail.original_name || '')
    const year = pickYear(detail)

    for (let seasonNumber = 1; seasonNumber <= totalSeasons; seasonNumber++) {
        let season
        try {
            season = await fetchJson(`${DB_BASE}/tv/${id}/season/${seasonNumber}`, {
                language: 'en',
            })
        } catch (e) {
            $print(`getTvTracks season ${seasonNumber} error: ${e}`)
            continue
        }

        const episodes = (season.episodes || []).map(ep => ({
            name: ep.name
                ? `E${ep.episode_number} ${tidy(ep.name)}`
                : `Episode ${ep.episode_number}`,
            pan: '',
            ext: {
                kind: MEDIA.TV,
                id,
                tmdbId: id,
                imdbId: detail.external_ids ? (detail.external_ids.imdb_id || '') : '',
                title,
                year,
                seasonId: season.season_number,
                episodeId: ep.episode_number,
                totalSeasons,
            },
        }))

        if (episodes.length > 0) {
            groups.push({
                title: season.name || `Season ${season.season_number}`,
                tracks: episodes,
            })
        }
    }

    return { list: groups }
}

async function getTracks(ext) {
    ext = argsify(ext)

    let kind = ext.kind
    let id = parseInt(ext.id || '0', 10)

    if ((!kind || !id) && ext.vod_id) {
        const parsed = parseVodId(ext.vod_id)
        kind = kind || parsed.kind
        id = id || parsed.id
    }

    try {
        if (kind === MEDIA.MOVIE) {
            return jsonify(await getMovieTracks(id))
        }
        if (kind === MEDIA.TV) {
            return jsonify(await getTvTracks(id))
        }
    } catch (e) {
        $print('getTracks error: ' + e)
    }

    return jsonify({ list: [] })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)

    if (ext.directUrl) {
        return jsonify({
            urls: [ext.directUrl],
            headers: [{ 'User-Agent': UA, Referer: BASE + '/' }],
        })
    }

    $utils.toastError('Cineby movie/TV playback still needs runtime key extraction')

    return jsonify({
        urls: [''],
        headers: [{ 'User-Agent': UA, Referer: BASE + '/' }],
    })
}

async function search(ext) {
    ext = argsify(ext)
    const keyword = tidy(ext.text || '')
    const page = parseInt(ext.page || '1', 10) || 1

    if (!keyword) return jsonify({ list: [] })

    let json = { results: [] }
    let list = []

    try {
        json = await fetchJson(`${DB_BASE}/search/multi`, {
            query: keyword,
            page,
            language: 'en',
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
        ext: { text: keyword, page: page + 1 },
    })
}
