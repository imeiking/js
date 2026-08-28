// XPTV Spider for 2rk.cc - MacCMS v10 - Final v5
// R1: pagination, selector scope, player regex, img attrs, title fallback, relative href, home()
// R2: API aliases, detail format, play url singular, pagination last-page, relative play url, ../ paths, metadata, search threshold, init()
// R3: getTracks/detail format separation, tracks url field, actor selector, query-string pagination, search case, resolveUrl edge, filter encoding
// R4: non-http link filter, ext-string play param, playlist separator escape, year regex, url-format fallback
// R5: self-matching anchor, search keyword field aliases, alt-url encoding, img hash filter
const cheerio = createCheerio()
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const SITE = 'https://www.2rk.cc'

async function init(ext) { return true }

// ============ HTTP ============
async function fetchPage(url, opts) {
    opts = opts || {}
    var headers = Object.assign({
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    }, opts.headers || {})
    try {
        var resp = await $fetch.get(url, { headers: headers })
        return resp.data || resp.body || ''
    } catch (e) { $print('fetch error: ' + e + ' url=' + url); return '' }
}

// ============ URL helpers ============
function isRealUrl(href) {
    if (!href) return false
    if (href === '#') return false
    if (href.indexOf('javascript:') === 0) return false
    if (href.indexOf('mailto:') === 0) return false
    if (href.indexOf('tel:') === 0) return false
    if (href.indexOf('data:') === 0) return false
    return true
}

function resolveUrl(href) {
    if (!isRealUrl(href)) return ''
    if (href.startsWith('http')) return href
    if (href.startsWith('//')) return 'https:' + href
    while (href.startsWith('./')) href = href.substring(2)
    while (href.startsWith('../')) href = href.substring(3)
    if (!href) return ''
    if (href.startsWith('/')) return SITE + href
    return SITE + '/' + href
}

// FIX R5-4: resolveImg also filters # and non-http schemes
function resolveImg(src) {
    if (!src || src === '#') return ''
    if (src.indexOf('data:') === 0) return ''
    if (src.indexOf('javascript:') === 0) return ''
    if (src.startsWith('http')) return src
    if (src.startsWith('//')) return 'https:' + src
    while (src.startsWith('./')) src = src.substring(2)
    while (src.startsWith('../')) src = src.substring(3)
    if (!src) return ''
    if (src.startsWith('/')) return SITE + src
    return SITE + '/' + src
}

// ============ Parse video cards ============
function parseVideoCards($, containerSelector) {
    var cards = []
    var itemSelectors = [
        '.stui-vodlist__box', '.vodlist-item', '.module-item', '.video-item',
        '.video-list-item', '.search-item', '.movie-item', '.film-item',
        '.item-box', '.list-item',
    ]
    var items = null
    for (var s = 0; s < itemSelectors.length; s++) {
        items = containerSelector ? $(containerSelector).find(itemSelectors[s]) : $(itemSelectors[s])
        if (items.length > 0) break
    }
    if (!items || items.length === 0) return cards
    items.each(function (_, el) {
        var $el = $(el)
        // FIX R5-1: if the card element itself is an <a>, use it directly
        var link = $el.is('a') ? $el : $el.find('a').first()
        var href = link.attr('href') || ''
        if (!isRealUrl(href)) return
        var title = link.attr('title') || ''
        if (!title) title = $el.find('.title,.name,h4,h3,h2,.vod_name').first().text().trim()
        if (!title) title = link.text().trim()
        if (!title) title = $el.find('img').first().attr('alt') || ''
        var $img = $el.find('img').first()
        var cover = $img.attr('data-original') || $img.attr('data-src') || $img.attr('src') || ''
        var remark = $el.find('.pic-text,.remarks,.note,.tag,.score,.rating,.update').first().text().trim()
        if (href && title) {
            var realHref = resolveUrl(href)
            if (!realHref) return
            var vidMatch = realHref.match(/\/(?:voddetail|detail|vod|video)\/?(\d+)/i)
            cards.push({
                vod_id: vidMatch ? vidMatch[1] : realHref,
                vod_name: title,
                vod_pic: resolveImg(cover),
                vod_remarks: remark || '',
                ext: { url: realHref },
            })
        }
    })
    return cards
}

