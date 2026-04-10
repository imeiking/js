/**
 * ============================================================
 *  TVBox / CatVOD Plugin — animotvslash.org
 *  Engine: HiAnime / AniWatch clone
 *  Style:  libvio cheerio-scraping pattern (完全一致)
 *
 *  自测: node animotvslash_plugin.js --test
 * ============================================================
 */

// ─────────────────────────────────────────────────────────────
//  测试模式：仅在 Node 直接执行时才注入 shim，不影响 TVBox
// ─────────────────────────────────────────────────────────────
if (typeof createCheerio === 'undefined') {
    // Node.js 自测环境：注入全局 shim
    const ch = require('cheerio');
    global.createCheerio = () => ch;
    global.argsify = v => (typeof v === 'string' ? JSON.parse(v) : v);
    global.jsonify = v => JSON.stringify(v);
    global.$config_str = '{}';
    // $fetch 由测试套件按用例单独注入，此处给默认空实现
    global.$fetch = { get: async () => ({ data: '' }) };
}

// ─────────────────────────────────────────────────────────────
//  以下代码与 libvio 完全同格式：顶层直接调 TVBox 全局函数
// ─────────────────────────────────────────────────────────────
const cheerio = createCheerio()

let $config = argsify($config_str)
const SITE = $config.site || 'https://animotvslash.org'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const headers = {
    'Referer'         : `${SITE}/`,
    'Origin'          : SITE,
    'User-Agent'      : UA,
    'X-Requested-With': 'XMLHttpRequest',
}

// ─────────────────────────────────────────────────────────────
//  服务器优选表（vidstreaming 最稳定）
// ─────────────────────────────────────────────────────────────
const SERVER_PREF = ['vidstreaming', 'megacloud', 'streamsb', 'vidcloud']

// ─────────────────────────────────────────────────────────────
//  App 配置 & 分类标签（对应网站导航栏）
// ─────────────────────────────────────────────────────────────
const appConfig = {
    ver  : 1,
    title: 'AnimoTVSlash',
    site : SITE,
    tabs : [
        { name: '首页',      ext: { path: '/',              hasMore: false } },
        { name: '新番',      ext: { path: '/top-airing'                   } },
        { name: '热门',      ext: { path: '/most-popular'                 } },
        { name: '电影',      ext: { path: '/movie'                        } },
        { name: 'TV',        ext: { path: '/tv'                           } },
        { name: 'OVA',       ext: { path: '/ova'                          } },
        { name: 'ONA',       ext: { path: '/ona'                          } },
        { name: '特别篇',    ext: { path: '/special'                      } },
        { name: '字幕版',    ext: { path: '/subbed-anime'                 } },
        { name: '配音版',    ext: { path: '/dubbed-anime'                 } },
    ]
}

async function getConfig() {
    return jsonify(appConfig)
}

// ─────────────────────────────────────────────────────────────
//  getCards — 分类列表页 / 翻页
// ─────────────────────────────────────────────────────────────
//  HiAnime 卡片 HTML 结构：
//    <div class="flw-item">
//      <div class="film-poster">
//        <a href="/anime-name-123" class="film-poster-ahref" title="标题">
//          <img data-src="封面URL" />
//        </a>
//        <div class="tick ltr">
//          <div class="tick-item tick-sub">12</div>   ← 字幕集数
//          <div class="tick-item tick-dub">10</div>   ← 配音集数
//        </div>
//      </div>
//      <div class="film-detail">
//        <h3 class="film-name"><a href="...">标题</a></h3>
//      </div>
//    </div>
// ─────────────────────────────────────────────────────────────
async function getCards(ext) {
    ext = argsify(ext)

    const path    = ext.path    || '/top-airing'
    const page    = ext.page    || 1
    const hasMore = ext.hasMore !== false   // 首页强制 false

    if (!hasMore && page > 1) {
        return jsonify({ list: [] })
    }

    const url = appConfig.site + path + '?page=' + page
    const { data } = await $fetch.get(url, { headers })

    const $ = cheerio.load(data)
    const cards = []
    const seen  = new Set()

    $('.flw-item').each((_, el) => {
        const $el   = $(el)
        const $a    = $el.find('.film-poster a').first()
        const href  = $a.attr('href') || ''

        if (!href || href === '#' || !href.startsWith('/')) return

        if (seen.has(href)) return
        seen.add(href)

        const title   = $a.attr('title') || $el.find('.film-name a').first().text().trim()
        const pic     = $el.find('img').first().attr('data-src')
                     || $el.find('img').first().attr('src')
                     || ''
        const sub     = $el.find('.tick-item.tick-sub').first().text().trim()
        const dub     = $el.find('.tick-item.tick-dub').first().text().trim()
        const remarks = [sub && 'Sub:' + sub, dub && 'Dub:' + dub].filter(Boolean).join('  ')

        cards.push({
            vod_id     : href,
            vod_name   : title,
            vod_pic    : pic,
            vod_remarks: remarks,
            ext        : { url: appConfig.site + href },
        })
    })

    return jsonify({ list: cards })
}

