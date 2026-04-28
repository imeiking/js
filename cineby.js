/**
 * XPTV Extension — Cineby  v5.0
 * https://www.cineby.sc
 *
 * ★ 播放修复（彻底方案）
 *   使用 vidsrc.net 多步提取链路直接获取 m3u8：
 *   Step 1: GET /embed/movie?tmdb={id}
 *           解析 .serversList .server[data-hash] 获取服务器列表
 *   Step 2: GET https://{baseDom}/rcp/{dataHash}
 *           正则提取 src:'...' 获取 RCP URL
 *   Step 3a: 若为普通 URL → 直接跟进取 m3u8
 *   Step 3b: 若为 prorcp → 取 prorcp 页 → 找 JS 文件
 *            → 提取解密 key → RC4 解密 → 得到真实 m3u8
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

/* ─── RC4 解密（vidsrc prorcp 使用）─────────────────────────── */
function rc4Decrypt(key, data) {
    // data 是 base64 字符串
    const keyBytes = []
    for (let i = 0; i < key.length; i++) keyBytes.push(key.charCodeAt(i))

    // base64 decode
    const b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
    let dataBytes = []
    for (let i = 0; i < data.length; i += 4) {
        const c1=b64chars.indexOf(data[i]),c2=b64chars.indexOf(data[i+1])
        const c3=b64chars.indexOf(data[i+2]),c4=b64chars.indexOf(data[i+3])
        dataBytes.push((c1<<2)|(c2>>4))
        if(c3!==64) dataBytes.push(((c2&15)<<4)|(c3>>2))
        if(c4!==64) dataBytes.push(((c3&3)<<6)|c4)
    }

    // RC4 KSA
    const S=[]
    for(let i=0;i<256;i++) S[i]=i
    let j=0
    for(let i=0;i<256;i++){
        j=(j+S[i]+keyBytes[i%keyBytes.length])%256
        ;[S[i],S[j]]=[S[j],S[i]]
    }

    // RC4 PRGA
    let i2=0,j2=0
    const result=[]
    for(let k=0;k<dataBytes.length;k++){
        i2=(i2+1)%256; j2=(j2+S[i2])%256
        ;[S[i2],S[j2]]=[S[j2],S[i2]]
        result.push(dataBytes[k]^S[(S[i2]+S[j2])%256])
    }

    // bytes to string
    return result.map(b=>String.fromCharCode(b)).join('')
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
   4. getPlayinfo  ★ 核心修复 v5
   
   完整 vidsrc.net 提取链路（纯 HTTP，无 WebView）：
   
   Step 1: 请求 vidsrc.net embed 页
     https://vidsrc.net/embed/movie?tmdb={id}
     https://vidsrc.net/embed/tv?tmdb={id}&season={s}&episode={e}
     → 解析 .serversList .server[data-hash] 和 baseDom
   
   Step 2: 对每个 server 请求 RCP
     GET https://{baseDom}/rcp/{dataHash}
     → 正则 /src:\s*'([^']*)'/  提取 RCP URL
   
   Step 3a: 普通 URL → 直接跟进提取 m3u8
   
   Step 3b: prorcp URL →
     GET prorcp 页面
     → 找 JS 文件（排除 cpt.js）
     → 正则提取解密函数名和 key
     → RC4 解密 → 得到真实 m3u8
   
   Step 4: 失败时备用源 vidsrc.xyz
═══════════════════════════════════════════════════════════ */

// 安全 GET，失败返回空字符串
async function safeGet(url, hdrs) {
    try {
        const {data} = await $fetch.get(url, {headers: hdrs||{
            'User-Agent': UA,
            'Accept': 'text/html,*/*',
            'Accept-Language': 'en-US,en;q=0.9',
        }})
        return typeof data === 'string' ? data : JSON.stringify(data)
    } catch(e) {
        $print('safeGet failed: '+url+' err: '+e)
        return ''
    }
}