// ============ Extract video metadata ============
function extractVideoMeta($) {
    var meta = { vod_name:'', vod_pic:'', vod_content:'', vod_actor:'', vod_director:'', vod_year:'', vod_area:'', vod_remarks:'' }
    var titleSels = ['.stui-content__title h1','.vod-title h1','.video-title h1','.detail-title h1','h1']
    for (var i = 0; i < titleSels.length; i++) { var t = $(titleSels[i]).first().text().trim(); if (t) { meta.vod_name = t; break } }
    var picSels = ['.stui-content__thumb img','.vod-cover img','.video-cover img','.detail-thumb img','.thumb img']
    for (var j = 0; j < picSels.length; j++) { var $p = $(picSels[j]).first(); var pic = $p.attr('data-original')||$p.attr('data-src')||$p.attr('src')||''; if (pic) { meta.vod_pic = resolveImg(pic); break } }
    var descSels = ['.stui-content__desc','.vod-content','.video-desc','.detail-desc','.intro','.desc','.content']
    for (var k = 0; k < descSels.length; k++) { var d = $(descSels[k]).first().text().trim(); if (d && d.length > 5) { meta.vod_content = d; break } }
    var $subtitle = $('.stui-content__subtitle, .vod-subtitle, .video-subtitle, .detail-subtitle')
    if ($subtitle.length > 0) {
        var subText = $subtitle.text()
        var actorMatch = subText.match(/主演[：:]\s*([^\n\r]+)/); if (actorMatch) meta.vod_actor = actorMatch[1].trim()
        var dirMatch = subText.match(/导演[：:]\s*([^\n\r]+)/); if (dirMatch) meta.vod_director = dirMatch[1].trim()
        var yearMatch = subText.match(/(?:19|20)\d{2}/); if (yearMatch) meta.vod_year = yearMatch[0]
        var areaMatch = subText.match(/地区[：:]\s*([^\n\r]+)/); if (areaMatch) meta.vod_area = areaMatch[1].trim()
    }
    if (!meta.vod_actor) {
        var actors = []
        $('.vod-actor a, .actor a, .actors a, .starring a').each(function (_, a) {
            var name = $(a).text().trim()
            if (name && name.length < 20) actors.push(name)
        })
        if (actors.length > 0) meta.vod_actor = actors.join(',')
    }
    var remarkSels = ['.stui-content__subtitle .text-muted','.vod-remarks','.remarks','.note','.update']
    for (var r = 0; r < remarkSels.length; r++) { var rm = $(remarkSels[r]).first().text().trim(); if (rm) { meta.vod_remarks = rm; break } }
    return meta
}

// ============ Common detail fetcher ============
function _fetchDetailGroups($) {
    var groups = []
    var playlistSelectors = [
        '.stui-content__playlist','.playlist','.play-list','.episode-list',
        '.playurl','#playlist','.vodplay','.player-list',
    ]
    var playlists = null
    for (var s = 0; s < playlistSelectors.length; s++) { playlists = $(playlistSelectors[s]); if (playlists.length > 0) break }
    if (playlists && playlists.length > 0) {
        playlists.each(function (idx, el) {
            var gt = []
            $(el).find('a').each(function (_, ep) {
                var href = $(ep).attr('href') || '', name = $(ep).text().trim()
                if (!isRealUrl(href) || !name) return
                var realHref = resolveUrl(href)
                if (!realHref) return
                gt.push({ name: name, url: realHref, pan: '', ext: { url: realHref } })
            })
            if (gt.length > 0) groups.push({ title: '线路' + (idx + 1), tracks: gt })
        })
    }
    if (groups.length === 0) {
        var pl = $('a[href*="play"],a[href*="vodplay"],a[href*="/play/"]')
        if (pl.length > 0) {
            var gt = [], seen = {}
            pl.each(function (_, ep) {
                var href = $(ep).attr('href') || '', name = $(ep).text().trim() || '播放'
                if (!isRealUrl(href) || seen[href]) return
                seen[href] = true
                var realHref = resolveUrl(href)
                if (!realHref) return
                gt.push({ name: name, url: realHref, pan: '', ext: { url: realHref } })
            })
            if (gt.length > 0) groups.push({ title: '播放', tracks: gt })
        }
    }
    return groups
}