// ─────────────────────────────────────────────────────────────
//  getTracks — 获取剧集列表
//
//  与 libvio 直接在详情页解析不同，HiAnime 需要两步：
//    1. GET 详情页 → 从 data-id="18718" 提取数字 ID
//    2. GET /ajax/v2/episode/list/{dataId} → 剧集列表 HTML（包在 JSON.html 里）
// ─────────────────────────────────────────────────────────────
async function getTracks(ext) {
    const { url: detailUrl } = argsify(ext)

    // Step 1 — 获取详情页，提取 animeDataId
    const { data: html } = await $fetch.get(detailUrl, { headers })
    const dataId = _extractDataId(html)

    if (!dataId) {
        return jsonify({ list: [{ title: 'Episodes', tracks: [] }] })
    }

    // Step 2 — 通过 AJAX 获取剧集列表
    const ajaxUrl = appConfig.site + '/ajax/v2/episode/list/' + dataId
    const { data: epRaw } = await $fetch.get(ajaxUrl, { headers })
    const epData = typeof epRaw === 'string' ? JSON.parse(epRaw) : epRaw
    const epHtml = epData.html || ''

    const $     = cheerio.load(epHtml)
    const tracks = []

    $('a.ssl-item.ep-item').each((_, el) => {
        const $a   = $(el)
        const num  = $a.attr('data-number') || ''
        const epId = $a.attr('data-id')     || ''
        const name = ($a.attr('title') || '').trim()
                  || (num.length > 1 ? num : '0' + num)

        tracks.push({
            name: name,
            ext : {
                url : detailUrl,
                epId: epId,
            }
        })
    })

    return jsonify({ list: [{ title: 'Episodes', tracks }] })
}

// ─────────────────────────────────────────────────────────────
//  getPlayinfo — 解析播放直链
//
//  三步 AJAX（对标 libvio 的 player_data 解密逻辑）：
//    1. /ajax/v2/episode/servers?episodeId={epId} → 服务器列表
//    2. 按优先级选服务器
//    3. /ajax/v2/episode/sources?id={serverId}  → m3u8 或 embed 链接
// ─────────────────────────────────────────────────────────────
async function getPlayinfo(ext) {
    const { epId } = argsify(ext)

    if (!epId) {
        return jsonify({ urls: [], headers })
    }

    // Step 1 — 服务器列表
    const srvUrl = appConfig.site + '/ajax/v2/episode/servers?episodeId=' + epId
    const { data: srvRaw } = await $fetch.get(srvUrl, { headers })
    const srvData = typeof srvRaw === 'string' ? JSON.parse(srvRaw) : srvRaw
    const srvHtml = srvData.html || ''

    const $s = cheerio.load(srvHtml)
    const subs = []
    const dubs = []

    $s('.server-item[data-type="sub"]').each((_, el) => {
        subs.push({ name: $s(el).text().trim(), id: $s(el).attr('data-id') })
    })
    $s('.server-item[data-type="dub"]').each((_, el) => {
        dubs.push({ name: $s(el).text().trim(), id: $s(el).attr('data-id') })
    })

    // Step 2 — 挑选最优服务器（字幕优先，配音备用）
    const serverList = subs.length ? subs : dubs
    const serverId   = _pickServer(serverList)

    if (!serverId) {
        return jsonify({ urls: [], headers })
    }

    // Step 3 — 获取播放源
    const srcUrl = appConfig.site + '/ajax/v2/episode/sources?id=' + serverId
    const { data: srcRaw } = await $fetch.get(srcUrl, { headers })
    const srcData = typeof srcRaw === 'string' ? JSON.parse(srcRaw) : srcRaw

    let playUrl = ''

    if (srcData.sources && srcData.sources.length) {
        // 直接 m3u8 数组 → 取最高画质
        const sorted = srcData.sources
            .filter(s => s.file || s.url)
            .sort((a, b) => {
                const q = x => parseInt((x.label || '0').replace(/\D/g, '')) || 0
                return q(b) - q(a)
            })
        playUrl = (sorted[0] && (sorted[0].file || sorted[0].url)) || ''
    } else if (srcData.link) {
        // embed 链接（megacloud 等），交给 TVBox WebView 处理
        playUrl = srcData.link
    }

    return jsonify({ urls: [playUrl], headers })
}

