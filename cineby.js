/**
 * XPTV Extension — Cineby  v5.1 (修复版)
 * https://www.cineby.sc
 *
 * ★ 播放修复
 * 已移除失效的 vidsrc.net 强行解密逻辑。
 * 采用备用无加密接口，并利用 XPTV 的 parse:1 内置嗅探功能直接抓取。
 */

const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'

const BASE    = 'https://www.cineby.sc'
const DB_BASE = 'https://db.videasy.net/3'
const IMG_BASE = 'https://image.tmdb.org/t/p'

const HEADERS = {
    'User-Agent':      UA,
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin':          BASE,
    'Referer':         BASE + '/',
    'Sec-Fetch-Dest':  'empty',
    'Sec-Fetch-Mode':  'cors',
    'Sec-Fetch-Site':  'cross-site',
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
function toImg(path, size){
    const p=tidy(path); if(!p) return ''
    if(/^https?:\/\//i.test(p)) return p
    return IMG_BASE+'/'+size+(p.startsWith('/')?p:'/'+p)
}
function pickYear(item){
    const m=String(item.release_date||item.first_air_date||'').match(/\d{4}/)
    return m?m[0]:''
}
function pickTitle(item,kind){
    return tidy(kind===MEDIA.TV?(item.name||item.original_name):(item.title||item.original_title))
}
function pickGenres(item,kind){
    const t=kind===MEDIA.TV?TV_GENRES:MOVIE_GENRES
    return (item.genre_ids||[]).map(id=>t[id]||'').filter(Boolean)
}
function buildRemark(item,kind){
    const parts=[],year=pickYear(item),score=item.vote_average?Number(item.vote_average).toFixed(1):'',gs=pickGenres(item,kind)
    if(year) parts.push(year); if(score&&score!=='0.0') parts.push('⭐'+score); if(gs.length) parts.push(gs.slice(0,2).join('/'))
    return parts.join(' · ')
}
function makeVodId(kind,id){ return kind+':'+id }
function parseVodId(v){
    const p=tidy(v).split(':')
    return p.length===2?{kind:p[0],id:parseInt(p[1],10)||0}:{kind:'',id:0}
}
function mapCard(item,kind){
    const id=item.id||0,title=pickTitle(item,kind)
    if(!id||!title) return null
    return { vod_id:makeVodId(kind,id), vod_name:title, vod_pic:toImg(item.poster_path,'w342'), vod_remarks:buildRemark(item,kind), ext:{kind,id,title,year:pickYear(item)} }
}
function buildQuery(p){
    return Object.keys(p).filter(k=>p[k]!==undefined&&p[k]!==null&&p[k]!=='').map(k=>encodeURIComponent(k)+'='+encodeURIComponent(p[k])).join('&')
}
async function fetchJson(url,params){
    const qs=buildQuery(params||{})
    const {data}=await $fetch.get(qs?url+'?'+qs:url,{headers:HEADERS})
    return typeof data==='string'?JSON.parse(data):data
}
function buildFilters(ext){
    const genres=ext.kind===MEDIA.TV?TV_GENRES:MOVIE_GENRES
    const gv=[{n:'All',v:''}].concat(Object.keys(genres).map(id=>({n:genres[id],v:id})))
    return [
        {key:'sort_by',name:'Sort', init:'popularity.desc',value:SORT_OPTIONS},
        {key:'genre',  name:'Genre',init:'',              value:gv},
    ]
}
function normalizeExt(ext){
    const n=argsify(ext)
    n.kind   =n.kind   ||MEDIA.MOVIE
    n.page   =parseInt(n.page||'1',10)||1
    n.sort_by=n.sort_by||(n.filters&&n.filters.sort_by)||'popularity.desc'
    n.genre  =n.genre  ||(n.filters&&n.filters.genre)  ||''
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
    ext=normalizeExt(ext)
    const params={page:ext.page,language:'en',with_original_language:'en',sort_by:ext.sort_by}
    if(ext.genre) params.with_genres=ext.genre
    const endpoint=DB_BASE+'/discover/'+(ext.kind===MEDIA.TV?'tv':'movie')
    let json={results:[],total_pages:1},list=[]
    try{
        json=await fetchJson(endpoint,params)
        list=(json.results||[]).map(item=>mapCard(item,ext.kind)).filter(Boolean)
    }catch(e){$print('getCards error: '+e)}
    return jsonify({list,hasMore:ext.page<(json.total_pages||1),ext:{...ext,page:ext.page+1},filter:buildFilters(ext)})
}

/* ═══════════════════════════════════════════════════════════
   3. getTracks
═══════════════════════════════════════════════════════════ */
async function getMovieTracks(id){
    const json=await fetchJson(DB_BASE+'/movie/'+id,{append_to_response:'external_ids',language:'en'})
    const title=tidy(json.title||json.original_title||''),year=pickYear(json)
    const imdb=(json.external_ids&&json.external_ids.imdb_id)||''
    return {list:[{title:title||'Movie',tracks:[{name:year?title+' ('+year+')':(title||'Play'),pan:'',ext:{kind:MEDIA.MOVIE,id:json.id,tmdbId:json.id,imdbId:imdb,title,year}}]}]}
}
async function getTvTracks(id){
    const detail=await fetchJson(DB_BASE+'/tv/'+id,{append_to_response:'external_ids',language:'en'})
    const title=tidy(detail.name||detail.original_name||''),year=pickYear(detail)
    const imdb=(detail.external_ids&&detail.external_ids.imdb_id)||''
    const total=detail.number_of_seasons||0,groups=[]
    for(let s=1;s<=total;s++){
        let season
        try{season=await fetchJson(DB_BASE+'/tv/'+id+'/season/'+s,{language:'en'})}catch(e){$print('season '+s+' error: '+e);continue}
        const eps=(season.episodes||[]).map(ep=>({
            name:ep.name?'E'+ep.episode_number+' '+tidy(ep.name):'Episode '+ep.episode_number,
            pan:'',
            ext:{kind:MEDIA.TV,id,tmdbId:id,imdbId:imdb,title,year,seasonId:season.season_number,episodeId:ep.episode_number,totalSeasons:total}
        }))
        if(eps.length) groups.push({title:season.name||'Season '+season.season_number,tracks:eps})
    }
    return {list:groups}
}
async function getTracks(ext){
    ext=argsify(ext)
    let kind=ext.kind,id=parseInt(ext.id||ext.tmdbId||'0',10)
    if((!kind||!id)&&ext.vod_id){const p=parseVodId(ext.vod_id);kind=kind||p.kind;id=id||p.id}
    try{
        if(kind===MEDIA.MOVIE) return jsonify(await getMovieTracks(id))
        if(kind===MEDIA.TV)    return jsonify(await getTvTracks(id))
    }catch(e){$print('getTracks error: '+e)}
    return jsonify({list:[]})
}

/* ═══════════════════════════════════════════════════════════
   4. getPlayinfo (已简化修复)
═══════════════════════════════════════════════════════════ */
async function getPlayinfo(ext) {
    ext = argsify(ext)

    if(ext.directUrl) {
        return jsonify({urls:[ext.directUrl],headers:[{'User-Agent':UA,Referer:BASE+'/'}]})
    }

    const tmdbId   = ext.tmdbId || ext.id
    const kind     = ext.kind === MEDIA.TV ? 'tv' : 'movie'
    const seasonId = ext.seasonId  || 1
    const epId     = ext.episodeId || 1

    if(!tmdbId) {
        $utils.toastError('缺少 TMDB ID')
        return jsonify({urls:[''],headers:[{}]})
    }

    $utils.toastInfo('正在获取播放地址...')

    let playUrls = []
    
    if (kind === 'tv') {
        // 剧集接口
        playUrls.push(`https://vidsrc.cc/v2/embed/tv/${tmdbId}/${seasonId}/${epId}`)
        playUrls.push(`https://vidlink.pro/tv/${tmdbId}/${seasonId}/${epId}`)
    } else {
        // 电影接口
        playUrls.push(`https://vidsrc.cc/v2/embed/movie/${tmdbId}`)
        playUrls.push(`https://vidlink.pro/movie/${tmdbId}`)
    }

    // 重点：开启 parse: 1 让 XPTV 接管网页并嗅探视频
    return jsonify({
        urls: playUrls,
        parse: 1, 
        headers: [{'User-Agent': UA}]
    })
}

/* ═══════════════════════════════════════════════════════════
   5. search
═══════════════════════════════════════════════════════════ */
async function search(ext){
    ext=argsify(ext)
    const keyword=tidy(ext.text||''),page=parseInt(ext.page||'1',10)||1
    if(!keyword) return jsonify({list:[]})
    let json={results:[]},list=[]
    try{
        json=await fetchJson(DB_BASE+'/search/multi',{query:keyword,page,language:'en',include_adult:'false'})
        list=(json.results||[]).filter(item=>item.media_type===MEDIA.MOVIE||item.media_type===MEDIA.TV).map(item=>mapCard(item,item.media_type)).filter(Boolean)
    }catch(e){$print('search error: '+e)}
    return jsonify({list,hasMore:page<(json.total_pages||1),ext:{text:keyword,page:page+1}})
}
