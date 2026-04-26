/**
 * XPTV Extension - Cineby  v3.0
 * https://www.cineby.sc
 *
 * ✅ Fix 1: 图像 — poster_path 正确拼接 media.themoviedb.org
 * ✅ Fix 2: 播放 — 内联 vidsrc.net 完整解密链（RCP → PRORCP → whisperingauroras key → 12算法解密）
 */

const cheerio = createCheerio()

/* ─── 常量 ────────────────────────────────────────────────────── */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'

const BASE      = 'https://www.cineby.sc'
const DB_BASE   = 'https://db.videasy.net/3'
// ★ Fix 1: 改用 media.themoviedb.org（更稳定）
const IMG_BASE  = 'https://media.themoviedb.org/t/p'
// vidsrc 解密链入口
const VSRC_BASE = 'https://vidsrc.net'

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
    { n:'Popular',   v:'popularity.desc'  },
    { n:'Top Rated', v:'vote_average.desc' },
    { n:'Latest',    v:'release_date.desc' },
]
const TABS = [
    { name:'🎬 Movies',    ext:{ kind:MEDIA.MOVIE, sort_by:'popularity.desc',  page:1 } },
    { name:'📺 TV Shows',  ext:{ kind:MEDIA.TV,    sort_by:'popularity.desc',  page:1 } },
    { name:'⭐ Top Movies', ext:{ kind:MEDIA.MOVIE, sort_by:'vote_average.desc', page:1 } },
    { name:'🏆 Top TV',    ext:{ kind:MEDIA.TV,    sort_by:'vote_average.desc', page:1 } },
]
const appConfig = { ver:1, title:'Cineby', site:BASE, tabs:TABS }

/* ─── 工具 ────────────────────────────────────────────────────── */
function tidy(t) { return String(t||'').replace(/\s+/g,' ').trim() }