// ─────────────────────────────────────────────────────────────
//  search — 关键词搜索（仅第一页，对标 libvio）
// ─────────────────────────────────────────────────────────────
async function search(ext) {
    ext = argsify(ext)

    const page = ext.page || 1
    if (page > 1) {
        return jsonify({ list: [] })
    }

    const q   = encodeURIComponent(ext.text || '')
    const url = appConfig.site + '/search?keyword=' + q
    const { data } = await $fetch.get(url, { headers })

    const $ = cheerio.load(data)
    const cards = []
    const seen  = new Set()

    $('.flw-item').each((_, el) => {
        const $el  = $(el)
        const $a   = $el.find('.film-poster a').first()
        const href = $a.attr('href') || ''

        if (!href || href === '#' || !href.startsWith('/')) return
        if (seen.has(href)) return
        seen.add(href)

        const title   = $a.attr('title') || $el.find('.film-name a').first().text().trim()
        const pic     = $el.find('img').first().attr('data-src')
                     || $el.find('img').first().attr('src')
                     || ''
        const sub     = $el.find('.tick-item.tick-sub').first().text().trim()
        const dub     = $el.find('.tick-item.tick-dub').first().text().trim()
        const remarks = [sub && 'Sub:' + sub, dub && 'Dub:' + dub].filter(Boolean).join('  ')

        cards.push({
            vod_id     : href,
            vod_name   : title,
            vod_pic    : pic,
            vod_remarks: remarks,
            ext        : { url: appConfig.site + href },
        })
    })

    return jsonify({ list: cards })
}

// ─────────────────────────────────────────────────────────────
//  私有工具函数（以 _ 开头，不暴露给 TVBox）
// ─────────────────────────────────────────────────────────────

/**
 * 从详情页 HTML 中提取数字 animeDataId
 * 尝试三种常见位置：
 *   1. <div id="ani_detail" data-id="18718">
 *   2. var syncData = {"id":"18718",...}
 *   3. 任意 data-id="数字"
 */
function _extractDataId(html) {
    let m

    m = html.match(/id="ani_detail"[^>]+data-id="(\d+)"/)
    if (m) return m[1]

    m = html.match(/var\s+syncData\s*=\s*\{[^}]*"id"\s*:\s*"(\d+)"/)
    if (m) return m[1]

    m = html.match(/\bdata-id="(\d+)"/)
    if (m) return m[1]

    return null
}

/**
 * 按优先级选最优服务器，返回 serverId 字符串
 */
function _pickServer(list) {
    if (!list || !list.length) return null
    for (const pref of SERVER_PREF) {
        const s = list.find(x => (x.name || '').toLowerCase().includes(pref))
        if (s) return s.id
    }
    return list[0].id || null
}