// ============ Site Config ============
const appConfig = {
    ver: 20260828, title: '2rk影视', site: SITE,
    tabs: [
        { name: '电影', ext: { id: 1 } },
        { name: '电视剧', ext: { id: 2 } },
        { name: '综艺', ext: { id: 3 } },
        { name: '动漫', ext: { id: 4 } },
    ],
}

// ============ Filters ============
const filterList = {
    1: [
        { key:'class', name:'类型', value:[{n:'全部',v:''},{n:'动作',v:'动作'},{n:'喜剧',v:'喜剧'},{n:'爱情',v:'爱情'},{n:'科幻',v:'科幻'},{n:'恐怖',v:'恐怖'},{n:'剧情',v:'剧情'},{n:'犯罪',v:'犯罪'},{n:'悬疑',v:'悬疑'},{n:'战争',v:'战争'},{n:'动画',v:'动画'},{n:'奇幻',v:'奇幻'},{n:'冒险',v:'冒险'},{n:'惊悚',v:'惊悚'},{n:'武侠',v:'武侠'},{n:'历史',v:'历史'},{n:'传记',v:'传记'},{n:'纪录',v:'纪录'},{n:'家庭',v:'家庭'},{n:'其他',v:'其他'}]},
        { key:'area', name:'地区', value:[{n:'全部',v:''},{n:'大陆',v:'大陆'},{n:'香港',v:'香港'},{n:'台湾',v:'台湾'},{n:'日本',v:'日本'},{n:'韩国',v:'韩国'},{n:'欧美',v:'欧美'},{n:'美国',v:'美国'},{n:'英国',v:'英国'},{n:'法国',v:'法国'},{n:'德国',v:'德国'},{n:'印度',v:'印度'},{n:'泰国',v:'泰国'},{n:'其他',v:'其他'}]},
        { key:'year', name:'年份', value:[{n:'全部',v:''},{n:'2026',v:'2026'},{n:'2025',v:'2025'},{n:'2024',v:'2024'},{n:'2023',v:'2023'},{n:'2022',v:'2022'},{n:'2021',v:'2021'},{n:'2020',v:'2020'},{n:'2019',v:'2019'},{n:'2018',v:'2018'},{n:'2017',v:'2017'},{n:'2016',v:'2016'}]},
        { key:'order', name:'排序', value:[{n:'最新',v:'time'},{n:'最热',v:'hits'},{n:'评分',v:'score'}]},
    ],
    2: [
        { key:'class', name:'类型', value:[{n:'全部',v:''},{n:'国产剧',v:'国产剧'},{n:'香港剧',v:'香港剧'},{n:'台湾剧',v:'台湾剧'},{n:'日本剧',v:'日本剧'},{n:'韩国剧',v:'韩国剧'},{n:'欧美剧',v:'欧美剧'},{n:'海外剧',v:'海外剧'},{n:'泰国剧',v:'泰国剧'},{n:'其他',v:'其他'}]},
        { key:'area', name:'地区', value:[{n:'全部',v:''},{n:'大陆',v:'大陆'},{n:'香港',v:'香港'},{n:'台湾',v:'台湾'},{n:'日本',v:'日本'},{n:'韩国',v:'韩国'},{n:'欧美',v:'欧美'},{n:'其他',v:'其他'}]},
        { key:'year', name:'年份', value:[{n:'全部',v:''},{n:'2026',v:'2026'},{n:'2025',v:'2025'},{n:'2024',v:'2024'},{n:'2023',v:'2023'},{n:'2022',v:'2022'},{n:'2021',v:'2021'},{n:'2020',v:'2020'}]},
        { key:'order', name:'排序', value:[{n:'最新',v:'time'},{n:'最热',v:'hits'},{n:'评分',v:'score'}]},
    ],
    3: [
        { key:'class', name:'类型', value:[{n:'全部',v:''},{n:'大陆综艺',v:'大陆综艺'},{n:'港台综艺',v:'港台综艺'},{n:'日韩综艺',v:'日韩综艺'},{n:'欧美综艺',v:'欧美综艺'},{n:'其他',v:'其他'}]},
        { key:'area', name:'地区', value:[{n:'全部',v:''},{n:'大陆',v:'大陆'},{n:'香港',v:'香港'},{n:'台湾',v:'台湾'},{n:'日本',v:'日本'},{n:'韩国',v:'韩国'},{n:'欧美',v:'欧美'},{n:'其他',v:'其他'}]},
        { key:'year', name:'年份', value:[{n:'全部',v:''},{n:'2026',v:'2026'},{n:'2025',v:'2025'},{n:'2024',v:'2024'},{n:'2023',v:'2023'},{n:'2022',v:'2022'},{n:'2021',v:'2021'},{n:'2020',v:'2020'}]},
        { key:'order', name:'排序', value:[{n:'最新',v:'time'},{n:'最热',v:'hits'},{n:'评分',v:'score'}]},
    ],
    4: [
        { key:'class', name:'类型', value:[{n:'全部',v:''},{n:'国产动漫',v:'国产动漫'},{n:'日本动漫',v:'日本动漫'},{n:'欧美动漫',v:'欧美动漫'},{n:'其他动漫',v:'其他动漫'}]},
        { key:'area', name:'地区', value:[{n:'全部',v:''},{n:'大陆',v:'大陆'},{n:'日本',v:'日本'},{n:'欧美',v:'欧美'},{n:'其他',v:'其他'}]},
        { key:'year', name:'年份', value:[{n:'全部',v:''},{n:'2026',v:'2026'},{n:'2025',v:'2025'},{n:'2024',v:'2024'},{n:'2023',v:'2023'},{n:'2022',v:'2022'},{n:'2021',v:'2021'},{n:'2020',v:'2020'}]},
        { key:'order', name:'排序', value:[{n:'最新',v:'time'},{n:'最热',v:'hits'},{n:'评分',v:'score'}]},
    ],
}

