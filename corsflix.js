/*
 * Corsflix (https://corsflix.gd) —— XPTV (JSC) 点播源
 * ---------------------------------------------------------------
 * 功能：
 *   - 分类：热门趋势 / 电影 / 剧集 / 新片 / 院线 / 即将上映 / 高分榜 /
 *           今日播出 / 国家地区
 *   - 筛选：剧情(类型)、年代、排序、地区（XPTV 顶部筛选栏）
 *   - 搜索：走站点 /api/search  JSON 接口
 *   - 播放：默认线路 vidsrc.mov 的取流链路（data.vidsrcme.ru）
 *     stream_urls 为 WASM(ChaCha20-IETF) 加密串，本脚本在纯 JS 内
 *     解析 wasm 数据段还原密钥并解密（无需 WebAssembly 环境），
 *     再向流主机 /generate.php 换取 IP 绑定 JWT，返回可直连 master.m3u8
 *
 * JSC 运行时内置：createCheerio / $fetch / argsify / jsonify / atob / $print
 * ---------------------------------------------------------------
 */

const cheerio = createCheerio()

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const SITE = 'https://corsflix.gd'
// vidsrc.mov 默认线路背后的流数据接口（直连即可，无需 iframe 门控 token）
const VS_API = 'https://data.vidsrcme.ru/api.php'

/* ===================== 筛选项定义 ===================== */

// 电影类型（站点 /movies 使用 TMDB 类型 ID）
const MOVIE_GENRES = [
    { n: '全部', v: '' },
    { n: '动作', v: '28' },
    { n: '冒险', v: '12' },
    { n: '动画', v: '16' },
    { n: '喜剧', v: '35' },
    { n: '犯罪', v: '80' },
    { n: '纪录', v: '99' },
    { n: '剧情', v: '18' },
    { n: '家庭', v: '10751' },
    { n: '奇幻', v: '14' },
    { n: '历史', v: '36' },
    { n: '恐怖', v: '27' },
    { n: '音乐', v: '10402' },
    { n: '悬疑', v: '9648' },
    { n: '爱情', v: '10749' },
    { n: '科幻', v: '878' },
    { n: '电视电影', v: '10770' },
    { n: '惊悚', v: '53' },
    { n: '战争', v: '10752' },
    { n: '西部', v: '37' },
]

// 剧集类型（站点 /genre/{slug}?type=tv，使用 slug）
const TV_GENRES = [
    { n: '全部', v: '' },
    { n: '动作冒险', v: 'action-adventure' },
    { n: '动画', v: 'animation' },
    { n: '喜剧', v: 'comedy' },
    { n: '犯罪', v: 'crime' },
    { n: '纪录', v: 'documentary' },
    { n: '剧情', v: 'drama' },
    { n: '家庭', v: 'family' },
    { n: '儿童', v: 'kids' },
    { n: '悬疑', v: 'mystery' },
    { n: '新闻', v: 'news' },
    { n: '真人秀', v: 'reality' },
    { n: '科幻奇幻', v: 'sci-fi-fantasy' },
    { n: '肥皂剧', v: 'soap' },
    { n: '访谈', v: 'talk' },
    { n: '战争政治', v: 'war-politics' },
    { n: '西部', v: 'western' },
]

// 年代（站点提供 1990 ~ 2026）
const YEARS = (function () {
    const arr = [{ n: '全部', v: '' }]
    for (let y = 2026; y >= 1990; y--) arr.push({ n: String(y), v: String(y) })
    return arr
})()

const MOVIE_SORT = [
    { n: '最热', v: '' },
    { n: '最受欢迎', v: 'popularity.desc' },
    { n: '评分最高', v: 'vote_average.desc' },
    { n: '最新上映', v: 'primary_release_date.desc' },
    { n: '最早上映', v: 'primary_release_date.asc' },
    { n: '票房最高', v: 'revenue.desc' },
]

const TV_SORT = [
    { n: '最热', v: '' },
    { n: '评分最高', v: 'top_rated' },
]

const TYPE_FILTER = [
    { n: '综合', v: '' },
    { n: '电影', v: 'movie' },
    { n: '剧集', v: 'tv' },
]

