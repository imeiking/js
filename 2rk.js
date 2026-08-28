// XPTV Spider for 2rk.cc
const cheerio = createCheerio()
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const SITE = 'https://www.2rk.cc'

const appConfig = {
    ver: 20260828,
    title: '2rk影视',
    site: SITE,
    tabs: [
        { name: '电影', ext: { id: 1 } },
        { name: '电视剧', ext: { id: 2 } },
        { name: '综艺', ext: { id: 3 } },
        { name: '动漫', ext: { id: 4 } },
    ],
}

var filterList = {
    1: [
        { key: 'class', name: '类型', value: [
            {n:'全部',v:''},{n:'动作',v:'动作'},{n:'喜剧',v:'喜剧'},{n:'爱情',v:'爱情'},
            {n:'科幻',v:'科幻'},{n:'恐怖',v:'恐怖'},{n:'剧情',v:'剧情'},{n:'犯罪',v:'犯罪'},
            {n:'悬疑',v:'悬疑'},{n:'战争',v:'战争'},{n:'动画',v:'动画'},{n:'奇幻',v:'奇幻'},
            {n:'冒险',v:'冒险'},{n:'惊悚',v:'惊悚'},{n:'武侠',v:'武侠'},{n:'历史',v:'历史'},
            {n:'其他',v:'其他'},
        ]},
        { key: 'area', name: '地区', value: [
            {n:'全部',v:''},{n:'大陆',v:'大陆'},{n:'香港',v:'香港'},{n:'台湾',v:'台湾'},
            {n:'日本',v:'日本'},{n:'韩国',v:'韩国'},{n:'欧美',v:'欧美'},{n:'美国',v:'美国'},
            {n:'英国',v:'英国'},{n:'印度',v:'印度'},{n:'泰国',v:'泰国'},{n:'其他',v:'其他'},
        ]},
        { key: 'year', name: '年份', value: [
            {n:'全部',v:''},{n:'2026',v:'2026'},{n:'2025',v:'2025'},{n:'2024',v:'2024'},
            {n:'2023',v:'2023'},{n:'2022',v:'2022'},{n:'2021',v:'2021'},{n:'2020',v:'2020'},
            {n:'2019',v:'2019'},{n:'2018',v:'2018'},{n:'2017',v:'2017'},{n:'2016',v:'2016'},
        ]},
        { key: 'order', name: '排序', value: [
            {n:'最新',v:'time'},{n:'最热',v:'hits'},{n:'评分',v:'score'},
        ]},
    ],
    2: [
        { key: 'class', name: '类型', value: [
            {n:'全部',v:''},{n:'国产剧',v:'国产剧'},{n:'香港剧',v:'香港剧'},{n:'台湾剧',v:'台湾剧'},
            {n:'日本剧',v:'日本剧'},{n:'韩国剧',v:'韩国剧'},{n:'欧美剧',v:'欧美剧'},{n:'其他',v:'其他'},
        ]},
        { key: 'area', name: '地区', value: [
            {n:'全部',v:''},{n:'大陆',v:'大陆'},{n:'香港',v:'香港'},{n:'台湾',v:'台湾'},
            {n:'日本',v:'日本'},{n:'韩国',v:'韩国'},{n:'欧美',v:'欧美'},{n:'其他',v:'其他'},
        ]},
        { key: 'year', name: '年份', value: [
            {n:'全部',v:''},{n:'2026',v:'2026'},{n:'2025',v:'2025'},{n:'2024',v:'2024'},
            {n:'2023',v:'2023'},{n:'2022',v:'2022'},{n:'2021',v:'2021'},{n:'2020',v:'2020'},
        ]},
        { key: 'order', name: '排序', value: [
            {n:'最新',v:'time'},{n:'最热',v:'hits'},{n:'评分',v:'score'},
        ]},
    ],
    3: [
        { key: 'class', name: '类型', value: [
            {n:'全部',v:''},{n:'大陆综艺',v:'大陆综艺'},{n:'港台综艺',v:'港台综艺'},
            {n:'日韩综艺',v:'日韩综艺'},{n:'欧美综艺',v:'欧美综艺'},{n:'其他',v:'其他'},
        ]},
        { key: 'area', name: '地区', value: [
            {n:'全部',v:''},{n:'大陆',v:'大陆'},{n:'香港',v:'香港'},{n:'台湾',v:'台湾'},
            {n:'日本',v:'日本'},{n:'韩国',v:'韩国'},{n:'欧美',v:'欧美'},{n:'其他',v:'其他'},
        ]},
        { key: 'year', name: '年份', value: [
            {n:'全部',v:''},{n:'2026',v:'2026'},{n:'2025',v:'2025'},{n:'2024',v:'2024'},
            {n:'2023',v:'2023'},{n:'2022',v:'2022'},{n:'2021',v:'2021'},{n:'2020',v:'2020'},
        ]},
        { key: 'order', name: '排序', value: [
            {n:'最新',v:'time'},{n:'最热',v:'hits'},{n:'评分',v:'score'},
        ]},
    ],
    4: [
        { key: 'class', name: '类型', value: [
            {n:'全部',v:''},{n:'国产动漫',v:'国产动漫'},{n:'日本动漫',v:'日本动漫'},
            {n:'欧美动漫',v:'欧美动漫'},{n:'其他动漫',v:'其他动漫'},
        ]},
        { key: 'area', name: '地区', value: [
            {n:'全部',v:''},{n:'大陆',v:'大陆'},{n:'日本',v:'日本'},{n:'欧美',v:'欧美'},{n:'其他',v:'其他'},
        ]},
        { key: 'year', name: '年份', value: [
            {n:'全部',v:''},{n:'2026',v:'2026'},{n:'2025',v:'2025'},{n:'2024',v:'2024'},
            {n:'2023',v:'2023'},{n:'2022',v:'2022'},{n:'2021',v:'2021'},{n:'2020',v:'2020'},
        ]},
        { key: 'order', name: '排序', value: [
            {n:'最新',v:'time'},{n:'最热',v:'hits'},{n:'评分',v:'score'},
        ]},
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

function resolveUrl(href) {
    if (!href || href === '#' || href.indexOf('javascript:') === 0) return ''
    if (href.startsWith('http')) return href
    if (href.startsWith('//')) return 'https:' + href
    while (href.startsWith('./')) href = href.substring(2)
    while (href.startsWith('../')) href = href.substring(3)
    if (!href) return ''
    if (href.startsWith('/')) return SITE + href
    return SITE + '/' + href
}

async function fetchPage(url) {
    try {
        var resp = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Referer': SITE,
            }
        })
        return resp.data || resp.body || ''
    } catch (e) {
        $print('fetch error: ' + e)
        return ''
    }
}