// ─────────────────────────────────────────────────────────────
//  自测套件  (node animotvslash_plugin.js --test)
// ─────────────────────────────────────────────────────────────
if (typeof process !== 'undefined' && process.argv && process.argv.includes('--test')) {

    const C = { R:'\x1b[0m', G:'\x1b[32m', Re:'\x1b[31m', Y:'\x1b[33m', Cy:'\x1b[36m', B:'\x1b[1m', D:'\x1b[2m' }
    const ok   = m => console.log('  ' + C.G  + '\u2714' + C.R + '  ' + m)
    const fail = m => console.log('  ' + C.Re + '\u2718' + C.R + '  ' + m)
    const info = m => console.log('  ' + C.Y  + '\u2139' + C.R + '  ' + C.D + m + C.R)
    const head = m => console.log('\n' + C.B + C.Cy + '\u25b6 ' + m + C.R)
    const sep  = () => console.log(C.B + '\u2500'.repeat(54) + C.R)

    // ── Mock HTML fixtures ─────────────────────────────────────
    const CARDS_HTML = `
<div class="film_list-wrap">
  <div class="flw-item">
    <div class="film-poster">
      <a href="/solo-leveling-18718" class="film-poster-ahref" title="Solo Leveling">
        <img data-src="https://cdn.ex.com/sl.jpg" />
      </a>
      <div class="tick ltr">
        <div class="tick-item tick-sub">12</div>
        <div class="tick-item tick-dub">12</div>
      </div>
    </div>
    <div class="film-detail"><h3 class="film-name"><a href="/solo-leveling-18718">Solo Leveling</a></h3></div>
  </div>
  <div class="flw-item">
    <div class="film-poster">
      <a href="/naruto-20" class="film-poster-ahref" title="Naruto">
        <img data-src="https://cdn.ex.com/nr.jpg" />
      </a>
      <div class="tick ltr">
        <div class="tick-item tick-sub">220</div>
        <div class="tick-item tick-dub">220</div>
      </div>
    </div>
    <div class="film-detail"><h3 class="film-name"><a href="/naruto-20">Naruto</a></h3></div>
  </div>
  <div class="flw-item">
    <div class="film-poster">
      <a href="#" class="film-poster-ahref" title="Bad Link"><img data-src="x.jpg" /></a>
    </div>
  </div>
</div>`

    const DETAIL_HTML = `<html><body><div id="ani_detail" data-id="18718"><h2>Solo Leveling</h2></div></body></html>`

    const EP_LIST_JSON = JSON.stringify({
        html: (() => {
            let s = '<div class="ss-list">'
            for (let i = 1; i <= 12; i++) {
                s += `<a class="ssl-item ep-item" href="/watch/solo-leveling-18718?ep=${84000+i}" data-id="${84000+i}" data-number="${i}" title="Episode ${i}"></a>`
            }
            return s + '</div>'
        })(),
        status: true,
    })

    const SERVERS_JSON = JSON.stringify({
        html: `<div class="server-item" data-type="sub" data-id="4001">Vidstreaming</div>
               <div class="server-item" data-type="sub" data-id="4002">Megacloud</div>
               <div class="server-item" data-type="dub" data-id="4003">Vidstreaming</div>`,
        status: true,
    })

    const SOURCES_JSON = JSON.stringify({
        sources: [
            { file: 'https://stream.ex.com/ep1_1080p.m3u8', label: '1080p', type: 'hls' },
            { file: 'https://stream.ex.com/ep1_720p.m3u8',  label: '720p',  type: 'hls' },
        ],
        link  : 'https://megacloud.tv/embed/XXXX',
        status: true,
    })

    // ── $fetch 路由注入器 ──────────────────────────────────────
    function setFetch(overrides) {
        global.$fetch = {
            get: async url => {
                if (overrides && overrides[url]) return overrides[url]
                if (url.includes('/ajax/v2/episode/list/'))      return { data: EP_LIST_JSON }
                if (url.includes('/ajax/v2/episode/servers'))    return { data: SERVERS_JSON }
                if (url.includes('/ajax/v2/episode/sources'))    return { data: SOURCES_JSON }
                if (url.match(/\/[a-z-]+-\d+$/))                return { data: DETAIL_HTML }
                return { data: CARDS_HTML }
            }
        }
    }

    // ── 测试执行器 ─────────────────────────────────────────────
    let P = 0, F = 0
    async function t(label, fn) {
        try {
            if (await fn()) { ok(label); P++ }
            else            { fail(label + ' (false)'); F++ }
        } catch(e) {
            fail(label + ' \u2192 ' + e.message); F++
        }
    }

    ;(async () => {
        console.log('\n' + C.B + '='.repeat(54) + C.R)
        console.log(C.B + '  AnimoTVSlash  —  Self-Test  (libvio style)' + C.R)
        console.log(C.B + '='.repeat(54) + C.R)

        // T1 ── getConfig
        head('T1  getConfig()'); sep(); setFetch()
        await t('返回合法 JSON', async () => typeof JSON.parse(await getConfig()) === 'object')
        await t('title === "AnimoTVSlash"', async () => JSON.parse(await getConfig()).title === 'AnimoTVSlash')
        await t('共 10 个 tab', async () => JSON.parse(await getConfig()).tabs.length === 10)
        await t('每个 tab 有 name + ext.path', async () =>
            JSON.parse(await getConfig()).tabs.every(t => t.name && t.ext && t.ext.path))
        await t('首页 tab 带 hasMore:false', async () =>
            JSON.parse(await getConfig()).tabs[0].ext.hasMore === false)

        // T2 ── getCards
        head('T2  getCards()  — /top-airing'); sep(); setFetch()
        let c1 = []
        await t('返回 {list:Array}', async () => {
            const r = JSON.parse(await getCards({ path: '/top-airing', page: 1 }))
            c1 = r.list; return Array.isArray(r.list)
        })
        await t('过滤掉 href="#", 剩余 2 条', async () => { info('ids: ' + c1.map(c=>c.vod_id)); return c1.length === 2 })
        await t('每条有 vod_id/vod_name/vod_pic', async () => c1.every(c => c.vod_id && c.vod_name && c.vod_pic))
        await t('ext.url = SITE + vod_id', async () => c1.every(c => c.ext.url === SITE + c.vod_id))
        await t('vod_remarks 含 Sub:N', async () => c1.every(c => /Sub:\d+/.test(c.vod_remarks)))
        await t('无重复 vod_id', async () => new Set(c1.map(c=>c.vod_id)).size === c1.length)

        // T3 ── getCards 首页翻页守卫
        head('T3  getCards()  — hasMore:false 守卫'); sep()
        await t('hasMore:false + page>1 → 空列表', async () => {
            const r = JSON.parse(await getCards({ path: '/', page: 2, hasMore: false }))
            return r.list.length === 0
        })
        await t('hasMore 未传默认 true，page>1 正常请求', async () => {
            const r = JSON.parse(await getCards({ path: '/top-airing', page: 2 }))
            return Array.isArray(r.list)
        })

        // T4 ── search
        head('T4  search()'); sep(); setFetch()
        await t('返回列表', async () => Array.isArray(JSON.parse(await search({ text: 'naruto', page: 1 })).list))
        await t('page>1 返回空', async () => JSON.parse(await search({ text: 'x', page: 2 })).list.length === 0)
        await t('空关键词不崩溃', async () => Array.isArray(JSON.parse(await search({ text: '', page: 1 })).list))
        await t('特殊字符 URL 编码（Attack on Titan）', async () => {
            setFetch({ [SITE + '/search?keyword=Attack%20on%20Titan']: { data: CARDS_HTML } })
            return Array.isArray(JSON.parse(await search({ text: 'Attack on Titan', page: 1 })).list)
        })

        // T5 ── getTracks
        head('T5  getTracks()  — solo-leveling-18718'); sep(); setFetch()
        let trks = []
        await t('返回 {list:[{title,tracks}]}', async () => {
            const r = JSON.parse(await getTracks({ url: SITE + '/solo-leveling-18718' }))
            trks = r.list[0] ? r.list[0].tracks : []
            info(trks.length + ' eps in "' + (r.list[0] && r.list[0].title) + '"')
            return r.list[0] && r.list[0].title === 'Episodes'
        })
        await t('解析出 12 集（mock 数据）', async () => trks.length === 12)
        await t('每集有 name 和 ext.epId', async () => trks.every(t => t.name && t.ext && t.ext.epId))
        await t('epId 为纯数字字符串', async () => trks.every(t => /^\d+$/.test(t.ext.epId)))
        await t('无 dataId 时优雅降级为空集', async () => {
            setFetch({ [SITE + '/no-id-anime']: { data: '<html>no id</html>' } })
            const r = JSON.parse(await getTracks({ url: SITE + '/no-id-anime' }))
            return r.list[0].tracks.length === 0
        })

        // T6 ── getPlayinfo
        head('T6  getPlayinfo()  — ep 84001'); sep(); setFetch()
        let pr = null
        await t('返回 {urls, headers}', async () => {
            pr = JSON.parse(await getPlayinfo({ epId: '84001' }))
            return Array.isArray(pr.urls) && typeof pr.headers === 'object'
        })
        await t('选出 1080p 作为首选（最高质量排序）', async () => {
            info('url: ' + (pr && pr.urls[0])); return pr.urls[0] && pr.urls[0].includes('1080p')
        })
        await t('URL 以 .m3u8 结尾', async () => pr.urls[0] && pr.urls[0].endsWith('.m3u8'))
        await t('headers 含 Referer', async () => 'Referer' in pr.headers)
        await t('epId 为空时返回空 urls[]，不崩溃', async () => {
            const r = JSON.parse(await getPlayinfo({ epId: '' }))
            return Array.isArray(r.urls) && r.urls.length === 0
        })
        await t('无 sources 时 fallback 到 embed link', async () => {
            setFetch({
                [SITE + '/ajax/v2/episode/servers?episodeId=99999']: { data: SERVERS_JSON },
                [SITE + '/ajax/v2/episode/sources?id=4001']        : { data: JSON.stringify({ sources:[], link:'https://megacloud.tv/embed/XXXX', status:true }) },
            })
            const r = JSON.parse(await getPlayinfo({ epId: '99999' }))
            return r.urls[0] && r.urls[0].includes('megacloud.tv')
        })

        // T7 ── _extractDataId
        head('T7  _extractDataId()'); sep()
        await t('从 data-id attr 提取', async () => _extractDataId('<div id="ani_detail" data-id="18718">') === '18718')
        await t('从 syncData JSON 提取', async () => _extractDataId('var syncData = {"id":"4321","malId":"99"}') === '4321')
        await t('fallback 到任意 data-id="NNN"', async () => _extractDataId('<div class="x" data-id="555">') === '555')
        await t('无 ID 时返回 null', async () => _extractDataId('<html>nothing</html>') === null)

        // T8 ── _pickServer
        head('T8  _pickServer()'); sep()
        await t('优先选 vidstreaming', async () =>
            _pickServer([{ name:'Megacloud', id:'1' }, { name:'Vidstreaming', id:'2' }]) === '2')
        await t('没有 vidstreaming 选 megacloud', async () =>
            _pickServer([{ name:'Megacloud', id:'10' }, { name:'StreamSB', id:'11' }]) === '10')
        await t('全不匹配时取第一个', async () => _pickServer([{ name:'Unknown', id:'99' }]) === '99')
        await t('空列表返回 null', async () => _pickServer([]) === null)

        // T9 ── 字符串参数兼容（TVBox 以 JSON string 传参）
        head('T9  JSON string 参数兼容'); sep(); setFetch()
        await t('getCards 接受 JSON string', async () =>
            Array.isArray(JSON.parse(await getCards('{"path":"/top-airing","page":1}')).list))
        await t('search 接受 JSON string', async () =>
            Array.isArray(JSON.parse(await search('{"text":"naruto","page":1}')).list))
        await t('getTracks 接受 JSON string', async () =>
            Array.isArray(JSON.parse(await getTracks('{"url":"' + SITE + '/solo-leveling-18718"}')).list))
        await t('getPlayinfo 接受 JSON string', async () =>
            Array.isArray(JSON.parse(await getPlayinfo('{"epId":"84001"}')).urls))

        // ── 汇总 ──────────────────────────────────────────────
        const total  = P + F
        const pct    = Math.round(P / total * 100)
        const bar    = '\u2588'.repeat(Math.round(pct/5)) + '\u2591'.repeat(20 - Math.round(pct/5))
        const colour = F === 0 ? C.G : F < 4 ? C.Y : C.Re
        console.log('\n' + C.B + '='.repeat(54) + C.R)
        console.log('  ' + C.G + 'Passed: ' + P + C.R + '   ' + C.Re + 'Failed: ' + F + C.R + '   Total: ' + total)
        console.log('  ' + colour + bar + '  ' + pct + '%' + C.R)
        console.log(F === 0
            ? '\n  ' + C.B + C.G + 'All tests passed \u2714' + C.R
            : '\n  ' + C.B + C.Re + F + ' test(s) failed \u2718' + C.R)
        console.log(C.B + '='.repeat(54) + C.R + '\n')
        process.exit(F > 0 ? 1 : 0)
    })()
}
