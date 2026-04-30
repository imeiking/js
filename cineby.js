/**
 * XPTV Extension - Cineby
 * https://www.cineby.sc
 *
 * Notes:
 * 1. Lists/search/detail use Cineby's current videasy TMDB-style APIs.
 * 2. Playback follows Cineby's current site flow:
 *    sources-with-title -> wasm serve/verify/decrypt -> AES decrypt -> direct URLs.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'

const BASE = 'https://www.cineby.sc'
const DB_BASE = 'https://db.videasy.net/3'
const API_BASE = 'https://api.videasy.net'
const WASM_URL = BASE + '/module.wasm'

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

const PLAY_ENDPOINTS = [
    `${API_BASE}/mb-flix/sources-with-title`,
    `${API_BASE}/downloader2/sources-with-title`,
]

const HASH_XOR_SALT = '8c465aa8af6cbfd4c1f91bf0c8d678ba'
const HASH_KEY_SALT = 'd486ae1ce6fdbe63b60bd1704541fcf0'

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
    ver: 2,
    title: 'Cineby',
    site: BASE,
    tabs: TABS,
}

let cinebyWasmFactory = null
let cinebyWasm = null

function uniqueChars(text) {
    return [...new Set(text)]
}

function arrayDiff(source, blocked) {
    return source.filter(item => !blocked.includes(item))
}

function arrayIntersect(source, allow) {
    return source.filter(item => allow.includes(item))
}

function isIntegerLike(value) {
    return typeof value === 'bigint' || (
        !Number.isNaN(Number(value)) &&
        Math.floor(Number(value)) === Number(value)
    )
}

function isSafeEncodeValue(value) {
    return typeof value === 'bigint' || (value >= 0 && Number.isSafeInteger(value))
}

function ensureBigInt(message) {
    if (typeof BigInt !== 'function') {
        throw new TypeError(message || 'BigInt is not available in this environment')
    }
}

function consistentShuffle(source, salt) {
    if (salt.length === 0) return source
    const result = [...source]
    let codePoint
    for (let i = result.length - 1, v = 0, p = 0; i > 0; i--, v++) {
        v %= salt.length
        p += codePoint = salt[v].codePointAt(0)
        const j = (codePoint + v + p) % i
        const swap = result[i]
        result[i] = result[j]
        result[j] = swap
    }
    return result
}

function toAlphabet(numberValue, alphabet) {
    const out = []
    let value = numberValue

    if (typeof value === 'bigint') {
        const base = BigInt(alphabet.length)
        do {
            out.unshift(alphabet[Number(value % base)])
            value /= base
        } while (value > BigInt(0))
        return out
    }

    do {
        out.unshift(alphabet[value % alphabet.length])
        value = Math.floor(value / alphabet.length)
    } while (value > 0)

    return out
}

function fromAlphabet(inputChars, alphabet) {
    return inputChars.reduce((acc, ch) => {
        const pos = alphabet.indexOf(ch)
        if (pos === -1) {
            throw new Error(
                `The provided ID (${inputChars.join('')}) is invalid, ` +
                `as it contains characters that do not exist in the alphabet (${alphabet.join('')})`
            )
        }

        if (typeof acc === 'bigint') {
            return acc * BigInt(alphabet.length) + BigInt(pos)
        }

        const next = acc * alphabet.length + pos
        if (Number.isSafeInteger(next)) return next

        ensureBigInt(
            'Unable to decode the provided string, due to lack of support ' +
            'for BigInt numbers in the current environment'
        )
        return BigInt(acc) * BigInt(alphabet.length) + BigInt(pos)
    }, 0)
}

function splitEvery(text, size, mapper) {
    return Array.from(
        { length: Math.ceil(text.length / size) },
        (_, index) => mapper(text.slice(index * size, (index + 1) * size))
    )
}

function escapeRegex(text) {
    return text.replace(/[\s#$()*+,.?[\\\]^{|}-]/g, '\\$&')
}

function guardsRegex(items) {
    return new RegExp(
        items
            .map(item => escapeRegex(item))
            .sort((a, b) => b.length - a.length)
            .join('|')
    )
}

function allowedCharsRegex(items) {
    return new RegExp(
        `^[${items.map(item => escapeRegex(item)).sort((a, b) => b.length - a.length).join('')}]+$`
    )
}

function parseIntegerText(text) {
    if (!/^\+?\d+$/.test(text)) return Number.NaN
    const parsed = Number.parseInt(text, 10)
    if (Number.isSafeInteger(parsed)) return parsed
    ensureBigInt(
        'Unable to encode the provided BigInt string without loss of information ' +
        'due to lack of support for BigInt type in the current environment'
    )
    return BigInt(text)
}

class HashidsLike {
    constructor(salt = '', minLength = 0,
        alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
        separators = 'cfhistuCFHISTU') {
        this.minLength = minLength
        if (typeof minLength !== 'number') {
            throw new TypeError(`Hashids: Provided 'minLength' has to be a number (is ${typeof minLength})`)
        }
        if (typeof salt !== 'string') {
            throw new TypeError(`Hashids: Provided 'salt' has to be a string (is ${typeof salt})`)
        }
        if (typeof alphabet !== 'string') {
            throw new TypeError(`Hashids: Provided alphabet has to be a string (is ${typeof alphabet})`)
        }

        const saltChars = Array.from(salt)
        const alphabetChars = Array.from(alphabet)
        const separatorChars = Array.from(separators)

        this.salt = saltChars

        const uniqueAlphabet = uniqueChars(alphabetChars)
        if (uniqueAlphabet.length < 16) {
            throw new Error(
                `Hashids: alphabet must contain at least 16 unique characters, ` +
                `provided: ${uniqueAlphabet.join('')}`
            )
        }

        this.alphabet = arrayDiff(uniqueAlphabet, separatorChars)
        let seps = arrayIntersect(separatorChars, uniqueAlphabet)
        this.seps = consistentShuffle(seps, saltChars)

        if (this.seps.length === 0 || this.alphabet.length / this.seps.length > 3.5) {
            const target = Math.ceil(this.alphabet.length / 3.5)
            if (target > this.seps.length) {
                const diff = target - this.seps.length
                this.seps.push(...this.alphabet.slice(0, diff))
                this.alphabet = this.alphabet.slice(diff)
            }
        }

        this.alphabet = consistentShuffle(this.alphabet, saltChars)
        const guardCount = Math.ceil(this.alphabet.length / 12)

        if (this.alphabet.length < 3) {
            this.guards = this.seps.slice(0, guardCount)
            this.seps = this.seps.slice(guardCount)
        } else {
            this.guards = this.alphabet.slice(0, guardCount)
            this.alphabet = this.alphabet.slice(guardCount)
        }

        this.guardsRegExp = guardsRegex(this.guards)
        this.sepsRegExp = guardsRegex(this.seps)
        this.allowedCharsRegExp = allowedCharsRegex([...this.alphabet, ...this.guards, ...this.seps])
    }

    encode(value, ...rest) {
        let values = Array.isArray(value) ? value : [...(value != null ? [value] : []), ...rest]
        if (values.length === 0) return ''
        if (!values.every(isIntegerLike)) {
            values = values.map(item => {
                if (typeof item === 'bigint' || typeof item === 'number') return item
                return parseIntegerText(String(item))
            })
        }
        return values.every(isSafeEncodeValue) ? this._encode(values).join('') : ''
    }

    encodeHex(value) {
        let text = value
        switch (typeof text) {
            case 'bigint':
                text = text.toString(16)
                break
            case 'string':
                if (!/^[\dA-Fa-f]+$/.test(text)) return ''
                break
            default:
                throw new Error(
                    `Hashids: The provided value is neither a string, nor a BigInt (got: ${typeof text})`
                )
        }
        const numbers = splitEvery(text, 12, part => Number.parseInt(`1${part}`, 16))
        return this.encode(numbers)
    }

    isValidId(text) {
        return this.allowedCharsRegExp.test(text)
    }

    _encode(values) {
        let alphabet = this.alphabet
        const numbersIdInt = values.reduce((acc, item, index) => {
            const current = typeof item === 'bigint' ? Number(item % BigInt(index + 100)) : item % (index + 100)
            return acc + current
        }, 0)

        let result = [alphabet[numbersIdInt % alphabet.length]]
        let lottery = [...result]

        values.forEach((value, index) => {
            const buffer = lottery.concat(this.salt, alphabet)
            const localAlphabet = consistentShuffle(alphabet, buffer)
            const chars = toAlphabet(value, localAlphabet)
            result.push(...chars)

            if (index + 1 < values.length) {
                const first = chars[0].codePointAt(0) + index
                const mod = typeof value === 'bigint' ? Number(value % BigInt(first)) : value % first
                result.push(this.seps[mod % this.seps.length])
            }

            alphabet = localAlphabet
        })

        if (result.length < this.minLength) {
            let guardIndex = (numbersIdInt + result[0].codePointAt(0)) % this.guards.length
            result.unshift(this.guards[guardIndex])

            if (result.length < this.minLength) {
                guardIndex = (numbersIdInt + result[2].codePointAt(0)) % this.guards.length
                result.push(this.guards[guardIndex])
            }
        }

        const halfLength = Math.floor(alphabet.length / 2)
        while (result.length < this.minLength) {
            alphabet = consistentShuffle(alphabet, alphabet)
            result.unshift(...alphabet.slice(halfLength))
            result.push(...alphabet.slice(0, halfLength))
            const excess = result.length - this.minLength
            if (excess > 0) {
                const offset = excess / 2
                result = result.slice(offset, offset + this.minLength)
            }
        }

        return result
    }
}

function tidy(text) {
    return String(text || '').replace(/\s+/g, ' ').trim()
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function getRootScope() {
    const root = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : {})
    if (!root.window) root.window = root
    return root
}

function getCryptoJS() {
    if (typeof createCryptoJS === 'function') return createCryptoJS()
    throw new Error('CryptoJS runtime is unavailable')
}

async function fetchText(url, params, headers) {
    const qs = buildQuery(params || {})
    const fullUrl = qs ? `${url}?${qs}` : url
    const { data } = await $fetch.get(fullUrl, { headers: headers || HEADERS })
    return typeof data === 'string' ? data : String(data || '')
}

async function fetchArrayBuffer(url, headers) {
    if (typeof fetch === 'function') {
        const response = await fetch(url, { headers: headers || HEADERS })
        if (!response.ok) throw new Error(`fetchArrayBuffer ${response.status} ${response.statusText}`)
        return await response.arrayBuffer()
    }
    const { data } = await $fetch.get(url, { headers: headers || HEADERS })
    if (data instanceof ArrayBuffer) return data
    if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    throw new Error('Binary fetch is unavailable in this runtime')
}

async function instantiateCinebyWasm(bytes, options) {
    const imports = {
        env: Object.assign(Object.create(getRootScope()), (options && options.env) || {}, {
            seed: () => Date.now() * Math.random(),
            abort(code, file, line, column) {
                throw new Error(`${code >>> 0} in ${file >>> 0}:${line >>> 0}:${column >>> 0}`)
            },
        }),
    }

    const result = await WebAssembly.instantiate(bytes, imports)
    const exports = result.instance ? result.instance.exports : result.exports
    const memory = exports.memory || imports.env.memory

    function readString(ptr) {
        if (!ptr) return null
        const end = (ptr + new Uint32Array(memory.buffer)[(ptr - 4) >>> 2]) >>> 1
        const data = new Uint16Array(memory.buffer)
        let offset = ptr >>> 1
        let out = ''
        while (end - offset > 1024) {
            out += String.fromCharCode(...data.subarray(offset, offset += 1024))
        }
        return out + String.fromCharCode(...data.subarray(offset, end))
    }

    function writeString(value) {
        if (value == null) return 0
        const text = String(value)
        const ptr = exports.__new(text.length << 1, 2) >>> 0
        const data = new Uint16Array(memory.buffer)
        for (let i = 0; i < text.length; i += 1) {
            data[(ptr >>> 1) + i] = text.charCodeAt(i)
        }
        return ptr
    }

    function assertStringPointer(value) {
        if (!value) throw new TypeError('value must not be null')
        return value
    }

    return Object.setPrototypeOf({
        serve: () => readString(exports.serve() >>> 0),
        verify: value => {
            const ptr = assertStringPointer(writeString(value))
            return exports.verify(ptr) !== 0
        },
        decrypt: (value, mediaId) => {
            const ptr = assertStringPointer(writeString(value))
            return readString(exports.decrypt(ptr, mediaId) >>> 0)
        },
    }, exports)
}

async function getCinebyWasm() {
    if (!cinebyWasm) {
        if (!cinebyWasmFactory) {
            const bytes = await fetchArrayBuffer(WASM_URL, {
                'User-Agent': UA,
                'Referer': BASE + '/',
                'Origin': BASE,
            })
            cinebyWasmFactory = instantiateCinebyWasm(bytes, { env: {} })
        }
        cinebyWasm = await cinebyWasmFactory
    }
    return cinebyWasm
}

function xorHexSeed(value) {
    const saltCodes = HASH_XOR_SALT.split('').map(ch => ch.charCodeAt(0))
    return String(value)
        .split('')
        .map(ch => ch.charCodeAt(0))
        .map(code => saltCodes.reduce((acc, saltCode) => acc ^ saltCode, code))
        .map(code => ('0' + Number(code).toString(16)).slice(-2))
        .join('')
}

function buildPlaybackKey(tmdbId) {
    const seed = xorHexSeed(String(tmdbId) + HASH_KEY_SALT)
    const hashids = new HashidsLike()
    return hashids.encodeHex(seed)
}

async function resolveServeHash(wasm) {
    const root = getRootScope()
    delete root.hash
    const source = wasm.serve()
    if (!source) throw new Error('serve() returned an empty Cineby script')
    Function(source)()

    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
        if (typeof root.hash === 'string' && root.hash.length >= 64) {
            return root.hash
        }
        await sleep(20)
    }

    throw new Error('Timed out waiting for Cineby playback hash')
}

async function decryptPlaybackPayload(cipherText, aesKey, mediaId) {
    const wasm = await getCinebyWasm()
    const hash = await resolveServeHash(wasm)
    wasm.verify(hash)

    const encryptedText = wasm.decrypt(cipherText, mediaId)
    const CryptoJS = getCryptoJS()
    const decrypted = CryptoJS.AES.decrypt(encryptedText, aesKey).toString(CryptoJS.enc.Utf8)
    if (!decrypted) throw new Error('Cineby AES decrypt returned empty data')
    return decrypted
}

function buildPlaybackParams(ext) {
    return {
        title: encodeURIComponent(ext.title || ''),
        mediaType: ext.kind === MEDIA.TV ? MEDIA.TV : MEDIA.MOVIE,
        year: ext.year || '',
        totalSeasons: ext.kind === MEDIA.TV ? (ext.totalSeasons || '') : '',
        episodeId: ext.episodeId || 1,
        seasonId: ext.seasonId || 1,
        tmdbId: ext.tmdbId || ext.id || '',
        imdbId: ext.imdbId || '',
    }
}

async function fetchEncryptedSources(ext) {
    let lastError = null
    for (const endpoint of PLAY_ENDPOINTS) {
        try {
            const data = await fetchText(endpoint, buildPlaybackParams(ext))
            if (tidy(data)) return data
        } catch (e) {
            lastError = e
            $print(`fetchEncryptedSources ${endpoint} error: ${e}`)
        }
    }
    throw lastError || new Error('No Cineby playback endpoint returned data')
}

function qualityWeight(item) {
    const table = {
        auto: 6,
        '360': 5,
        '360p': 5,
        '480': 4,
        '480p': 4,
        '720': 3,
        '720p': 3,
        '1080': 2,
        '1080p': 2,
        '2160': 1,
        '2160p': 1,
        '4k': 1,
    }
    return table[String((item && item.quality) || '').toLowerCase()] || 99
}

function extractPlaybackUrls(jsonText) {
    const data = JSON.parse(jsonText)
    const sources = Array.isArray(data.sources) ? data.sources : []
    const urls = sources
        .filter(item => tidy(item.url || item.file))
        .sort((a, b) => qualityWeight(a) - qualityWeight(b))
        .map(item => tidy(item.url || item.file))

    return [...new Set(urls)]
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

    try {
        const tmdbId = parseInt(ext.tmdbId || ext.id || '0', 10) || 0
        if (!tmdbId) throw new Error('Missing tmdbId')

        const encryptedPayload = await fetchEncryptedSources(ext)
        const decryptedJson = await decryptPlaybackPayload(
            encryptedPayload,
            buildPlaybackKey(tmdbId),
            tmdbId
        )
        const urls = extractPlaybackUrls(decryptedJson)
        if (urls.length === 0) throw new Error('No playable Cineby URLs found')

        return jsonify({
            urls,
            headers: urls.map(() => ({
                'User-Agent': UA,
                'Referer': BASE + '/',
                'Origin': BASE,
            })),
        })
    } catch (e) {
        $print('getPlayinfo error: ' + e)
        $utils.toastError('Cineby playback parse failed')
        return jsonify({
            urls: [''],
            headers: [{ 'User-Agent': UA, Referer: BASE + '/' }],
        })
    }
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