// 从 HTML 提取 m3u8/mp4
function extractDirect(html) {
    const pats = [
        /["'`](https?:\/\/[^"'`\s]+\.m3u8(?:\?[^"'`\s]*)?)/i,
        /["'`](https?:\/\/[^"'`\s]+\.mp4(?:\?[^"'`\s]*)?)/i,
        /file\s*:\s*["'`](https?:\/\/[^"'`\s,)]+)/i,
        /source\s*:\s*["'`](https?:\/\/[^"'`\s,)]+)/i,
        /src\s*:\s*["'`](https?:\/\/[^"'`\s,)]+\.(?:m3u8|mp4)[^"'`\s,)]*)/i,
    ]
    for(const re of pats){
        const m=html.match(re)
        if(m&&m[1]&&!/poster|thumb|image|logo|banner/i.test(m[1])) return m[1]
    }
    return ''
}

// Step 3b: prorcp 处理 → RC4 解密 → m3u8
async function handleProrcp(proUrl, baseDom) {
    $print('handleProrcp: '+proUrl)
    const referer = 'https://'+baseDom+'/'

    const proHtml = await safeGet(proUrl, {'User-Agent':UA,'Referer':referer,'Accept':'text/html,*/*'})
    if(!proHtml) return ''

    const $pro = cheerio.load(proHtml)

    // 找 JS 文件（排除 cpt.js）
    let jsUrl = ''
    $pro('script[src]').each((_,el)=>{
        const src=$pro(el).attr('src')||''
        if(src&&!src.includes('cpt.js')){
            jsUrl=src.startsWith('http')?src:'https://'+baseDom+src
        }
    })

    if(!jsUrl) {
        // 备用：正则找 script src
        const jm=proHtml.match(/script\s+src=["']([^"']+\.js[^"']*)["']/i)
        if(jm) jsUrl=jm[1].startsWith('http')?jm[1]:'https://'+baseDom+jm[1]
    }

    $print('prorcp jsUrl: '+jsUrl)
    if(!jsUrl) return ''

    const jsCode = await safeGet(jsUrl, {'User-Agent':UA,'Referer':proUrl,'Accept':'*/*'})
    if(!jsCode) return ''

    // 从 JS 里提取解密函数名和 key
    // 典型格式: decodeData = dcp(encData, 'KEYSTRING')
    const fnMatch = jsCode.match(/(\w+)\s*=\s*(\w+)\s*\(\s*\w+\s*,\s*['"]([^'"]+)['"]\s*\)/)
    if(!fnMatch) {
        $print('prorcp: no decrypt fn match')
        return ''
    }
    const decryptKey = fnMatch[3]
    $print('prorcp decryptKey: '+decryptKey)

    // 从 prorcp 页取加密数据
    // 典型格式: var encData = 'BASE64STRING'  或 data-hash="BASE64"
    let encData = ''
    const edm = proHtml.match(/(?:encData|encoded|data)\s*=\s*['"]([A-Za-z0-9+/=]+)['"]/)
    if(edm) encData=edm[1]
    if(!encData){
        const dh=$pro('[data-hash]').first().attr('data-hash')||''
        encData=dh
    }
    if(!encData) {
        $print('prorcp: no encData found')
        return ''
    }

    $print('prorcp encData length: '+encData.length)

    // RC4 解密
    try {
        const decrypted = rc4Decrypt(decryptKey, encData)
        $print('prorcp decrypted: '+decrypted.substring(0,100))
        // 解密结果应包含 m3u8 URL
        const m3u8m = decrypted.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/)
        if(m3u8m) return m3u8m[1]
        // 或直接就是 URL
        if(/^https?:\/\//.test(decrypted.trim())) return decrypted.trim()
    } catch(e) {
        $print('RC4 error: '+e)
    }

    return ''
}

// 主提取：vidsrc.net 完整链路
async function extractVidsrc(tmdbId, kind, seasonId, epId) {
    const isTV = kind === MEDIA.TV
    const s = seasonId||1, e = epId||1

    // Step 1: 请求 embed 页
    const embedUrl = isTV
        ? 'https://vidsrc.net/embed/tv?tmdb='+tmdbId+'&season='+s+'&episode='+e
        : 'https://vidsrc.net/embed/movie?tmdb='+tmdbId

    $print('vidsrc embed: '+embedUrl)

    const embedHtml = await safeGet(embedUrl, {
        'User-Agent': UA,
        'Referer': 'https://vidsrc.net/',
        'Accept': 'text/html,*/*',
    })
    if(!embedHtml) return {url:'', referer:''}

    const $embed = cheerio.load(embedHtml)

    // 提取 baseDom
    let baseDom = ''
    $embed('iframe[src]').each((_,el)=>{
        const src=$embed(el).attr('src')||''
        const m=src.match(/^(?:https?:\/\/)?([^/]+)/)
        if(m&&!baseDom) baseDom=m[1]
    })
    // 备用：从 script/link 提取
    if(!baseDom){
        const bm=embedHtml.match(/(?:src|href)=["']((?:https?:\/\/)?[^"'/]+\/rcp\/)/i)
        if(bm){const u=new URL2(bm[1]);baseDom=u.hostname}
    }
    if(!baseDom){
        // 通常是 v2.vidsrc.net 或 vidsrc.xyz 等
        const dm=embedHtml.match(/(?:https?:\/\/)(v\d+\.vidsrc\.\w+|rcp\.\w+\.\w+)/)
        if(dm) baseDom=dm[1]
    }

    $print('baseDom: '+baseDom)

    // 提取所有 server data-hash
    const servers = []
    $embed('.serversList .server, [data-hash]').each((_,el)=>{
        const hash=$embed(el).attr('data-hash')||''
        const name=$embed(el).text().trim()||'server'
        if(hash) servers.push({hash,name})
    })

    $print('servers found: '+servers.length)

    if(!servers.length||!baseDom) {
        // 直接在页面找 m3u8
        const direct=extractDirect(embedHtml)
        if(direct) return {url:direct,referer:embedUrl}
        return {url:'',referer:''}
    }

    // Step 2+3: 遍历 server
    for(const srv of servers){
        $print('trying server: '+srv.name+' hash: '+srv.hash)

        const rcpUrl='https://'+baseDom+'/rcp/'+srv.hash
        const rcpHtml=await safeGet(rcpUrl, {
            'User-Agent': UA,
            'Referer': embedUrl,
            'Accept': 'text/html,*/*',
        })
        if(!rcpHtml) continue

        // 正则提取 src:'...'
        const srcMatch = rcpHtml.match(/src\s*:\s*['"]([^'"]+)['"]/i)
        if(!srcMatch) {
            // 尝试直接找 m3u8
            const direct=extractDirect(rcpHtml)
            if(direct) return {url:direct,referer:rcpUrl}
            continue
        }

        const rcpData = srcMatch[1]
        $print('rcpData: '+rcpData.substring(0,80))

        // Step 3a: 普通 URL（非 prorcp）
        if(rcpData.startsWith('http')&&!rcpData.includes('prorcp')){
            // 跟进这个 URL 找 m3u8
            const nextHtml=await safeGet(rcpData, {'User-Agent':UA,'Referer':rcpUrl,'Accept':'text/html,*/*'})
            const direct=extractDirect(nextHtml||'')
            if(direct) return {url:direct,referer:rcpData}

            // 再找 iframe
            if(nextHtml){
                const $n=cheerio.load(nextHtml)
                const iframeSrc=$n('iframe').first().attr('src')||''
                if(iframeSrc){
                    const absIframe=iframeSrc.startsWith('http')?iframeSrc:'https://'+baseDom+iframeSrc
                    const iHtml=await safeGet(absIframe,{'User-Agent':UA,'Referer':rcpData,'Accept':'text/html,*/*'})
                    const d2=extractDirect(iHtml||'')
                    if(d2) return {url:d2,referer:absIframe}
                }
            }
            continue
        }

        // Step 3b: prorcp URL
        if(rcpData.includes('prorcp')){
            const proUrl=rcpData.startsWith('http')?rcpData:'https://'+baseDom+rcpData
            const m3u8=await handleProrcp(proUrl, baseDom)
            if(m3u8) return {url:m3u8,referer:'https://'+baseDom+'/'}
            continue
        }
    }

    return {url:'',referer:''}
}

// 备用：vidsrc.xyz 链路
async function extractVidsrcXyz(tmdbId, kind, seasonId, epId) {
    const isTV = kind === MEDIA.TV
    const s = seasonId||1, e = epId||1
    const embedUrl = isTV
        ? 'https://vidsrc.xyz/embed/tv/'+tmdbId+'?season='+s+'&episode='+e
        : 'https://vidsrc.xyz/embed/movie/'+tmdbId

    $print('vidsrc.xyz embed: '+embedUrl)
    const html = await safeGet(embedUrl, {'User-Agent':UA,'Referer':'https://vidsrc.xyz/','Accept':'text/html,*/*'})
    if(!html) return {url:'',referer:''}

    const direct = extractDirect(html)
    if(direct) return {url:direct,referer:embedUrl}

    // 跟进 iframe
    const $e=cheerio.load(html)
    const iframeSrc=$e('iframe').first().attr('src')||''
    if(iframeSrc){
        const abs=iframeSrc.startsWith('http')?iframeSrc:'https://vidsrc.xyz'+iframeSrc
        const iHtml=await safeGet(abs,{'User-Agent':UA,'Referer':embedUrl,'Accept':'text/html,*/*'})
        const d2=extractDirect(iHtml||'')
        if(d2) return {url:d2,referer:abs}
    }

    return {url:'',referer:''}
}

// URL 解析辅助
function URL2(url) {
    this.href=url
    const m=url.match(/^([a-zA-Z]+:)?\/\/([^\/?#:]+)?(:\d+)?(\/[^?#]*)?(\?[^#]*)?(#.*)?$/)
    this.hostname=m?m[2]||'':''
    this.origin=(m?m[1]||'https:':'https:')+'//'+this.hostname
}

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
        $utils.toastError('Missing tmdb id')
        return jsonify({urls:[''],headers:[{}]})
    }

    $utils.toastInfo('Loading stream...')

    let result = {url:'', referer:''}

    // 主链路：vidsrc.net
    try {
        result = await extractVidsrc(tmdbId, kind, seasonId, epId)
        $print('vidsrc.net result: '+(result.url||'none'))
    } catch(e) {
        $print('vidsrc.net error: '+e)
    }

    // 备用链路：vidsrc.xyz
    if(!result.url) {
        try {
            result = await extractVidsrcXyz(tmdbId, kind, seasonId, epId)
            $print('vidsrc.xyz result: '+(result.url||'none'))
        } catch(e) {
            $print('vidsrc.xyz error: '+e)
        }
    }

    if(!result.url){
        $utils.toastError('无法获取播放地址，请检查网络或代理')
        return jsonify({urls:[''],headers:[{'User-Agent':UA}]})
    }

    return jsonify({
        urls:    [result.url],
        headers: [{'User-Agent':UA, 'Referer':result.referer||BASE+'/'}],
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