async function getConfig() { return jsonify(appConfig) }

function buildFilterUrl(id, page, filters, prefix) {
    filters = filters || {}
    function enc(v) { try { return encodeURIComponent(v || '') } catch(e) { return v || '' } }
    var c = enc(filters.class), a = enc(filters.area), l = enc(filters.lang)
    var y = enc(filters.year), o = enc(filters.order || 'time'), lt = enc(filters.letter)
    var p = prefix || ''
    return SITE + p + '/vodshow/' + id + '-' + c + '-' + a + '-' + l + '-' + y + '-' + lt + '-' + o + '-' + page + '.html'
}

// ============ home ============
async function home(ext) {
    try { var data = await fetchPage(SITE + '/'); if (!data) return jsonify({list:[]}); var $ = cheerio.load(data); return jsonify({ list: parseVideoCards($, null) }) }
    catch (e) { $print('home error: ' + e); return jsonify({list:[]}) }
}

// ============ pagination ============
function extractPageCount($, currentPage) {
    var pagecount = 0
    var $pagination = $('.stui-page,.pagination,.page-box,.page-nav,.pages,.pagenav').first()
    if ($pagination.length > 0) {
        var maxPage = 0
        $pagination.find('a').each(function (_, a) {
            var href = $(a).attr('href') || '', text = $(a).text().trim()
            var m = href.match(/[/-](\d+)\.html/)
            if (m) { var p = parseInt(m[1]); if (p > maxPage) maxPage = p }
            var qm = href.match(/[?&]page=(\d+)/)
            if (qm) { var p2 = parseInt(qm[1]); if (p2 > maxPage) maxPage = p2 }
            if (/^\d+$/.test(text)) { var p3 = parseInt(text); if (p3 > maxPage) maxPage = p3 }
        })
        pagecount = maxPage
        var pt = $pagination.text(), tm = pt.match(/共\s*(\d+)\s*[页条]/)
        if (tm) { var tp = parseInt(tm[1]); if (tp > pagecount) pagecount = tp }
    }
    if (pagecount === 0) pagecount = currentPage
    return pagecount
}