// ============ getCards ============
async function getCards(ext) {
    ext = argsify(ext)
    var cards = []
    var id = ext.id
    var page = ext.page || 1
    var filters = ext.filters || {}

    var c = filters.class || ''
    var a = filters.area || ''
    var y = filters.year || ''
    var o = filters.order || ''

    var url = SITE + '/vodshow/' + id + '-' + c + '-' + a + '--' + y + '--' + o + '-' + page + '.html'
    var data = await fetchPage(url)

    if (data) {
        var $ = cheerio.load(data)

        // stui template
        $('.stui-vodlist__box').each(function (_, el) {
            var $el = $(el)
            var $link = $el.is('a') ? $el : $el.find('a').first()
            var path = $link.attr('href') || ''
            if (!path || path === '#' || path.indexOf('javascript:') === 0) return
            var title = $link.attr('title') || $el.find('.title,.name,h4,h3').first().text().trim() || $link.text().trim()
            if (!title) return
            var pic = $link.attr('data-original') || $link.attr('data-src') || ''
            if (!pic) {
                var $img = $el.find('img').first()
                pic = $img.attr('data-original') || $img.attr('data-src') || $img.attr('src') || ''
            }
            var remark = $el.find('.pic-text,.remarks,.note,.tag,.text-right').first().text().trim()
            cards.push({
                vod_id: path,
                vod_name: title,
                vod_pic: pic,
                vod_remarks: remark,
                ext: { url: resolveUrl(path) },
            })
        })

        // myui template fallback
        if (cards.length === 0) {
            $('a.myui-vodlist__thumb').each(function (_, el) {
                var $link = $(el)
                var path = $link.attr('href') || ''
                if (!path || path === '#' || path.indexOf('javascript:') === 0) return
                var title = $link.attr('title') || ''
                if (!title) return
                var pic = $link.attr('data-original') || $link.attr('data-src') || ''
                var remark = $link.find('.pic-text,.text-right').first().text().trim()
                cards.push({
                    vod_id: path,
                    vod_name: title,
                    vod_pic: pic,
                    vod_remarks: remark,
                    ext: { url: resolveUrl(path) },
                })
            })
        }

        // generic fallback
        if (cards.length === 0) {
            $('.module-item,.video-item,.vodlist-item').each(function (_, el) {
                var $el = $(el)
                var $link = $el.is('a') ? $el : $el.find('a').first()
                var path = $link.attr('href') || ''
                if (!path || path === '#' || path.indexOf('javascript:') === 0) return
                var title = $link.attr('title') || $el.find('.title,.name,h4,h3').first().text().trim() || $link.text().trim()
                if (!title) return
                var $img = $el.find('img').first()
                var pic = $link.attr('data-original') || $img.attr('data-original') || $img.attr('data-src') || $img.attr('src') || ''
                var remark = $el.find('.pic-text,.remarks,.note,.tag,.text-right').first().text().trim()
                cards.push({
                    vod_id: path,
                    vod_name: title,
                    vod_pic: pic,
                    vod_remarks: remark,
                    ext: { url: resolveUrl(path) },
                })
            })
        }
    }

    return jsonify({
        list: cards,
        filter: filterList[id] || [],
    })
}