const MEDIA_FILTER = [
    { n: '电影', v: 'movie' },
    { n: '剧集', v: 'tv' },
]

const COUNTRIES = [
    { n: '美国', v: 'us' },
    { n: '英国', v: 'gb' },
    { n: '韩国', v: 'kr' },
    { n: '日本', v: 'jp' },
    { n: '印度', v: 'in' },
    { n: '法国', v: 'fr' },
    { n: '西班牙', v: 'es' },
    { n: '德国', v: 'de' },
    { n: '意大利', v: 'it' },
    { n: '中国', v: 'cn' },
    { n: '泰国', v: 'th' },
    { n: '土耳其', v: 'tr' },
    { n: '巴西', v: 'br' },
    { n: '墨西哥', v: 'mx' },
    { n: '俄罗斯', v: 'ru' },
    { n: '瑞典', v: 'se' },
    { n: '丹麦', v: 'dk' },
    { n: '挪威', v: 'no' },
    { n: '阿根廷', v: 'ar' },
    { n: '菲律宾', v: 'ph' },
    { n: '印尼', v: 'id' },
    { n: '尼日利亚', v: 'ng' },
    { n: '埃及', v: 'eg' },
    { n: '波兰', v: 'pl' },
]

const appConfig = {
    ver: 20260830,
    title: 'Corsflix',
    site: SITE,
    tabs: [
        { name: '热门趋势', ext: { id: 'trending' } },
        { name: '电影', ext: { id: 'movies' } },
        { name: '剧集', ext: { id: 'tv' } },
        { name: '新片上线', ext: { id: 'new' } },
        { name: '院线热映', ext: { id: 'now' } },
        { name: '即将上映', ext: { id: 'upcoming' } },
        { name: '高分榜', ext: { id: 'top' } },
        { name: '今日播出', ext: { id: 'airing' } },
        { name: '国家地区', ext: { id: 'country' } },
    ],
}

const filterList = {
    trending: [
        { key: 'type', name: '类别', value: TYPE_FILTER },
    ],
    movies: [
        { key: 'genre', name: '剧情', value: MOVIE_GENRES },
        { key: 'year', name: '年代', value: YEARS },
        { key: 'sort', name: '排序', value: MOVIE_SORT },
    ],
    tv: [
        { key: 'genre', name: '剧情', value: TV_GENRES },
        { key: 'year', name: '年代', value: YEARS },
        { key: 'sort', name: '排序', value: TV_SORT },
    ],
    top: [
        { key: 'type', name: '类别', value: TYPE_FILTER },
    ],
    country: [
        { key: 'type', name: '影视', value: MEDIA_FILTER },
        { key: 'cc', name: '地区', value: COUNTRIES },
    ],
}

/* ===================== 工具函数 ===================== */