// ★ Fix 1: 图像拼接修正
function toImg(path, size) {
    const p = tidy(path)
    if (!p || p === 'null') return ''
    if (/^https?:\/\//i.test(p)) return p
    // poster_path 返回 "/xxxxxxx.jpg" 需要去掉开头斜线再拼接
    const clean = p.startsWith('/') ? p : '/' + p
    return `${IMG_BASE}/${size || 'w342'}${clean}`
}

function pickYear(item) {
    const m = String(item.release_date||item.first_air_date||'').match(/\d{4}/)
    return m ? m[0] : ''
}
function pickTitle(item, kind) {
    return tidy(kind===MEDIA.TV
        ? (item.name||item.original_name)
        : (item.title||item.original_title))
}
function pickGenres(item, kind) {
    const t = kind===MEDIA.TV ? TV_GENRES : MOVIE_GENRES
    return (item.genre_ids||[]).map(id => t[id]||'').filter(Boolean)
}
function buildRemark(item, kind) {
    const parts = []
    const year   = pickYear(item)
    const score  = item.vote_average ? Number(item.vote_average).toFixed(1) : ''
    const genres = pickGenres(item, kind)
    if (year)  parts.push(year)
    if (score && score!=='0.0') parts.push('⭐'+score)
    if (genres.length) parts.push(genres.slice(0,2).join('/'))
    return parts.join(' · ')
}
function makeVodId(kind,id) { return `${kind}:${id}` }
function parseVodId(s) {
    const p = tidy(s).split(':')
    return p.length===2 ? {kind:p[0], id:parseInt(p[1],10)||0} : {kind:'',id:0}
}
function mapCard(item, kind) {
    const id    = item.id||0
    const title = pickTitle(item, kind)
    if (!id||!title) return null
    return {
        vod_id:      makeVodId(kind,id),
        vod_name:    title,
        vod_pic:     toImg(item.poster_path, 'w342'),
        vod_remarks: buildRemark(item, kind),
        ext: { kind, id, title, year:pickYear(item) },
    }
}
function buildQuery(p) {
    return Object.keys(p)
        .filter(k => p[k]!==undefined && p[k]!==null && p[k]!=='')
        .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(p[k])}`)
        .join('&')
}
async function fetchJson(url, params) {
    const qs = buildQuery(params||{})
    const { data } = await $fetch.get(qs ? `${url}?${qs}` : url, { headers:HEADERS })
    return typeof data==='string' ? JSON.parse(data) : data
}
function buildFilters(ext) {
    const genres = ext.kind===MEDIA.TV ? TV_GENRES : MOVIE_GENRES
    const gv = [{ n:'All', v:'' }].concat(Object.keys(genres).map(id => ({ n:genres[id], v:id })))
    return [
        { key:'sort_by', name:'Sort',  init:'popularity.desc', value:SORT_OPTIONS },
        { key:'genre',   name:'Genre', init:'',                value:gv },
    ]
}
function normalizeExt(ext) {
    const n = argsify(ext)
    n.kind    = n.kind    || MEDIA.MOVIE
    n.page    = parseInt(n.page||'1',10)||1
    n.sort_by = n.sort_by || (n.filters&&n.filters.sort_by) || 'popularity.desc'
    n.genre   = n.genre   || (n.filters&&n.filters.genre)   || ''
    return n
}

/* ═══════════════════════════════════════════════════════════════
   1. getConfig
═══════════════════════════════════════════════════════════════ */
async function getConfig() { return jsonify(appConfig) }

/* ═══════════════════════════════════════════════════════════════
   2. getCards
═══════════════════════════════════════════════════════════════ */
async function getCards(ext) {
    ext = normalizeExt(ext)
    const params = {
        page: ext.page, language:'en',
        with_original_language:'en', sort_by:ext.sort_by,
    }
    if (ext.genre) params.with_genres = ext.genre
    const ep = `${DB_BASE}/discover/${ext.kind===MEDIA.TV?'tv':'movie'}`
    let json = { results:[], total_pages:1 }
    let list = []
    try {
        json = await fetchJson(ep, params)
        list = (json.results||[]).map(item => mapCard(item,ext.kind)).filter(Boolean)
    } catch(e) { $print('getCards:'+e) }
    return jsonify({
        list, hasMore: ext.page < (json.total_pages||1),
        ext: { ...ext, page:ext.page+1 },
        filter: buildFilters(ext),
    })
}

/* ═══════════════════════════════════════════════════════════════
   3. getTracks
═══════════════════════════════════════════════════════════════ */
async function getMovieTracks(id) {
    const j     = await fetchJson(`${DB_BASE}/movie/${id}`, { append_to_response:'external_ids', language:'en' })
    const title = tidy(j.title||j.original_title||'')
    const year  = pickYear(j)
    return { list:[{
        title: title||'Movie',
        tracks:[{ name: year ? `${title} (${year})` : title||'Play', pan:'',
            ext:{ kind:MEDIA.MOVIE, id:j.id, tmdbId:j.id,
                  imdbId:(j.external_ids&&j.external_ids.imdb_id)||'', title, year } }],
    }] }
}
async function getTvTracks(id) {
    const d     = await fetchJson(`${DB_BASE}/tv/${id}`, { append_to_response:'external_ids', language:'en' })
    const title = tidy(d.name||d.original_name||'')
    const year  = pickYear(d)
    const total = d.number_of_seasons||0
    const imdb  = (d.external_ids&&d.external_ids.imdb_id)||''
    const groups= []
    for (let s=1; s<=total; s++) {
        let season
        try { season = await fetchJson(`${DB_BASE}/tv/${id}/season/${s}`, { language:'en' }) }
        catch(e) { $print(`season ${s}:${e}`); continue }
        const eps = (season.episodes||[]).map(ep => ({
            name: ep.name ? `E${ep.episode_number} ${tidy(ep.name)}` : `Episode ${ep.episode_number}`,
            pan: '',
            ext:{ kind:MEDIA.TV, id, tmdbId:id, imdbId:imdb, title, year,
                  seasonId:season.season_number, episodeId:ep.episode_number, totalSeasons:total },
        }))
        if (eps.length) groups.push({ title:season.name||`Season ${s}`, tracks:eps })
    }
    return { list:groups }
}
async function getTracks(ext) {
    ext = argsify(ext)
    let kind = ext.kind, id = parseInt(ext.id||'0',10)
    if ((!kind||!id) && ext.vod_id) {
        const p = parseVodId(ext.vod_id); kind=kind||p.kind; id=id||p.id
    }
    try {
        if (kind===MEDIA.MOVIE) return jsonify(await getMovieTracks(id))
        if (kind===MEDIA.TV)    return jsonify(await getTvTracks(id))
    } catch(e) { $print('getTracks:'+e) }
    return jsonify({ list:[] })
}

/* ═══════════════════════════════════════════════════════════════
   4. getPlayinfo  ★ 完整 vidsrc.net 解密链
   
   流程（完全基于公开 HTTP 请求，无需 wasm/内存读取）：
   Step 1: GET vidsrc.net/embed/movie?tmdb=ID  （或 tv?tmdb=...&season=...&episode=...）
           → 解析 .serversList .server[data-hash] 获取所有 server hash
           → 同时得到 BASEDOM（iframe src 的域名）
   Step 2: 对每个 hash 请求 {BASEDOM}/rcp/v{n}/{hash}
           → 从返回 HTML 里用 /src:\s*'([^']*)'/  提取 RCP src
   Step 3: 判断 RCP src 前缀
           - 以 "https://whispering" 开头 → 直接解密
           - 以 "/prorcp/" 开头 → 访问 PRORCP 页面 → 解析 JS 文件 → 提取解密 key+函数名 → 解密
   Step 4: 解密函数（12种算法，根据 funcName 路由）
           最终得到真实 m3u8 URL
═══════════════════════════════════════════════════════════════ */

// ── Decoder: 12种算法 ─────────────────────────────────────────
function b64decode(s) {
    s = s.replace(/-/g,'+').replace(/_/g,'/')
    while (s.length % 4) s += '='
    try {
        // XPTV 环境提供 atob
        const bin = atob(s)
        let out = ''
        for (let i=0; i<bin.length; i++) out += bin[i]
        return out
    } catch(e) {
        // fallback: 纯 JS base64 decode
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
        let result = '', buf = 0, bufLen = 0
        for (let i=0; i<s.length; i++) {
            const c = chars.indexOf(s[i])
            if (c === 64) break
            buf = (buf << 6) | c; bufLen += 6
            if (bufLen >= 8) { bufLen -= 8; result += String.fromCharCode((buf >> bufLen) & 0xFF) }
        }
        return result
    }
}

function hexToStr(hex) {
    let r = ''
    for (let i=0; i<hex.length; i+=2) r += String.fromCharCode(parseInt(hex.substr(i,2),16))
    return r
}

function strReverse(s) { return s.split('').reverse().join('') }

function xorStr(data, key) {
    let r = ''
    for (let i=0; i<data.length; i++) r += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length))
    return r
}

function rot13(s) {
    return s.replace(/[a-zA-Z]/g, c => {
        const base = c <= 'Z' ? 65 : 97
        return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base)
    })
}

// 12 解密算法
const DECODERS = {
    LXVUMCoAHJ(data) {
        const rev = strReverse(data)
        const dec = b64decode(rev)
        let r = ''
        for (let i=0; i<dec.length; i++) r += String.fromCharCode(dec.charCodeAt(i) - 3)
        return r
    },
    GuxKGDsA2T(data) {
        const rev = strReverse(data)
        const dec = b64decode(rev)
        let r = ''
        for (let i=0; i<dec.length; i++) r += String.fromCharCode(dec.charCodeAt(i) - 7)
        return r
    },
    laM1dAi3vO(data) {
        const rev = strReverse(data)
        const dec = b64decode(rev)
        let r = ''
        for (let i=0; i<dec.length; i++) r += String.fromCharCode(dec.charCodeAt(i) - 5)
        return r
    },
    Iry9MQXnLs(data, key) {
        const hex = strReverse(data)
        const decoded = hexToStr(hex)
        const xored = xorStr(decoded, key||'')
        let r = ''
        for (let i=0; i<xored.length; i++) r += String.fromCharCode(xored.charCodeAt(i) - 3)
        return b64decode(r)
    },
    C66jPHx8qu(data, key) {
        const rev = strReverse(data)
        const hex = hexToStr(rev)
        return xorStr(hex, key||'')
    },
    detdj7JHiK(data, key) {
        const sliced = data.slice(2)
        const dec = b64decode(sliced)
        return xorStr(dec, (key||'').repeat(Math.ceil(dec.length / (key||'x').length)))
    },
    nZlUnj2VSo(data) {
        const map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
        let r = ''
        for (let i=0; i<data.length; i++) {
            const idx = map.indexOf(data[i])
            r += idx >= 0 ? map[(idx + 13) % 64] : data[i]
        }
        return r
    },
    IGLImMhWrI(data) {
        const rev  = strReverse(data)
        const r13  = rot13(rev)
        const rev2 = strReverse(r13)
        return b64decode(rev2)
    },
    GTAxQyTyBx(data) {
        const rev = strReverse(data)
        let even = ''
        for (let i=0; i<rev.length; i++) { if (i%2===0) even += rev[i] }
        return b64decode(even)
    },
    MyL1IRSfHe(data) {
        const rev = strReverse(data)
        let shifted = ''
        for (let i=0; i<rev.length; i++) shifted += String.fromCharCode(rev.charCodeAt(i) - 3)
        return hexToStr(shifted)
    },
}

function decrypt(funcName, data, key) {
    $print(`decrypt funcName=${funcName} keyLen=${(key||'').length}`)
    const fn = DECODERS[funcName]
    if (!fn) {
        $print('unknown decoder: ' + funcName)
        return ''
    }
    try { return fn(data, key) } catch(e) { $print('decrypt error:'+e); return '' }
}

// ── vidsrc.net 提取器 ─────────────────────────────────────────
async function vsrcFetch(url, referer) {
    const h = {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': referer || VSRC_BASE + '/',
    }
    try {
        const { data } = await $fetch.get(url, { headers:h })
        return typeof data==='string' ? data : ''
    } catch(e) { $print('vsrcFetch err '+url+': '+e); return '' }
}

// Step 1: 加载 embed 页，提取 servers 列表 + baseDom
async function vsrcLoadServers(tmdbId, kind, season, episode) {
    let embedUrl
    if (kind === MEDIA.MOVIE) {
        embedUrl = `${VSRC_BASE}/embed/movie?tmdb=${tmdbId}`
    } else {
        embedUrl = `${VSRC_BASE}/embed/tv?tmdb=${tmdbId}&season=${season||1}&episode=${episode||1}`
    }
    const html = await vsrcFetch(embedUrl, BASE+'/')
    if (!html) return { baseDom:'', servers:[] }

    const $ = cheerio.load(html)

    // 从 iframe src 提取 baseDom
    let baseDom = ''
    $('iframe[src]').each((_, el) => {
        const src = $(el).attr('src') || ''
        const m = src.match(/^(https?:\/\/[^/]+)/)
        if (m && !baseDom) baseDom = m[1]
    })
    if (!baseDom) baseDom = VSRC_BASE  // fallback

    // 提取 server hash 列表
    const servers = []
    $('.serversList .server[data-hash]').each((_, el) => {
        const hash = $(el).attr('data-hash') || ''
        const name = $(el).text().trim()
        if (hash) servers.push({ hash, name })
    })
    $print(`vsrcLoadServers: baseDom=${baseDom} servers=${servers.length}`)
    return { baseDom, servers }
}

// Step 2: 获取 RCP 数据
async function vsrcRcp(baseDom, hash) {
    // 尝试不同版本号
    for (const v of ['v1','v2','v3','']) {
        const url = v
            ? `${baseDom}/rcp/${v}/${hash}`
            : `${baseDom}/rcp/${hash}`
        const html = await vsrcFetch(url, baseDom+'/')
        if (!html) continue
        // 提取 src: 'xxx' 模式
        const m = html.match(/src:\s*'([^']+)'/)
        if (m && m[1]) {
            $print(`vsrcRcp found src via ${url}`)
            return { src: m[1], html }
        }
    }
    return null
}

// Step 3a: PRORCP 解密流程
async function vsrcProrcp(proRcpUrl, baseDom) {
    const fullUrl = proRcpUrl.startsWith('http') ? proRcpUrl : baseDom + proRcpUrl
    const html    = await vsrcFetch(fullUrl, baseDom+'/')
    if (!html) return ''

    const $ = cheerio.load(html)

    // 找最新的 JS 文件（排除 cpt.js）
    let jsFile = ''
    $('script[src]').each((_, el) => {
        const src = $(el).attr('src') || ''
        if (!src.includes('cpt.js') && src.endsWith('.js')) jsFile = src
    })
    if (!jsFile) {
        $print('prorcp: no js file found')
        return ''
    }
    const jsUrl  = jsFile.startsWith('http') ? jsFile : baseDom + jsFile
    const jsCode = await vsrcFetch(jsUrl, fullUrl)
    if (!jsCode) return ''

    // 提取解密函数名和 key：/{}\}window\[([^"]+)\("([^"]+)"\)/
    const re = /\{\}\}window\[([^"]+)\("([^"]+)"\)/
    const m  = jsCode.match(re)
    if (!m) {
        $print('prorcp: regex no match')
        return ''
    }
    const funcName = m[1]
    const keyEnc   = m[2]

    // 从页面找 加密后的内容 element（用 decrypted key 作为 element id）
    const key      = decrypt(funcName, keyEnc, '')
    const $html    = cheerio.load(html)
    const encData  = $html('#'+key).text().trim() || $html(`[id="${key}"]`).text().trim()
    if (!encData) {
        $print('prorcp: no encrypted data element id=' + key)
        return ''
    }
    return decrypt(funcName, encData, key)
}

// 主提取器：返回 { url, referer }
async function vsrcExtract(tmdbId, kind, season, episode) {
    const { baseDom, servers } = await vsrcLoadServers(tmdbId, kind, season, episode)
    if (!servers.length) {
        $print('vsrcExtract: no servers')
        return { url:'', referer:'' }
    }

    for (const srv of servers) {
        $print(`vsrcExtract: trying server ${srv.name} hash=${srv.hash}`)
        const rcp = await vsrcRcp(baseDom, srv.hash)
        if (!rcp || !rcp.src) continue

        let streamUrl = ''

        if (rcp.src.startsWith('https://whisperingauroras') || rcp.src.startsWith('//whisperingauroras')) {
            // 直接是加密 url，需要进一步解析
            const waUrl = rcp.src.startsWith('//') ? 'https:'+rcp.src : rcp.src
            const waHtml = await vsrcFetch(waUrl, baseDom+'/')
            if (waHtml) {
                // 在页面里找直接的 m3u8
                const dm = waHtml.match(/["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)["'`]/i)
                if (dm) streamUrl = dm[1]
            }
        } else if (rcp.src.startsWith('/prorcp/') || rcp.src.includes('prorcp')) {
            streamUrl = await vsrcProrcp(rcp.src, baseDom)
        } else if (rcp.src.startsWith('http')) {
            // 可能直接就是 m3u8
            if (rcp.src.includes('.m3u8')) {
                streamUrl = rcp.src
            } else {
                // 跟进页面
                const followHtml = await vsrcFetch(rcp.src, baseDom+'/')
                if (followHtml) {
                    const fm = followHtml.match(/["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)["'`]/i)
                    if (fm) streamUrl = fm[1]
                }
            }
        }

        if (streamUrl && streamUrl.startsWith('http')) {
            $print('vsrcExtract: got stream ' + streamUrl.slice(0,60))
            return { url:streamUrl, referer:baseDom+'/' }
        }
    }
    return { url:'', referer:'' }
}