// ============ getTracks ============
async function getTracks(ext) {
    ext = argsify(ext)
    var url = ext.url
    var groups = []

    var data = await fetchPage(url)
    if (data) {
        var $ = cheerio.load(data)

        // stui template
        $('.stui-content__playlist').each(function (idx, el) {
            var tracks = []
            $(el).find('a').each(function (_, ep) {
                var p = $(ep).attr('href') || ''
                if (!p || p === '#' || p.indexOf('javascript:') === 0) return
                var name = $(ep).text().trim()
                if (!name) return
                tracks.push({ name: name, pan: '', ext: { url: resolveUrl(p) } })
            })
            if (tracks.length > 0) groups.push({ title: '线路' + (idx + 1), tracks: tracks })
        })

        // myui template #playlist1~5
        if (groups.length === 0) {
            for (var i = 1; i <= 5; i++) {
                var $pl = $('#playlist' + i)
                if ($pl.length === 0) continue
                var tracks = []
                $pl.find('a').each(function (_, ep) {
                    var p = $(ep).attr('href') || ''
                    if (!p || p === '#' || p.indexOf('javascript:') === 0) return
                    var name = $(ep).text().trim()
                    if (!name) return
                    tracks.push({ name: name, pan: '', ext: { url: resolveUrl(p) } })
                })
                if (tracks.length > 0) groups.push({ title: '线路' + i, tracks: tracks })
            }
        }

        // myui alternative
        if (groups.length === 0) {
            $('.myui-content__list').each(function (idx, el) {
                var tracks = []
                $(el).find('a').each(function (_, ep) {
                    var p = $(ep).attr('href') || ''
                    if (!p || p === '#' || p.indexOf('javascript:') === 0) return
                    var name = $(ep).text().trim()
                    if (!name) return
                    tracks.push({ name: name, pan: '', ext: { url: resolveUrl(p) } })
                })
                if (tracks.length > 0) groups.push({ title: '线路' + (idx + 1), tracks: tracks })
            })
        }

        // generic fallback
        if (groups.length === 0) {
            var seen = {}
            var tracks = []
            $('a[href*="vodplay"],a[href*="/play/"]').each(function (_, ep) {
                var p = $(ep).attr('href') || ''
                if (!p || p === '#' || seen[p]) return
                seen[p] = true
                var name = $(ep).text().trim() || '播放'
                tracks.push({ name: name, pan: '', ext: { url: resolveUrl(p) } })
            })
            if (tracks.length > 0) groups.push({ title: '在线', tracks: tracks })
        }
    }

    return jsonify({ list: groups })
}

// ============ base64 decode ============
function base64decode(str) {
    try {
        return atob(str)
    } catch (e) {
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
        var out = '', c1, c2, c3, c4, i = 0
        str = str.replace(/[^A-Za-z0-9+/=]/g, '')
        while (i < str.length) {
            c1 = chars.indexOf(str.charAt(i++))
            c2 = chars.indexOf(str.charAt(i++))
            c3 = chars.indexOf(str.charAt(i++))
            c4 = chars.indexOf(str.charAt(i++))
            out += String.fromCharCode((c1 << 2) | (c2 >> 4))
            if (c3 !== 64) out += String.fromCharCode(((c2 & 15) << 4) | (c3 >> 2))
            if (c4 !== 64) out += String.fromCharCode(((c3 & 3) << 6) | c4)
        }
        try { return decodeURIComponent(escape(out)) } catch (e2) { return out }
    }
}