function httpGet(url, headers) {
    return $fetch.get(url, {
        headers: Object.assign({ 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, headers || {}),
    })
}

// 卡片备注：年份 + 类型
function buildRemarks(year, badge) {
    const map = { Movie: '电影', 'TV Show': '剧集', TV: '剧集' }
    const parts = []
    if (year) parts.push(year)
    if (badge) parts.push(map[badge.trim()] || badge.trim())
    return parts.join(' · ')
}

// 解析任意列表页（站点所有列表页卡片结构一致）
function parseCards(html) {
    const cards = []
    const $ = cheerio.load(html)
    $('a.card').each((_, el) => {
        const href = $(el).attr('href') || ''
        const m = href.match(/\/(movie|tv)\/(\d+)/)
        if (!m) return
        const type = m[1]
        const id = m[2]
        const name = $(el).find('h3').first().text().trim()
        let pic = $(el).find('.card-img img').first().attr('src') || ''
        if (pic && pic.indexOf('//') === 0) pic = 'https:' + pic
        const spans = $(el).find('.card-info span')
        let year = ''
        let badge = ''
        spans.each((i, s) => {
            const t = $(s).text().trim()
            if (/^\d{4}$/.test(t)) year = t
            else if (!badge && t) badge = t
        })
        cards.push({
            vod_id: type + '-' + id,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: buildRemarks(year, badge),
            ext: {
                mt: type,
                id: id,
                url: SITE + '/' + type + '/' + id,
            },
        })
    })
    return cards
}

/* ===================== JSC 生命周期 ===================== */

async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    const id = ext.id
    const page = ext.page || 1
    const f = ext.filters || {}
    const cards = []
    try {
        let path = ''
        const qs = []
        if (id === 'trending') {
            // /trending 本身为混合榜且忽略 type；指定类型时走对应人气排序
            if (f.type === 'movie') {
                path = '/movies'
                qs.push('sort_by=popularity.desc')
            } else if (f.type === 'tv') {
                path = '/tv'
                qs.push('sort=popular')
            } else {
                path = '/trending'
            }
        } else if (id === 'movies') {
            path = '/movies'
            if (f.genre) qs.push('genre=' + f.genre)
            if (f.year) qs.push('year=' + f.year)
            if (f.sort) qs.push('sort_by=' + f.sort)
        } else if (id === 'tv') {
            // 站点 /tv 不支持组合筛选：类型与年代只能单维（类型优先）
            if (f.genre) {
                path = '/genre/' + f.genre
                qs.push('type=tv')
            } else if (f.year) {
                path = '/year/' + f.year
                qs.push('type=tv')
            } else {
                path = '/tv'
                if (f.sort) qs.push('sort=' + f.sort)
            }
        } else if (id === 'new') {
            path = '/new-releases'
        } else if (id === 'now') {
            path = '/now-playing'
        } else if (id === 'upcoming') {
            path = '/upcoming'
        } else if (id === 'top') {
            path = '/top-rated'
            if (f.type) qs.push('type=' + f.type)
        } else if (id === 'airing') {
            path = '/airing-today'
        } else if (id === 'country') {
            path = '/country/' + (f.cc || 'us')
            qs.push('type=' + (f.type || 'movie'))
        } else {
            path = '/trending'
        }
        qs.push('page=' + page)
        const url = SITE + path + '?' + qs.join('&')
        const { data } = await httpGet(url)
        cards.push.apply(cards, parseCards(data))
    } catch (e) {
        $print('corsflix getCards error: ' + e)
    }
    return jsonify({
        list: cards,
        filter: filterList[id] || [],
    })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const mt = ext.mt || ((ext.url || '').indexOf('/tv/') >= 0 ? 'tv' : 'movie')
    const id = ext.id
    let tracks = []
    const group = { title: 'vidsrc', tracks: tracks }

    if (mt === 'movie') {
        tracks.push({
            name: 'vidsrc ⭐ 高清',
            pan: '',
            ext: { mt: 'movie', id: id },
        })
        return jsonify({ list: [group] })
    }

    // 剧集：先取第 1 季页面（含全部季的下拉框），再逐季取分集
    try {
        const firstUrl = SITE + '/watch/tv/' + id + '/1/1'
        const { data: firstHtml } = await httpGet(firstUrl)
        const $ = cheerio.load(firstHtml)
        const seasons = []
        $('select option').each((_, o) => {
            const val = $(o).attr('value')
            const label = $(o).text()
            const m = label.match(/Season\s*(\d+)\s*\((\d+)\s*eps\)/)
            if (m && parseInt(m[2], 10) > 0) seasons.push(parseInt(m[1], 10))
        })
        if (seasons.length === 0) seasons.push(1)

        // 解析某一季页面里的分集
        const parseSeason = (html, sn) => {
            const out = []
            const $$ = cheerio.load(html)
            $$('a.episode-btn').each((_, a) => {
                const href = $$(a).attr('href') || ''
                const mm = href.match(new RegExp('/watch/tv/\\d+/' + sn + '/(\\d+)'))
                if (!mm) return
                const ep = parseInt(mm[1], 10)
                const title = $$(a).find('p.text-sm.font-medium').first().text().trim()
                out.push({
                    ep: ep,
                    title: title,
                })
            })
            return out
        }

        const pushEpisodes = (sn, list) => {
            list.forEach((e) => {
                tracks.push({
                    name: 'S' + String(sn).padStart(2, '0') + 'E' + String(e.ep).padStart(2, '0') + (e.title ? ' ' + e.title : ''),
                    pan: '',
                    ext: { mt: 'tv', id: id, s: sn, e: e.ep },
                })
            })
        }

        pushEpisodes(1, parseSeason(firstHtml, 1))

        // 分批并发拉取其余季（每批 6 个，避免一次性并发过多）
        const rest = seasons.filter((s) => s !== 1).sort((a, b) => a - b)
        for (let i = 0; i < rest.length; i += 6) {
            const batch = rest.slice(i, i + 6)
            const results = await Promise.all(
                batch.map((sn) =>
                    httpGet(SITE + '/watch/tv/' + id + '/' + sn + '/1')
                        .then((r) => ({ sn: sn, html: r.data }))
                        .catch(() => null)
                )
            )
            // 保持季顺序
            results.forEach((r) => {
                if (r) pushEpisodes(r.sn, parseSeason(r.html, r.sn))
            })
        }

        // 按 季/集 排序
        tracks.sort((a, b) => {
            const ka = a.ext.s * 100000 + a.ext.e
            const kb = b.ext.s * 100000 + b.ext.e
            return ka - kb
        })

        if (tracks.length === 0) {
            // 兜底：至少给第 1 季第 1 集
            tracks.push({ name: 'S01E01', pan: '', ext: { mt: 'tv', id: id, s: 1, e: 1 } })
        }
    } catch (e) {
        $print('corsflix getTracks error: ' + e)
        tracks.push({ name: 'S01E01', pan: '', ext: { mt: 'tv', id: id, s: 1, e: 1 } })
    }

    return jsonify({ list: [group] })
}

