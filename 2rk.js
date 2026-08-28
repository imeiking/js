// XPTV Spider for 2rk.cc - Verified against real XPTV MacCMS example (duboku.js)
const cheerio = createCheerio()
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const SITE = 'https://www.2rk.cc'

const headers = {
    'User-Agent': UA,
    'Referer': SITE,
    'Origin': SITE,
}

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

const filterList = {
    1: [
        { key: 'class', name: '类型', value: [
            {n:'全部',v:''},{n:'动作',v:'动作'},{n:'喜剧',v:'喜剧'},{n:'爱情',v:'爱情'},
            {n:'科幻',v:'科幻'},{n:'恐怖',v:'恐怖'},{n:'剧情',v:'剧情'},{n:'犯罪',v:'犯罪'},
            {n:'悬疑',v:'悬疑'},{n:'战争',v:'战争'},{n:'动画',v:'动画'},{n:'奇幻',v:'奇幻'},
            {n:'冒险',v:'冒险'},{n:'惊悚',v:'惊悚'},{n:'武侠',v:'武侠'},{n:'历史',v:'历史'},
            {n:'传记',v:'传记'},{n:'纪录',v:'纪录'},{n:'家庭',v:'家庭'},{n:'其他',v:'其他'},
        ]},
        { key: 'area', name: '地区', value: [
            {n:'全部',v:''},{n:'大陆',v:'大陆'},{n:'香港',v:'香港'},{n:'台湾',v:'台湾'},
            {n:'日本',v:'日本'},{n:'韩国',v:'韩国'},{n:'欧美',v:'欧美'},{n:'美国',v:'美国'},
            {n:'英国',v:'英国'},{n:'法国',v:'法国'},{n:'德国',v:'德国'},{n:'印度',v:'印度'},
            {n:'泰国',v:'泰国'},{n:'其他',v:'其他'},
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
            {n:'日本剧',v:'日本剧'},{n:'韩国剧',v:'韩国剧'},{n:'欧美剧',v:'欧美剧'},{n:'海外剧',v:'海外剧'},
            {n:'泰国剧',v:'泰国剧'},{n:'其他',v:'其他'},
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

// Extract card data from a link element (works for both stui and myui)
function parseCardFromLink($, $link, $scope) {
    let path = $link.attr('href') || ''
    if (!path || path === '#' || path.indexOf('javascript:') === 0) return null
    let title = $link.attr('title') || ''
    if (!title && $scope) title = $scope.find('.title,.name,h4,h3').first().text().trim()
    if (!title) title = $link.text().trim()
    if (!title) return null
    // FIX: image is on <a data-original> in stui/myui, not <img>
    let pic = $link.attr('data-original') || $link.attr('data-src') || ''
    if (!pic && $scope) {
        let $img = $scope.find('img').first()
        pic = $img.attr('data-original') || $img.attr('data-src') || $img.attr('src') || ''
    }
    let remark = ''
    if ($scope) remark = $scope.find('.pic-text,.remarks,.note,.tag,.text-right').first().text().trim()
    if (!remark) remark = $link.find('.pic-text,.text-right').first().text().trim()
    return {
        vod_id: path,
        vod_name: title,
        vod_pic: pic,
        vod_remarks: remark,
        ext: { url: resolveUrl(path) },
    }
}

// ============ getCards ============
async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let id = ext.id
    let page = ext.page || 1
    let filters = ext.filters || {}

    let c = filters.class || ''
    let a = filters.area || ''
    let y = filters.year || ''
    let o = filters.order || ''

    // stui format: /vodshow/id-class-area-lang-year-letter-order-page.html
    let url = `${SITE}/vodshow/${id}-${c}-${a}--${y}--${o}-${page}.html`

    try {
        const { data } = await $fetch.get(url, { headers })
        const $ = cheerio.load(data)

        // stui template: .stui-vodlist__box
        $('.stui-vodlist__box').each((_, el) => {
            let $el = $(el)
            let $link = $el.is('a') ? $el : $el.find('a').first()
            let card = parseCardFromLink($, $link, $el)
            if (card) cards.push(card)
        })

        // myui template: a.myui-vodlist__thumb
        if (cards.length === 0) {
            $('a.myui-vodlist__thumb').each((_, el) => {
                let card = parseCardFromLink($, $(el), null)
                if (card && !cards.some(c => c.vod_id === card.vod_id)) cards.push(card)
            })
        }

        // generic fallback
        if (cards.length === 0) {
            $('.module-item, .video-item, .vodlist-item').each((_, el) => {
                let $el = $(el)
                let $link = $el.is('a') ? $el : $el.find('a').first()
                let card = parseCardFromLink($, $link, $el)
                if (card) cards.push(card)
            })
        }
    } catch (e) {
        $print('getCards error: ' + e)
    }

    return jsonify({
        list: cards,
        filter: filterList[id] || [],
    })
}

// ============ getTracks ============
async function getTracks(ext) {
    const { url } = argsify(ext)
    let groups = []

    try {
        const { data } = await $fetch.get(url, { headers })
        const $ = cheerio.load(data)

        // stui template
        $('.stui-content__playlist').each((idx, el) => {
            let tracks = []
            $(el).find('a').each((_, ep) => {
                let p = $(ep).attr('href') || ''
                if (!p || p === '#' || p.indexOf('javascript:') === 0) return
                let name = $(ep).text().trim()
                if (!name) return
                tracks.push({ name, pan: '', ext: { url: resolveUrl(p) } })
            })
            if (tracks.length > 0) groups.push({ title: '线路' + (idx + 1), tracks })
        })

        // myui template: #playlist1 ~ #playlist5
        if (groups.length === 0) {
            for (let i = 1; i <= 5; i++) {
                let $pl = $('#playlist' + i)
                if ($pl.length === 0) continue
                let tracks = []
                $pl.find('a').each((_, ep) => {
                    let p = $(ep).attr('href') || ''
                    if (!p || p === '#' || p.indexOf('javascript:') === 0) return
                    let name = $(ep).text().trim()
                    if (!name) return
                    tracks.push({ name, pan: '', ext: { url: resolveUrl(p) } })
                })
                if (tracks.length > 0) groups.push({ title: '线路' + i, tracks })
            }
        }

        // myui alternative
        if (groups.length === 0) {
            $('.myui-content__list').each((idx, el) => {
                let tracks = []
                $(el).find('a').each((_, ep) => {
                    let p = $(ep).attr('href') || ''
                    if (!p || p === '#' || p.indexOf('javascript:') === 0) return
                    let name = $(ep).text().trim()
                    if (!name) return
                    tracks.push({ name, pan: '', ext: { url: resolveUrl(p) } })
                })
                if (tracks.length > 0) groups.push({ title: '线路' + (idx + 1), tracks })
            })
        }

        // generic fallback
        if (groups.length === 0) {
            let seen = {}
            let tracks = []
            $('a[href*="vodplay"], a[href*="/play/"]').each((_, ep) => {
                let p = $(ep).attr('href') || ''
                if (!p || p === '#' || seen[p]) return
                seen[p] = true
                let name = $(ep).text().trim() || '播放'
                tracks.push({ name, pan: '', ext: { url: resolveUrl(p) } })
            })
            if (tracks.length > 0) groups.push({ title: '在线', tracks })
        }
    } catch (e) {
        $print('getTracks error: ' + e)
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
    const { url } = argsify(ext)

    try {
        const { data } = await $fetch.get(url, { headers })

        // MacCMS: var player_data = {...}</script>
        let match = data.match(/var\s+player_data\s*=\s*({[\s\S]*?})\s*<\/script>/)
        if (!match) {
            match = data.match(/var\s+player_\w+\s*=\s*({[\s\S]*?})\s*<\/script>/)
        }
        if (!match) {
            match = data.match(/var\s+player_\w+\s*=\s*({[\s\S]*?})\s*[;\n]/)
        }

        if (match) {
            let obj
            try {
                obj = JSON.parse(match[1])
            } catch (e) {
                $print('player JSON parse error: ' + e)
                return jsonify({ urls: [] })
            }

            let player = obj.url || ''

            if (obj.encrypt == 1) {
                player = unescape(player)
            } else if (obj.encrypt == 2) {
                player = unescape(base64decode(player))
            } else if (obj.encrypt == 3) {
                player = player.substring(8)
                player = base64decode(player)
                player = player.substring(8, player.length - 8)
            }

            // resolve relative/protocol-relative URLs
            if (player) {
                if (player.startsWith('//')) player = 'https:' + player
                else if (player.startsWith('/')) player = SITE + player
                else if (player.indexOf('http') !== 0) player = SITE + '/' + player
            }

            let result = { urls: [player] }
            if (obj.url_next) {
                let nextUrl = obj.url_next
                if (obj.encrypt == 2) nextUrl = unescape(base64decode(nextUrl))
                result.next = nextUrl
            }
            return jsonify(result)
        }

        // fallback: direct m3u8/mp4 URL in page
        let direct = data.match(/(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|flv)[^\s"'<>]*)/i)
        if (direct) {
            return jsonify({ urls: [direct[1]] })
        }
    } catch (e) {
        $print('getPlayinfo error: ' + e)
    }

    return jsonify({ urls: [] })
}

// ============ search ============
async function search(ext) {
    ext = argsify(ext)
    let cards = []
    let text = encodeURIComponent(ext.text || ext.wd || '')
    let page = ext.page || 1
    if (!text) return jsonify({ list: [] })

    try {
        let url = `${SITE}/vodsearch/-------------.html?wd=${text}&submit=`
        if (page > 1) url += `&page=${page}`

        const { data } = await $fetch.get(url, { headers })
        const $ = cheerio.load(data)

        // stui template
        $('.stui-vodlist__box').each((_, el) => {
            let $el = $(el)
            let $link = $el.is('a') ? $el : $el.find('a').first()
            let card = parseCardFromLink($, $link, $el)
            if (card) cards.push(card)
        })

        // myui template
        if (cards.length === 0) {
            $('a.myui-vodlist__thumb').each((_, el) => {
                let card = parseCardFromLink($, $(el), null)
                if (card) cards.push(card)
            })
        }
    } catch (e) {
        $print('search error: ' + e)
    }

    return jsonify({ list: cards })
}