// ============ getCards with URL-format fallback ============
async function getCards(ext) {
    ext = argsify(ext)
    var cards = [], id = ext.id, page = ext.page || 1, filters = ext.filters || {}
    try {
        var primaryUrl = id > 0 ? buildFilterUrl(id, page, filters) : SITE + '/'
        var data = await fetchPage(primaryUrl)
        var $ = null
        if (data) {
            $ = cheerio.load(data)
            cards = parseVideoCards($, null)
        }
        // FIX R5-3: alt URL now uses buildFilterUrl with /index.php prefix (consistent encoding)
        if (id > 0 && cards.length === 0) {
            var altUrl = buildFilterUrl(id, page, filters, '/index.php')
            var altData = await fetchPage(altUrl)
            if (altData) {
                $ = cheerio.load(altData)
                var altCards = parseVideoCards($, null)
                if (altCards.length > 0) { cards = altCards; data = altData }
            }
        }
        if (!data && cards.length === 0) return jsonify({ list:[], page:page, pagecount:0, limit:20, total:0, filter: id>0?(filterList[id]||[]):[] })
        var pagecount = $ ? extractPageCount($, page) : page
        var limit = 20, total = pagecount * limit
        return jsonify({ list:cards, page:page, pagecount:pagecount, limit:limit, total:total, filter: id>0?(filterList[id]||[]):[] })
    } catch (e) { $print('getCards error: ' + e); return jsonify({ list:[], page:page, pagecount:0, limit:20, total:0, filter:[] }) }
}

async function category(ext) { return getCards(ext) }

// ============ getTracks (old convention) ============
async function getTracks(ext) {
    ext = argsify(ext)
    var url = ext.url || ''
    try {
        var data = await fetchPage(url)
        if (!data) return jsonify({ list: [] })
        var $ = cheerio.load(data)
        var groups = _fetchDetailGroups($)
        return jsonify({ list: groups })
    } catch (e) { $print('getTracks error: ' + e); return jsonify({ list: [] }) }
}