async function search(ext) {
    ext = argsify(ext)
    const cards = []
    const text = encodeURIComponent(ext.text)
    const page = ext.page || 1
    try {
        if (page > 1) return jsonify({ list: cards }) // 站点搜索接口单页返回
        const { data } = await httpGet(SITE + '/api/search?q=' + text)
        const j = argsify(data)
        const results = j.results || []
        results.forEach((i) => {
            const type = i.media_type === 'tv' ? 'tv' : 'movie'
            const name = i.title || i.name || ''
            const date = i.release_date || i.first_air_date || ''
            const year = date ? String(date).substring(0, 4) : ''
            const pic = i.poster_path ? 'https://image.tmdb.org/t/p/w342' + i.poster_path : ''
            const rating = i.vote_average ? ' ★' + Number(i.vote_average).toFixed(1) : ''
            cards.push({
                vod_id: type + '-' + i.id,
                vod_name: name,
                vod_pic: pic,
                vod_remarks: buildRemarks(year, type === 'tv' ? 'TV Show' : 'Movie') + rating,
                ext: {
                    mt: type,
                    id: String(i.id),
                    url: SITE + '/' + type + '/' + i.id,
                },
            })
        })
    } catch (e) {
        $print('corsflix search error: ' + e)
    }
    return jsonify({ list: cards })
}

/* =====================================================================
 * 播放解析：vidsrc.mov -> data.vidsrcme.ru 加密流 -> 直连 m3u8
 * ===================================================================== */

function b64ToBytes(b64) {
    const bin = atob(b64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i) & 0xff
    return arr
}

