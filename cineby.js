/**
 * XPTV Extension — Cineby  v6.0 (最终直链修复版)
 * https://www.cineby.sc
 *
 * 修复说明：
 * 1. 移除了导致 XPTV 崩溃的错误嗅探指令。
 * 2. 引入了 Vidlink, Vidsrc.xyz, Autoembed 三个备用接口。
 * 3. 自动在后台提取 .m3u8 真实视频直链，直接交给 XPTV 播放。
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
   2. getCards (还原为你原本正常的列表和图片加载逻辑)
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
   4. getPlayinfo (核心修复区：在代码里自动提取真实 .m3u8)
═══════════════════════════════════════════════════════════ */
async function getPlayinfo(ext) {
    ext = argsify(ext)

    if(ext.directUrl) {
        return jsonify({urls:[ext.directUrl],headers:[{'User-Agent':UA,Referer:BASE+'/'}]})
    }

    const tmdbId   = ext.tmdbId || ext.id
    const kind     = ext.kind
    const seasonId = ext.seasonId  || 1
    const epId     = ext.episodeId || 1

    if(!tmdbId||!kind){
        $utils.toastError('缺少 TMDB ID')
        return jsonify({urls:[''],headers:[{}]})
    }

    $utils.toastInfo('正在提取真实视频直链...')
    let finalM3u8Url = '';

    // 方案1：从 vidlink.pro 提取
    try {
        const vlUrl = kind === MEDIA.TV
            ? `https://vidlink.pro/tv/${tmdbId}/${seasonId}/${epId}`
            : `https://vidlink.pro/movie/${tmdbId}`;
        const {data} = await $fetch.get(vlUrl, {headers: {'User-Agent': UA}});
        if (data && typeof data === 'string') {
            const m3u8Match = data.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i);
            if (m3u8Match) finalM3u8Url = m3u8Match[1];
        }
    } catch(e) {}

    // 方案2：如果失败，从 vidsrc.xyz 提取 iframe 里的直链
    if (!finalM3u8Url) {
        try {
            const xyzUrl = kind === MEDIA.TV
                ? `https://vidsrc.xyz/embed/tv/${tmdbId}?season=${seasonId}&episode=${epId}`
                : `https://vidsrc.xyz/embed/movie/${tmdbId}`;
            const {data} = await $fetch.get(xyzUrl, {headers: {'User-Agent': UA, 'Referer': 'https://vidsrc.xyz/'}});
            if (data && typeof data === 'string') {
                const iframeMatch = data.match(/<iframe[^>]+src=["']([^"']+)["']/i);
                if (iframeMatch) {
                    let iframeSrc = iframeMatch[1];
                    if (iframeSrc.startsWith('//')) iframeSrc = 'https:' + iframeSrc;
                    const {data: iData} = await $fetch.get(iframeSrc, {headers: {'User-Agent': UA, 'Referer': xyzUrl}});
                    if (iData && typeof iData === 'string') {
                        const m3u8Match = iData.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i);
                        if (m3u8Match) finalM3u8Url = m3u8Match[1];
                    }
                }
            }
        } catch(e) {}
    }

    // 方案3：如果还失败，从 autoembed.cc 提取
    if (!finalM3u8Url) {
        try {
            const aeUrl = kind === MEDIA.TV
                ? `https://player.autoembed.cc/embed/tv/${tmdbId}/${seasonId}/${epId}`
                : `https://player.autoembed.cc/embed/movie/${tmdbId}`;
            const {data} = await $fetch.get(aeUrl, {headers: {'User-Agent': UA}});
            if (data && typeof data === 'string') {
                const m3u8Match = data.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i);
                if (m3u8Match) finalM3u8Url = m3u8Match[1];
            }
        } catch(e) {}
    }

    if (!finalM3u8Url) {
        $utils.toastError('备用接口均失效，无法获取直链');
        return jsonify({urls:[''],headers:[{'User-Agent':UA}]});
    }

    // 提取成功，把最干净的直链发给 XPTV 播放器
    return jsonify({
        urls: [finalM3u8Url],
        headers: [{'User-Agent': UA, 'Origin': 'https://vidlink.pro', 'Referer': 'https://vidlink.pro/'}]
    });
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