// ============ detail (new convention) ============
async function detail(ext) {
    ext = argsify(ext)
    var url = ext.url || ''
    try {
        var data = await fetchPage(url)
        if (!data) return jsonify({ list: [] })
        var $ = cheerio.load(data)
        var meta = extractVideoMeta($)
        var groups = _fetchDetailGroups($)
        var playlist = []
        for (var g = 0; g < groups.length; g++) {
            var tracks = groups[g].tracks || []
            var urlsParts = []
            for (var t = 0; t < tracks.length; t++) {
                var epName = (tracks[t].name || '').replace(/[$#]/g, ' ')
                urlsParts.push(epName + '$' + (tracks[t].url || ''))
            }
            playlist.push({ name: groups[g].title || ('线路' + (g+1)), urls: urlsParts.join('#') })
        }
        var result = {
            vod_id: ext.vod_id || url,
            vod_name: meta.vod_name, vod_pic: meta.vod_pic, vod_content: meta.vod_content,
            vod_actor: meta.vod_actor, vod_director: meta.vod_director,
            vod_year: meta.vod_year, vod_area: meta.vod_area, vod_remarks: meta.vod_remarks,
            playlist: playlist,
        }
        return jsonify({ list: [result] })
    } catch (e) { $print('detail error: ' + e); return jsonify({ list: [] }) }
}

// ============ Play URL extraction ============
function extractPlayUrl(data) {
    if (!data) return ''
    var directMatch = data.match(/(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|flv|ts)[^\s"'<>]*)/i)
    if (directMatch) return directMatch[1]
    var playerVarMatch = data.match(/(?:var\s+)?player_\w+\s*=\s*(\{)/)
    if (playerVarMatch) {
        var startIdx = data.indexOf('{', playerVarMatch.index)
        if (startIdx >= 0) {
            var depth = 0, inStr = false, strChar = '', endIdx = -1
            for (var i = startIdx; i < data.length && i < startIdx + 50000; i++) {
                var ch = data[i]
                if (inStr) { if (ch === '\\') { i++; continue } if (ch === strChar) inStr = false }
                else { if (ch === '"'||ch === "'") { inStr = true; strChar = ch } else if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { endIdx = i; break } } }
            }
            if (endIdx > startIdx) {
                var jsonStr = data.substring(startIdx, endIdx + 1)
                try { var config = JSON.parse(jsonStr); if (config.url) return config.url; if (config.vod_url) return config.vod_url; if (config.playurl) return config.playurl }
                catch (e) { var um = jsonStr.match(/["'](?:url|vod_url|playurl|src)["']\s*:\s*["']([^"']+)["']/i); if (um) return um[1] }
            }
        }
    }
    var kvMatch = data.match(/["']?(?:url|vod_url|playurl|src|video_url)["']?\s*[:=]\s*["']([^"']+)["']/i)
    if (kvMatch) return kvMatch[1]
    return ''
}

// ============ getPlayinfo (handles ext as string or object) ============
async function getPlayinfo(ext) {
    ext = argsify(ext)
    var url = ''
    if (typeof ext === 'string') url = ext
    else if (ext) url = ext.url || ext.vod_url || ''
    if (!url) return jsonify({ urls: [], url: '' })
    try {
        var data = await fetchPage(url, { headers: { 'Referer': SITE + '/' } })
        if (!data) return jsonify({ urls: [], url: '' })
        var playUrl = extractPlayUrl(data)
        if (playUrl) {
            if (playUrl.indexOf('http') !== 0) { try { var d = atob(playUrl); if (d.indexOf('http')===0) playUrl = d } catch(e){} }
            if (playUrl.indexOf('http') !== 0) { try { var d2 = decodeURIComponent(playUrl); if (d2.indexOf('http')===0) playUrl = d2 } catch(e){} }
            playUrl = resolveUrl(playUrl)
            return jsonify({ url: playUrl, urls: [playUrl], headers: { 'Referer': SITE + '/', 'User-Agent': UA } })
        }
        $print('No stream URL: ' + url)
    } catch (e) { $print('getPlayinfo error: ' + e) }
    return jsonify({ urls: [], url: '' })
}

async function play(ext) { return getPlayinfo(ext) }

// ============ FIX R5-2: search keyword supports text/wd/keyword ============
async function search(ext) {
    ext = argsify(ext)
    var cards = []
    var keyword = ext.text || ext.wd || ext.keyword || ''
    var page = ext.page || 1
    if (!keyword) return jsonify({ list: [] })
    try {
        var searchUrl = SITE + '/vodsearch/-------------.html?wd=' + encodeURIComponent(keyword)
        if (page > 1) searchUrl += '&page=' + page
        var data = await fetchPage(searchUrl, { headers: { 'Referer': SITE + '/' } })
        var lower = (data || '').toLowerCase()
        if (!data || lower.indexOf('<body') < 0 || lower.indexOf('</body>') < 0) {
            var altUrl = SITE + '/index.php/vodsearch/-------------.html?wd=' + encodeURIComponent(keyword)
            if (page > 1) altUrl += '&page=' + page
            var altData = await fetchPage(altUrl, { headers: { 'Referer': SITE + '/' } })
            if (altData) data = altData
        }
        if (!data) return jsonify({ list: [] })
        var $ = cheerio.load(data)
        cards = parseVideoCards($, null)
    } catch (e) { $print('search error: ' + e) }
    return jsonify({ list: cards })
}