function rd32(bytes, off) {
    return (
        (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0
    )
}

function rotl32(x, n) {
    return ((x << n) | (x >>> (32 - n))) >>> 0
}

// 单块 ChaCha20 (IETF: counter 1 word + nonce 3 words)，输出 64 字节 keystream
function chachaBlock(keyWords, counter, nonceWords) {
    const st = [
        1634760805, 857760878, 2036477234, 1797285236,
        keyWords[0], keyWords[1], keyWords[2], keyWords[3],
        keyWords[4], keyWords[5], keyWords[6], keyWords[7],
        counter >>> 0, nonceWords[0] >>> 0, nonceWords[1] >>> 0, nonceWords[2] >>> 0,
    ]
    const x = st.slice()
    const qr = (a, b, c, d) => {
        x[a] = (x[a] + x[b]) >>> 0; x[d] = rotl32(x[d] ^ x[a], 16)
        x[c] = (x[c] + x[d]) >>> 0; x[b] = rotl32(x[b] ^ x[c], 12)
        x[a] = (x[a] + x[b]) >>> 0; x[d] = rotl32(x[d] ^ x[a], 8)
        x[c] = (x[c] + x[d]) >>> 0; x[b] = rotl32(x[b] ^ x[c], 7)
    }
    for (let i = 0; i < 10; i++) {
        qr(0, 4, 8, 12); qr(1, 5, 9, 13); qr(2, 6, 10, 14); qr(3, 7, 11, 15)
        qr(0, 5, 10, 15); qr(1, 6, 11, 12); qr(2, 7, 8, 13); qr(3, 4, 9, 14)
    }
    const out = new Uint8Array(64)
    for (let i = 0; i < 16; i++) {
        const w = (x[i] + st[i]) >>> 0
        out[i * 4] = w & 0xff
        out[i * 4 + 1] = (w >>> 8) & 0xff
        out[i * 4 + 2] = (w >>> 16) & 0xff
        out[i * 4 + 3] = (w >>> 24) & 0xff
    }
    return out
}

// LEB128 无符号解码，返回 [value, nextPos]
function leb128(bytes, p) {
    let r = 0
    let s = 0
    do {
        const b = bytes[p++]
        r |= (b & 0x7f) << s
        if ((b & 0x80) === 0) break
        s += 7
    } while (true)
    return [r >>> 0, p]
}

// 字符串转字节。JSC 桥接通常按 latin1/binary 逐字节保留（与 atob/charCodeAt
// 解二进制的既有爬虫一致）；若运行时按 UTF-8 解码，则用 UTF-8 重编码还原。
function textToBytes(wasmText, utf8) {
    if (utf8) {
        const bin = unescape(encodeURIComponent(wasmText))
        const b = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i) & 0xff
        return b
    }
    const bytes = new Uint8Array(wasmText.length)
    for (let i = 0; i < wasmText.length; i++) bytes[i] = wasmText.charCodeAt(i) & 0xff
    return bytes
}

// 解析 wasm 二进制中的全部活动数据段 -> [{off, bytes}]
function parseWasmDataSegments(bytes) {
    const segs = []
    let p = 8 // 魔数 4 + 版本 4
    while (p < bytes.length) {
        const sid = bytes[p++]
        let r
        ;[r, p] = leb128(bytes, p)
        const end = p + r
        if (sid === 11) {
            // Data section
            let cnt
            ;[cnt, p] = leb128(bytes, p)
            for (let k = 0; k < cnt; k++) {
                let flags
                ;[flags, p] = leb128(bytes, p)
                let off = -1
                if (flags === 0 || flags === 1) {
                    if (flags === 1) { let mi; ;[mi, p] = leb128(bytes, p) }
                    if (bytes[p] === 0x41) {
                        p++
                        ;[off, p] = leb128(bytes, p)
                    }
                    if (bytes[p] === 0x0b) p++ // end of init expr
                }
                let ln
                ;[ln, p] = leb128(bytes, p)
                const data = bytes.slice(p, p + ln)
                p += ln
                if (off >= 0) segs.push({ off: off, data: data })
            }
        }
        p = end
    }
    return segs
}

// 从 wasm 数据段还原 ChaCha20 密钥字（密钥 = 偏移0段 XOR 候选段，按能否解出 'http' 自校验）
function recoverKeyWords(wasmText, enc) {
    // 两种字节解码各试一次，自校验通过即采用
    const tryRecover = (bytes) => {
        const segs = parseWasmDataSegments(bytes)
        return matchKeyFromSegments(segs, enc)
    }
    let kw = tryRecover(textToBytes(wasmText, false))
    if (kw) return kw
    try {
        kw = tryRecover(textToBytes(wasmText, true))
    } catch (e) {}
    return kw
}

function matchKeyFromSegments(segs, enc) {
    const base = segs.find((s) => s.off === 0)
    if (!base || base.data.length < 32) return null
    const nonce = [rd32(enc, 0), rd32(enc, 4), rd32(enc, 8)]
    const magic = [0x68, 0x74, 0x74, 0x70] // 'http'
    const candidates = segs.filter((s) => s.off >= 256 && s.data.length >= 32)
    for (let c = 0; c < candidates.length; c++) {
        const seg = candidates[c].data
        const kw = []
        for (let i = 0; i < 8; i++) kw.push((rd32(base.data, i * 4) ^ rd32(seg, i * 4)) >>> 0)
        const ks = chachaBlock(kw, 0, nonce)
        let ok = true
        for (let j = 0; j < 4; j++) {
            if (((enc[12 + j] ^ ks[j]) & 0xff) !== magic[j]) { ok = false; break }
        }
        if (ok) return kw
    }
    return null
}