// ============ getPlayinfo ============
async function getPlayinfo(ext) {
    ext = argsify(ext)
    var url = ext.url
    if (!url) return jsonify({ urls: [] })

    var data = await fetchPage(url)
    if (!data) return jsonify({ urls: [] })

    // MacCMS player config
    var match = data.match(/var\s+player_data\s*=\s*({[\s\S]*?})\s*<\/script>/)
    if (!match) {
        match = data.match(/var\s+player_\w+\s*=\s*({[\s\S]*?})\s*<\/script>/)
    }
    if (!match) {
        match = data.match(/var\s+player_\w+\s*=\s*({[\s\S]*?})\s*[;\n]/)
    }

    if (match) {
        var obj
        try {
            obj = JSON.parse(match[1])
        } catch (e) {
            $print('player JSON parse error: ' + e)
            return jsonify({ urls: [] })
        }

        var player = obj.url || ''

        if (obj.encrypt == 1) {
            player = unescape(player)
        } else if (obj.encrypt == 2) {
            player = unescape(base64decode(player))
        } else if (obj.encrypt == 3) {
            player = player.substring(8)
            player = base64decode(player)
            player = player.substring(8, player.length - 8)
        }

        if (player) {
            if (player.startsWith('//')) player = 'https:' + player
            else if (player.startsWith('/')) player = SITE + player
            else if (player.indexOf('http') !== 0) player = SITE + '/' + player
        }

        var result = { urls: [player] }
        if (obj.url_next) {
            var nextUrl = obj.url_next
            if (obj.encrypt == 2) nextUrl = unescape(base64decode(nextUrl))
            result.next = nextUrl
        }
        return jsonify(result)
    }

    // fallback: direct stream URL
    var direct = data.match(/(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|flv)[^\s"'<>]*)/i)
    if (direct) {
        return jsonify({ urls: [direct[1]] })
    }

    return jsonify({ urls: [] })
}

// ============ search ============
async function search(ext) {
    ext = argsify(ext)
    var cards = []
    var keyword = ext.text || ext.wd || ''
    var page = ext.page || 1
    if (!keyword) return jsonify({ list: [] })

    var text = encodeURIComponent(keyword)
    var url = SITE + '/vodsearch/-------------.html?wd=' + text + '&submit='
    if (page > 1) url += '&page=' + page

    var data = await fetchPage(url)
    if (data) {
        var $ = cheerio.load(data)

        // stui template
        $('.stui-vodlist__box').each(function (_, el) {
            var $el = $(el)
            var $link = $el.is('a') ? $el : $el.find('a').first()
            var path = $link.attr('href') || ''
            if (!path || path === '#' || path.indexOf('javascript:') === 0) return
            var title = $link.attr('title') || $el.find('.title,.name,h4,h3').first().text().trim()
            if (!title) return
            var pic = $link.attr('data-original') || $link.attr('data-src') || ''
            if (!pic) {
                var $img = $el.find('img').first()
                pic = $img.attr('data-original') || $img.attr('data-src') || $img.attr('src') || ''
            }
            var remark = $el.find('.pic-text,.remarks,.note,.tag,.text-right').first().text().trim()
            cards.push({
                vod_id: path,
                vod_name: title,
                vod_pic: pic,
                vod_remarks: remark,
                ext: { url: resolveUrl(path) },
            })
        })

        // myui template
        if (cards.length === 0) {
            $('a.myui-vodlist__thumb').each(function (_, el) {
                var $link = $(el)
                var path = $link.attr('href') || ''
                if (!path || path === '#' || path.indexOf('javascript:') === 0) return
                var title = $link.attr('title') || ''
                if (!title) return
                var pic = $link.attr('data-original') || ''
                var remark = $link.find('.pic-text,.text-right').first().text().trim()
                cards.push({
                    vod_id: path,
                    vod_name: title,
                    vod_pic: pic,
                    vod_remarks: remark,
                    ext: { url: resolveUrl(path) },
                })
            })
        }
    }

    return jsonify({ list: cards })
}
