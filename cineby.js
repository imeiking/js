/**
 * XPTV Extension — Cineby  v3.0
 * https://www.cineby.sc
 *
 * Fix 1 — 图片：db.videasy.net 返回的 poster_path 要拼接
 *          https://media.themoviedb.org/t/p/w342{path}
 *          （不是 image.tmdb.org，两者不同）
 *
 * Fix 2 — 播放：所有 embed 播放器均为纯 JS SPA，iframe HTML
 *          里没有 m3u8。改用各服务公开的后端 JSON API：
 *          vidlink  → https://vidlink.pro/api/b/movie/{id}
 *                     https://vidlink.pro/api/b/tv/{id}?multiLang=1&s={s}&e={e}
 *          vidsrc   → https://vidsrc.cc/v2/api/stream/movie?videoId={tmdb}
 *                     https://vidsrc.cc/v2/api/stream/tv?videoId={tmdb}&s={s}&e={e}
 *          autoembed→ https://autoembed.co/api/getVideoSource?type=movie&id={imdb}
 *          取到的 url 字段即为可直接播放的 m3u8
 */

const cheerio = createCheerio()

/* ─── 常量 ──────────────────────────────────────────────────── */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'

const BASE    = 'https://www.cineby.sc'
const DB_BASE = 'https://db.videasy.net/3'

// ★ Fix1：封面图使用 media.themoviedb.org（videasy 自己用的域名）
const IMG_BASE = 'https://media.themoviedb.org/t/p'

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
    27:'Horror',10402:'Music',9648:'Mystery',10749:'Romance',878:'Sci-Fi',
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

/* ─── 工具 ──────────────────────────────────────────────────── */
function tidy(t){ return String(t||'').replace(/\s+/g,' ').trim() }