/* ── getPlayinfo ─────────────────────────────────────────────── */
async function getPlayinfo(ext) {
    ext = argsify(ext)

    if (ext.directUrl) {
        return jsonify({ urls:[ext.directUrl], headers:[{ 'User-Agent':UA, Referer:BASE+'/' }] })
    }

    const tmdbId   = ext.tmdbId  || ext.id
    const kind     = ext.kind
    const seasonId = ext.seasonId  || 1
    const epId     = ext.episodeId || 1

    if (!tmdbId || !kind) {
        $utils.toastError('Missing tmdbId')
        return jsonify({ urls:[''], headers:[{}] })
    }

    $print(`getPlayinfo: kind=${kind} tmdbId=${tmdbId} s=${seasonId} e=${epId}`)

    // 主线：vidsrc.net 完整解密链
    let result = await vsrcExtract(tmdbId, kind, seasonId, epId)

    // 降级1：vidsrc.me（旧版 API，有时仍可用）
    if (!result.url) {
        $print('fallback: vidsrc.me')
        try {
            let meUrl
            if (kind === MEDIA.MOVIE) {
                meUrl = `https://vidsrc.me/embed/movie?tmdb=${tmdbId}`
            } else {
                meUrl = `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${seasonId}&episode=${epId}`
            }
            const meHtml = await vsrcFetch(meUrl, BASE+'/')
            if (meHtml) {
                const mm = meHtml.match(/["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)["'`]/i)
                if (mm) result = { url:mm[1], referer:'https://vidsrc.me/' }
            }
        } catch(e) { $print('vidsrc.me fallback: '+e) }
    }

    // 降级2：vidsrc.cc embed（最简单，直接尝试 HTML 提取）
    if (!result.url) {
        $print('fallback: vidsrc.cc')
        try {
            let ccUrl
            if (kind === MEDIA.MOVIE) {
                ccUrl = `https://vidsrc.cc/v2/embed/movie/${tmdbId}`
            } else {
                ccUrl = `https://vidsrc.cc/v2/embed/tv/${tmdbId}?season=${seasonId}&episode=${epId}`
            }
            const ccHtml = await vsrcFetch(ccUrl, BASE+'/')
            if (ccHtml) {
                const cm = ccHtml.match(/["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)["'`]/i)
                if (cm) result = { url:cm[1], referer:'https://vidsrc.cc/' }
            }
        } catch(e) { $print('vidsrc.cc fallback: '+e) }
    }

    if (!result.url) {
        $utils.toastError('All sources failed. Try a proxy.')
        return jsonify({ urls:[''], headers:[{ 'User-Agent':UA, Referer:BASE+'/' }] })
    }

    return jsonify({
        urls:    [result.url],
        headers: [{ 'User-Agent':UA, Referer:result.referer }],
    })
}

/* ═══════════════════════════════════════════════════════════════
   5. search
═══════════════════════════════════════════════════════════════ */
async function search(ext) {
    ext = argsify(ext)
    const kw   = tidy(ext.text||'')
    const page = parseInt(ext.page||'1',10)||1
    if (!kw) return jsonify({ list:[] })
    let json = { results:[] }, list = []
    try {
        json = await fetchJson(`${DB_BASE}/search/multi`, {
            query:kw, page, language:'en', include_adult:'false',
        })
        list = (json.results||[])
            .filter(i => i.media_type===MEDIA.MOVIE || i.media_type===MEDIA.TV)
            .map(i => mapCard(i, i.media_type)).filter(Boolean)
    } catch(e) { $print('search:'+e) }
    return jsonify({ list, hasMore:page<(json.total_pages||1), ext:{ text:kw, page:page+1 } })
}