function chachaDecrypt(keyWords, enc) {
    const nonce = [rd32(enc, 0), rd32(enc, 4), rd32(enc, 8)]
    const ct = enc.slice(12)
    const out = new Uint8Array(ct.length)
    const blocks = Math.ceil(ct.length / 64)
    for (let b = 0; b < blocks; b++) {
        const ks = chachaBlock(keyWords, b, nonce)
        for (let j = 0; j < 64 && b * 64 + j < ct.length; j++) {
            out[b * 64 + j] = ct[b * 64 + j] ^ ks[j]
        }
    }
    // Uint8Array -> binary string -> utf8
    let bin = ''
    const CHUNK = 8192
    for (let i = 0; i < out.length; i += CHUNK) bin += String.fromCharCode.apply(null, out.subarray(i, i + CHUNK))
    try {
        return decodeURIComponent(escape(bin))
    } catch (e) {
        return bin
    }
}

// 向流主机换取 JWT（兼容纯文本 / {"token":...} 两种返回）
async function fetchHostToken(origin) {
    try {
        const { data } = await httpGet(origin + '/generate.php')
        const t = (data || '').trim()
        if (!t) return ''
        if (t.charAt(0) === '{') {
            try {
                const j = argsify(t)
                return j.token || j.data || j.result || ''
            } catch (e) {}
        }
        return t
    } catch (e) {
        return ''
    }
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const mt = ext.mt || 'movie'
    let api = VS_API + '?type=' + mt + '&tmdb=' + ext.id + '&stream_urls'
    if (mt === 'tv') api = VS_API + '?type=tv&tmdb=' + ext.id + '&season=' + ext.s + '&episode=' + ext.e + '&stream_urls'

    const { data: apiText } = await httpGet(api, { accept: 'application/json' })
    const j = argsify(apiText)
    let urls = []
    const su = j && j.data ? j.data.stream_urls : null

    if (Array.isArray(su)) {
        urls = su
    } else if (typeof su === 'string' && su.length > 0) {
        const enc = b64ToBytes(su)
        if (j.vs && j.vs.wasm_url) {
            const { data: wasmText } = await httpGet(j.vs.wasm_url)
            const keyWords = recoverKeyWords(wasmText, enc)
            if (!keyWords) {
                $print('corsflix: chacha key recover failed')
                return jsonify({ urls: [] })
            }
            const plain = chachaDecrypt(keyWords, enc)
            urls = plain.split('\n').filter((u) => u)
        }
    }

    // 逐个主机：换 token -> 校验 master.m3u8，取第一个可用
    for (let i = 0; i < urls.length; i++) {
        const u = urls[i]
        const mm = u.match(/^(https?:\/\/[^/]+)/)
        if (!mm) continue
        const origin = mm[1]
        try {
            const token = await fetchHostToken(origin)
            if (!token) continue
            const finalUrl = u + (u.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token)
            const { data: head } = await $fetch.get(finalUrl, {
                headers: { 'User-Agent': UA },
            })
            if (head && head.indexOf('#EXTM3U') === 0) {
                return jsonify({
                    urls: [finalUrl],
                    headers: [{ 'User-Agent': UA }],
                })
            }
        } catch (e) {
            $print('corsflix host try failed: ' + origin + ' ' + e)
        }
    }
    // 全部校验失败时兜底返回最后一条（带 token 若能取到）
    if (urls.length) {
        const mm = urls[urls.length - 1].match(/^(https?:\/\/[^/]+)/)
        if (mm) {
            const token = await fetchHostToken(mm[1])
            if (token) {
                return jsonify({
                    urls: [urls[urls.length - 1] + '?token=' + encodeURIComponent(token)],
                    headers: [{ 'User-Agent': UA }],
                })
            }
        }
    }
    return jsonify({ urls: [] })
}