// ★ Fix1 核心：用 media.themoviedb.org 拼图片
function toImg(path, size){
    const p = tidy(path)
    if(!p) return ''
    if(/^https?:\/\//i.test(p)) return p
    // path 已含前导 /，拼接即可
    return `${IMG_BASE}/${size}${p}`
}

function pickYear(item){
    const m = String(item.release_date||item.first_air_date||'').match(/\d{4}/)
    return m ? m[0] : ''
}
function pickTitle(item, kind){
    return tidy(kind===MEDIA.TV
        ? (item.name||item.original_name)
        : (item.title||item.original_title))
}
function pickGenres(item, kind){
    const t = kind===MEDIA.TV ? TV_GENRES : MOVIE_GENRES
    return (item.genre_ids||[]).map(id=>t[id]||'').filter(Boolean)
}
function buildRemark(item, kind){
    const parts=[]
    const year  = pickYear(item)
    const score = item.vote_average ? Number(item.vote_average).toFixed(1) : ''
    const gs    = pickGenres(item, kind)
    if(year)  parts.push(year)
    if(score && score!=='0.0') parts.push('⭐'+score)
    if(gs.length) parts.push(gs.slice(0,2).join('/'))
    return parts.join(' · ')
}
function makeVodId(kind,id){ return `${kind}:${id}` }
function parseVodId(v){
    const p=tidy(v).split(':')
    return p.length===2?{kind:p[0],id:parseInt(p[1],10)||0}:{kind:'',id:0}
}
function mapCard(item, kind){
    const id=item.id||0
    const title=pickTitle(item,kind)
    if(!id||!title) return null
    return {
        vod_id:      makeVodId(kind,id),
        vod_name:    title,
        vod_pic:     toImg(item.poster_path,'w342'),   // ★ Fix1
        vod_remarks: buildRemark(item,kind),
        ext:{ kind, id, title, year:pickYear(item) },
    }
}
function buildQuery(p){
    return Object.keys(p)
        .filter(k=>p[k]!==undefined&&p[k]!==null&&p[k]!=='')
        .map(k=>`${encodeURIComponent(k)}=${encodeURIComponent(p[k])}`)
        .join('&')
}
async function fetchJson(url, params){
    const qs=buildQuery(params||{})
    const { data } = await $fetch.get(qs?`${url}?${qs}`:url, { headers:HEADERS })
    return typeof data==='string' ? JSON.parse(data) : data
}
function buildFilters(ext){
    const genres = ext.kind===MEDIA.TV ? TV_GENRES : MOVIE_GENRES
    const gv = [{n:'All',v:''}].concat(Object.keys(genres).map(id=>({n:genres[id],v:id})))
    return [
        { key:'sort_by', name:'Sort',  init:'popularity.desc', value:SORT_OPTIONS },
        { key:'genre',   name:'Genre', init:'',                 value:gv },
    ]
}
function normalizeExt(ext){
    const n=argsify(ext)
    n.kind    = n.kind    || MEDIA.MOVIE
    n.page    = parseInt(n.page||'1',10)||1
    n.sort_by = n.sort_by || (n.filters&&n.filters.sort_by) || 'popularity.desc'
    n.genre   = n.genre   || (n.filters&&n.filters.genre)   || ''
    return n
}

/* ═══════════════════════════════════════════════════════════
   1. getConfig
═══════════════════════════════════════════════════════════ */
async function getConfig(){
    return jsonify(appConfig)
}

/* ═══════════════════════════════════════════════════════════
   2. getCards
═══════════════════════════════════════════════════════════ */
async function getCards(ext){
    ext = normalizeExt(ext)
    const params = {
        page:                   ext.page,
        language:               'en',
        with_original_language: 'en',
        sort_by:                ext.sort_by,
    }
    if(ext.genre) params.with_genres = ext.genre

    const endpoint = `${DB_BASE}/discover/${ext.kind===MEDIA.TV?'tv':'movie'}`
    let json={results:[],total_pages:1}, list=[]
    try {
        json = await fetchJson(endpoint, params)
        list = (json.results||[]).map(item=>mapCard(item,ext.kind)).filter(Boolean)
    } catch(e){ $print('getCards error: '+e) }

    return jsonify({
        list,
        hasMore: ext.page < (json.total_pages||1),
        ext:    { ...ext, page:ext.page+1 },
        filter: buildFilters(ext),
    })
}

/* ═══════════════════════════════════════════════════════════
   3. getTracks
═══════════════════════════════════════════════════════════ */
async function getMovieTracks(id){
    const json  = await fetchJson(`${DB_BASE}/movie/${id}`,{
        append_to_response:'external_ids', language:'en',
    })
    const title = tidy(json.title||json.original_title||'')
    const year  = pickYear(json)
    const imdb  = (json.external_ids&&json.external_ids.imdb_id)||''
    return {
        list:[{
            title: title||'Movie',
            tracks:[{
                name: year ? `${title} (${year})` : (title||'Play'),
                pan:'',
                ext:{ kind:MEDIA.MOVIE, id:json.id, tmdbId:json.id, imdbId:imdb, title, year },
            }],
        }],
    }
}
async function getTvTracks(id){
    const detail = await fetchJson(`${DB_BASE}/tv/${id}`,{
        append_to_response:'external_ids', language:'en',
    })
    const title  = tidy(detail.name||detail.original_name||'')
    const year   = pickYear(detail)
    const imdb   = (detail.external_ids&&detail.external_ids.imdb_id)||''
    const total  = detail.number_of_seasons||0
    const groups = []

    for(let s=1; s<=total; s++){
        let season
        try{ season = await fetchJson(`${DB_BASE}/tv/${id}/season/${s}`,{language:'en'}) }
        catch(e){ $print(`season ${s} error: ${e}`); continue }
        const eps=(season.episodes||[]).map(ep=>({
            name: ep.name ? `E${ep.episode_number} ${tidy(ep.name)}` : `Episode ${ep.episode_number}`,
            pan:'',
            ext:{ kind:MEDIA.TV, id, tmdbId:id, imdbId:imdb, title, year,
                  seasonId:season.season_number, episodeId:ep.episode_number, totalSeasons:total },
        }))
        if(eps.length) groups.push({ title:season.name||`Season ${season.season_number}`, tracks:eps })
    }
    return { list:groups }
}
async function getTracks(ext){
    ext=argsify(ext)
    let kind=ext.kind, id=parseInt(ext.id||'0',10)
    if((!kind||!id)&&ext.vod_id){
        const p=parseVodId(ext.vod_id)
        kind=kind||p.kind; id=id||p.id
    }
    try {
        if(kind===MEDIA.MOVIE) return jsonify(await getMovieTracks(id))
        if(kind===MEDIA.TV)    return jsonify(await getTvTracks(id))
    } catch(e){ $print('getTracks error: '+e) }
    return jsonify({list:[]})
}

/* ═══════════════════════════════════════════════════════════
   4. getPlayinfo  ★ Fix2 — 使用各服务的后端 JSON API
   
   不再爬 iframe HTML（SPA 无内容），改为直接调用
   各嵌入服务暴露的 REST API 端点获取 m3u8/mp4 URL。
   
   策略优先级：
     A. vidlink.pro   → /api/b/movie/{tmdb}
                        /api/b/tv/{tmdb}?multiLang=1&s={s}&e={e}
        响应: { stream:{ playlist:[ {file:"https://...m3u8"} ] } }
             或 { url:"https://..." }
   
     B. vidsrc.cc     → /v2/api/stream/movie?videoId={tmdb}
                        /v2/api/stream/tv?videoId={tmdb}&s={s}&e={e}
        响应: { result:{ sources:[ {url:"https://...m3u8"} ] } }
   
     C. 2embed.skin   → /api/getVideoSource?type=movie&id={imdb}
                        /api/getVideoSource?type=series&id={imdb}&season={s}&episode={e}
        响应: { videoSource:"https://...m3u8" }
   
     D. autoembed.co  → /api/getVideoSource?type=movie&id={imdb}
        响应: { videoSource:"https://...m3u8" }
═══════════════════════════════════════════════════════════ */

// 从任意对象深度搜索第一个 m3u8/mp4 URL 字符串
function deepFindUrl(obj, depth){
    depth = depth||0
    if(depth>6) return ''
    if(typeof obj==='string'){
        if(/https?:\/\/.+\.(m3u8|mp4)/i.test(obj) &&
           !/poster|thumb|image|logo|banner/i.test(obj)) return obj
        return ''
    }
    if(Array.isArray(obj)){
        for(const item of obj){
            const r=deepFindUrl(item, depth+1)
            if(r) return r
        }
    } else if(obj && typeof obj==='object'){
        // 优先检查常见字段名
        for(const key of ['url','file','src','source','stream','hls','playlist','videoSource','link','sources']){
            if(obj[key]){
                const r=deepFindUrl(obj[key], depth+1)
                if(r) return r
            }
        }
        // 再遍历其他字段
        for(const key of Object.keys(obj)){
            const r=deepFindUrl(obj[key], depth+1)
            if(r) return r
        }
    }
    return ''
}

// 安全 JSON 请求，失败返回 null
async function safeJson(url, hdrs){
    try {
        const { data } = await $fetch.get(url, { headers: hdrs||HEADERS })
        return typeof data==='string' ? JSON.parse(data) : data
    } catch(e){
        $print('safeJson failed: '+url+' '+e)
        return null
    }
}

async function getPlayinfo(ext){
    ext = argsify(ext)
    if(ext.directUrl){
        return jsonify({ urls:[ext.directUrl], headers:[{'User-Agent':UA,Referer:BASE+'/'}] })
    }

    const tmdb  = ext.tmdbId || ext.id
    const kind  = ext.kind
    const s     = ext.seasonId  || 1
    const e     = ext.episodeId || 1
    const imdb  = ext.imdbId || ''
    const isTV  = kind === MEDIA.TV

    if(!tmdb || !kind){
        $utils.toastError('Missing tmdb id')
        return jsonify({ urls:[''], headers:[{}] })
    }

    let playUrl = ''
    let referer = BASE+'/'

    /* ── A. vidlink.pro JSON API ────────────────────────────── */
    if(!playUrl){
        const apiUrl = isTV
            ? `https://vidlink.pro/api/b/tv/${tmdb}?multiLang=1&s=${s}&e=${e}`
            : `https://vidlink.pro/api/b/movie/${tmdb}`
        const hdrs = {
            'User-Agent':      UA,
            'Accept':          'application/json',
            'Referer':         'https://vidlink.pro/',
            'Origin':          'https://vidlink.pro',
        }
        const json = await safeJson(apiUrl, hdrs)
        if(json){
            const found = deepFindUrl(json)
            if(found){ playUrl=found; referer='https://vidlink.pro/' }
        }
        $print('vidlink result: '+(playUrl||'none'))
    }

    /* ── B. vidsrc.cc JSON API ──────────────────────────────── */
    if(!playUrl){
        const apiUrl = isTV
            ? `https://vidsrc.cc/v2/api/stream/tv?videoId=${tmdb}&s=${s}&e=${e}`
            : `https://vidsrc.cc/v2/api/stream/movie?videoId=${tmdb}`
        const hdrs = {
            'User-Agent': UA,
            'Accept':     'application/json',
            'Referer':    'https://vidsrc.cc/',
            'Origin':     'https://vidsrc.cc',
        }
        const json = await safeJson(apiUrl, hdrs)
        if(json){
            const found = deepFindUrl(json)
            if(found){ playUrl=found; referer='https://vidsrc.cc/' }
        }
        $print('vidsrc.cc result: '+(playUrl||'none'))
    }

    /* ── C. 2embed.skin JSON API (需要 imdbId) ──────────────── */
    if(!playUrl && imdb){
        const apiUrl = isTV
            ? `https://www.2embed.skin/api/getVideoSource?type=series&id=${imdb}&season=${s}&episode=${e}`
            : `https://www.2embed.skin/api/getVideoSource?type=movie&id=${imdb}`
        const hdrs = {
            'User-Agent': UA,
            'Accept':     'application/json',
            'Referer':    'https://www.2embed.skin/',
            'Origin':     'https://www.2embed.skin',
        }
        const json = await safeJson(apiUrl, hdrs)
        if(json){
            const found = deepFindUrl(json)
            if(found){ playUrl=found; referer='https://www.2embed.skin/' }
        }
        $print('2embed result: '+(playUrl||'none'))
    }

    /* ── D. autoembed.co JSON API ───────────────────────────── */
    if(!playUrl && imdb){
        const apiUrl = isTV
            ? `https://autoembed.co/api/getVideoSource?type=series&id=${imdb}&season=${s}&episode=${e}`
            : `https://autoembed.co/api/getVideoSource?type=movie&id=${imdb}`
        const hdrs = {
            'User-Agent': UA,
            'Accept':     'application/json',
            'Referer':    'https://autoembed.co/',
            'Origin':     'https://autoembed.co',
        }
        const json = await safeJson(apiUrl, hdrs)
        if(json){
            const found = deepFindUrl(json)
            if(found){ playUrl=found; referer='https://autoembed.co/' }
        }
        $print('autoembed result: '+(playUrl||'none'))
    }

    /* ── E. vidsrc.me embed（最后兜底，只用 tmdb） ──────────── */
    if(!playUrl){
        const embedUrl = isTV
            ? `https://vidsrc.me/embed/tv?tmdb=${tmdb}&season=${s}&episode=${e}`
            : `https://vidsrc.me/embed/movie?tmdb=${tmdb}`
        // vidsrc.me 有一个未加密的 /rcp/ 接口
        // 先拿 embed 页面里的 data-hash，再请求 /rcp/
        try {
            const { data: html } = await $fetch.get(embedUrl, {
                headers:{ 'User-Agent':UA, Referer:'https://vidsrc.me/' }
            })
            // 找 /rcp/ 路径
            const rcpM = html.match(/src=["']([^"']*\/rcp\/[^"']+)["']/i)
            if(rcpM){
                const rcpUrl = rcpM[1].startsWith('http') ? rcpM[1]
                    : 'https://vidsrc.me'+rcpM[1]
                const { data: rcp } = await $fetch.get(rcpUrl, {
                    headers:{ 'User-Agent':UA, Referer:embedUrl }
                })
                const m3uM = rcp.match(/["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)["'`]/i)
                if(m3uM){ playUrl=m3uM[1]; referer=rcpUrl }
            }
        } catch(e){ $print('vidsrc.me fallback error: '+e) }
        $print('vidsrc.me result: '+(playUrl||'none'))
    }

    if(!playUrl){
        $utils.toastError('所有源均无法获取播放地址，请尝试开代理后重试')
        return jsonify({ urls:[''], headers:[{'User-Agent':UA,Referer:BASE+'/'}] })
    }

    return jsonify({
        urls:    [playUrl],
        headers: [{ 'User-Agent':UA, Referer:referer }],
    })
}

/* ═══════════════════════════════════════════════════════════
   5. search
═══════════════════════════════════════════════════════════ */
async function search(ext){
    ext=argsify(ext)
    const keyword=tidy(ext.text||'')
    const page=parseInt(ext.page||'1',10)||1
    if(!keyword) return jsonify({list:[]})

    let json={results:[]}, list=[]
    try {
        json = await fetchJson(`${DB_BASE}/search/multi`,{
            query:keyword, page, language:'en', include_adult:'false',
        })
        list = (json.results||[])
            .filter(item=>item.media_type===MEDIA.MOVIE||item.media_type===MEDIA.TV)
            .map(item=>mapCard(item,item.media_type))
            .filter(Boolean)
    } catch(e){ $print('search error: '+e) }

    return jsonify({
        list,
        hasMore: page < (json.total_pages||1),
        ext:{ text:keyword, page:page+1 },
    })
}
