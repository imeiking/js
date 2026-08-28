// XPTV Spider for ncat21.com (网飞猫)
// Type 3 JavaScript spider

const cheerio = createCheerio()
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const SITE = 'https://www.ncat21.com'
const IMG_CDN = 'https://vres.zyxpedu.com'

// ============ Extension Info ============
async function getLocalInfo() {
    return jsonify({
        name: '网飞猫',
        ver: '20260827',
        type: 3,
        api: 'ncat21',
        description: '网飞猫影视源 (带筛选)',
    })
}

// ============ Compact SHA1 implementation ============
function sha1Bytes(str) {
    function rotl(n, s) { return (n << s) | (n >>> (32 - s)) }
    function cvtHex(val) {
        var str = ''
        for (var i = 7; i >= 0; i--) {
            var v = (val >>> (i * 4)) & 0x0f
            str += v.toString(16)
        }
        return str
    }
    var blockstart, i, j, W = new Array(80), H0 = 0x67452301, H1 = 0xEFCDAB89, H2 = 0x98BADCFE, H3 = 0x10325476, H4 = 0xC3D2E1F0, A, B, C, D, E, temp
    str = unescape(encodeURIComponent(str))
    var strLen = str.length
    var wordArray = []
    for (i = 0; i < strLen - 3; i += 4) {
        wordArray.push((str.charCodeAt(i) << 24) | (str.charCodeAt(i + 1) << 16) | (str.charCodeAt(i + 2) << 8) | str.charCodeAt(i + 3))
    }
    switch (strLen % 4) {
        case 0: i = 0x080000000; break
        case 1: i = (str.charCodeAt(strLen - 1) << 24) | 0x0800000; break
        case 2: i = (str.charCodeAt(strLen - 2) << 24) | (str.charCodeAt(strLen - 1) << 16) | 0x08000; break
        case 3: i = (str.charCodeAt(strLen - 3) << 24) | (str.charCodeAt(strLen - 2) << 16) | (str.charCodeAt(strLen - 1) << 8) | 0x80; break
    }
    wordArray.push(i)
    while (wordArray.length % 16 != 14) wordArray.push(0)
    wordArray.push(strLen >>> 29)
    wordArray.push((strLen << 3) & 0x0ffffffff)
    for (blockstart = 0; blockstart < wordArray.length; blockstart += 16) {
        for (i = 0; i < 16; i++) W[i] = wordArray[blockstart + i]
        for (i = 16; i < 80; i++) W[i] = rotl(W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16], 1)
        A = H0; B = H1; C = H2; D = H3; E = H4
        for (i = 0; i < 80; i++) {
            if (i < 20) { temp = (((B & C) | ((~B) & D)) + 0x5A827999) | 0 }
            else if (i < 40) { temp = ((B ^ C ^ D) + 0x6ED9EBA1) | 0 }
            else if (i < 60) { temp = (((B & C) | (B & D) | (C & D)) + 0x8F1BBCDC) | 0 }
            else { temp = ((B ^ C ^ D) + 0xCA62C1D6) | 0 }
            temp = (rotl(A, 5) + temp + E + W[i]) | 0
            E = D; D = C; C = rotl(B, 30); B = A; A = temp
        }
        H0 = (H0 + A) & 0x0ffffffff
        H1 = (H1 + B) & 0x0ffffffff
        H2 = (H2 + C) & 0x0ffffffff
        H3 = (H3 + D) & 0x0ffffffff
        H4 = (H4 + E) & 0x0ffffffff
    }
    var hex = cvtHex(H0) + cvtHex(H1) + cvtHex(H2) + cvtHex(H3) + cvtHex(H4)
    var bytes = []
    for (var k = 0; k < hex.length; k += 2) bytes.push(parseInt(hex.substr(k, 2), 16))
    return bytes
}

// ============ CDN Challenge Solver ============
var cachedCookie = null

function solveCdnChallenge(html) {
    var match = html.match(/const\s+a0_0x2a54\s*=\s*\[([^\]]+)\]/)
    if (!match) return null

    var parts = match[1].split(',').map(function (s) {
        return s.trim().replace(/^['"]|['"]$/g, '')
    })

    var challengeStr = null
    for (var i = 0; i < parts.length; i++) {
        if (/^[0-9A-F]{40}$/.test(parts[i])) {
            challengeStr = parts[i]
            break
        }
    }
    if (!challengeStr) return null

    var n1 = parseInt(challengeStr[0], 16)

    for (var i = 0; i < 500000; i++) {
        var hash = sha1Bytes(challengeStr + i)
        if (hash[n1] === 0xb0 && hash[n1 + 1] === 0x0b) {
            return 'cdndefend_js_cookie=' + challengeStr + i
        }
    }
    return null
}

// ============ HTTP helper with CDN handling ============
async function fetchPage(url, opts) {
    opts = opts || {}
    var headers = Object.assign({
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    }, opts.headers || {})

    if (cachedCookie) {
        headers['Cookie'] = cachedCookie
    }

    var resp = await $fetch.get(url, { headers: headers })
    var data = resp.data

    if (data && data.indexOf('Protected by cdndefend') >= 0) {
        var cookie = solveCdnChallenge(data)
        if (cookie) {
            cachedCookie = cookie
            headers['Cookie'] = cookie
            resp = await $fetch.get(url, { headers: headers })
            data = resp.data
        }
    }

    return data
}

// ============ Image URL helper ============
function resolveImg(src) {
    if (!src) return ''
    if (src.startsWith('http')) return src
    if (src.startsWith('//')) return 'https:' + src
    if (src.startsWith('/')) return IMG_CDN + src
    return IMG_CDN + '/' + src
}

// ============ Filter Definitions ============
const movieFilters = [
    {
        key: 'class',
        name: '类型',
        value: [
            { n: '全部', v: '' },
            { n: '动作', v: '动作' },
            { n: '喜剧', v: '喜剧' },
            { n: '爱情', v: '爱情' },
            { n: '科幻', v: '科幻' },
            { n: '恐怖', v: '恐怖' },
            { n: '惊悚', v: '惊悚' },
            { n: '悬疑', v: '悬疑' },
            { n: '犯罪', v: '犯罪' },
            { n: '冒险', v: '冒险' },
            { n: '战争', v: '战争' },
            { n: '奇幻', v: '奇幻' },
            { n: '动画', v: '动画' },
            { n: '剧情', v: '剧情' },
            { n: '武侠', v: '武侠' },
            { n: '纪录', v: '纪录' }
        ]
    },
    {
        key: 'area',
        name: '地区',
        value: [
            { n: '全部', v: '' },
            { n: '大陆', v: '大陆' },
            { n: '香港', v: '香港' },
            { n: '台湾', v: '台湾' },
            { n: '美国', v: '美国' },
            { n: '韩国', v: '韩国' },
            { n: '日本', v: '日本' },
            { n: '法国', v: '法国' },
            { n: '英国', v: '英国' },
            { n: '德国', v: '德国' },
            { n: '泰国', v: '泰国' },
            { n: '印度', v: '印度' },
            { n: '欧洲', v: '欧洲' },
            { n: '其它', v: '其它' }
        ]
    },
    {
        key: 'year',
        name: '年份',
        value: [
            { n: '全部', v: '' },
            { n: '2026', v: '2026' },
            { n: '2025', v: '2025' },
            { n: '2024', v: '2024' },
            { n: '2023', v: '2023' },
            { n: '2022', v: '2022' },
            { n: '2021', v: '2021' },
            { n: '2020', v: '2020' },
            { n: '2019', v: '2019' },
            { n: '2018', v: '2018' },
            { n: '2017', v: '2017' },
            { n: '2016-2010', v: '2016-2010' },
            { n: '2009-2000', v: '2009-2000' },
            { n: '90年代', v: '90年代' },
            { n: '80年代', v: '80年代' },
            { n: '更早', v: '更早' }
        ]
    },
    {
        key: 'by',
        name: '排序',
        value: [
            { n: '最新', v: 'time' },
            { n: '人气', v: 'hits' },
            { n: '评分', v: 'score' }
        ]
    }
]

const tvFilters = [
    {
        key: 'class',
        name: '类型',
        value: [
            { n: '全部', v: '' },
            { n: '国产剧', v: '国产剧' },
            { n: '港台剧', v: '港台剧' },
            { n: '日韩剧', v: '日韩剧' },
            { n: '欧美剧', v: '欧美剧' },
            { n: '海外剧', v: '海外剧' },
            { n: '古装', v: '古装' },
            { n: '战争', v: '战争' },
            { n: '偶像', v: '偶像' },
            { n: '悬疑', v: '悬疑' },
            { n: '犯罪', v: '犯罪' },
            { n: '家庭', v: '家庭' },
            { n: '科幻', v: '科幻' }
        ]
    },
    {
        key: 'area',
        name: '地区',
        value: [
            { n: '全部', v: '' },
            { n: '大陆', v: '大陆' },
            { n: '香港', v: '香港' },
            { n: '台湾', v: '台湾' },
            { n: '韩国', v: '韩国' },
            { n: '日本', v: '日本' },
            { n: '美国', v: '美国' },
            { n: '英国', v: '英国' },
            { n: '泰国', v: '泰国' }
        ]
    },
    {
        key: 'year',
        name: '年份',
        value: [
            { n: '全部', v: '' },
            { n: '2026', v: '2026' },
            { n: '2025', v: '2025' },
            { n: '2024', v: '2024' },
            { n: '2023', v: '2023' },
            { n: '2022', v: '2022' },
            { n: '2021', v: '2021' },
            { n: '2020', v: '2020' },
            { n: '2019', v: '2019' },
            { n: '2018', v: '2018' },
            { n: '2017', v: '2017' },
            { n: '更早', v: '更早' }
        ]
    },
    {
        key: 'by',
        name: '排序',
        value: [
            { n: '最新', v: 'time' },
            { n: '人气', v: 'hits' },
            { n: '评分', v: 'score' }
        ]
    }
]

const animeFilters = [
    {
        key: 'class',
        name: '类型',
        value: [
            { n: '全部', v: '' },
            { n: '热血', v: '热血' },
            { n: '搞笑', v: '搞笑' },
            { n: '冒险', v: '冒险' },
            { n: '科幻', v: '科幻' },
            { n: '战斗', v: '战斗' },
            { n: '后宫', v: '后宫' },
            { n: '日常', v: '日常' },
            { n: '治愈', v: '治愈' },
            { n: '泡面', v: '泡面' },
            { n: '恋爱', v: '恋爱' }
        ]
    },
    {
        key: 'area',
        name: '地区',
        value: [
            { n: '全部', v: '' },
            { n: '大陆', v: '大陆' },
            { n: '日本', v: '日本' },
            { n: '欧美', v: '欧美' },
            { n: '其它', v: '其它' }
        ]
    },
    {
        key: 'year',
        name: '年份',
        value: [
            { n: '全部', v: '' },
            { n: '2026', v: '2026' },
            { n: '2025', v: '2025' },
            { n: '2024', v: '2024' },
            { n: '2023', v: '2023' },
            { n: '2022', v: '2022' },
            { n: '2021', v: '2021' },
            { n: '2020', v: '2020' },
            { n: '更早', v: '更早' }
        ]
    },
    {
        key: 'by',
        name: '排序',
        value: [
            { n: '最新', v: 'time' },
            { n: '人气', v: 'hits' },
            { n: '评分', v: 'score' }
        ]
    }
]

// ============ Site Config ============
const appConfig = {
    ver: 20260827,
    title: '网飞猫',
    site: SITE,
    tabs: [
        { name: '电影', ext: { id: 1, filter: movieFilters } },
        { name: '连续剧', ext: { id: 2, filter: tvFilters } },
        { name: '动漫', ext: { id: 3, filter: animeFilters } },
        { name: '综艺纪录', ext: { id: 4, filter: tvFilters } },
        { name: '短剧', ext: { id: 6, filter: tvFilters } },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

// ============ Get video list (with filter/pagination support) ============
async function getCards(ext) {
    ext = argsify(ext)
    var cards = []
    var id = ext.id || 1
    var page = ext.page || 1

    var filterClass = ext.class || ''
    var filterArea = ext.area || ''
    var filterYear = ext.year || ''
    var filterBy = ext.by || 'time'

    try {
        // MacCMS / standard CMS route: /show/{id}-{area}-{by}-{class}-{lang}-{letter}---{page}---{year}.html
        var url = SITE + '/channel/' + id + (page > 1 ? '-' + page : '') + '.html'
        if (filterClass || filterArea || filterYear || (filterBy && filterBy !== 'time')) {
            url = SITE + '/show/' + id + '-' + encodeURIComponent(filterArea) + '-' + encodeURIComponent(filterBy) + '-' + encodeURIComponent(filterClass) + '---' + page + '---' + encodeURIComponent(filterYear) + '.html'
        }

        var data = await fetchPage(url)
        if (!data) return jsonify({ list: [] })

        var $ = cheerio.load(data)

        $('.module-item').each(function (_, element) {
            var $el = $(element)
            var href = $el.find('a.v-item').attr('href')
            var title = ''
            $el.find('.v-item-title').each(function (_, t) {
                var $t = $(t)
                var style = $t.attr('style') || ''
                var text = $t.text().trim()
                if (text && style.indexOf('display: none') < 0 && style.indexOf('display:none') < 0 && text.indexOf('可可影视') < 0 && text.indexOf('kekys') < 0) {
                    title = text
                    return false
                }
            })
            if (!title) {
                title = $el.find('.v-item-title').not('[style*="display"]').first().text().trim()
            }
            var cover = ''
            $el.find('.v-item-cover img').each(function (_, img) {
                var src = $(img).attr('data-original') || ''
                var id = $(img).attr('id') || ''
                if (src && id !== 'noneCoverImg' && src.indexOf('logo_placeholder') < 0) {
                    cover = src
                    return false
                }
            })
            if (!cover) {
                cover = $el.find('.v-item-cover img').last().attr('data-original') || ''
            }
            var remark = $el.find('.v-item-bottom span').text().trim()

            if (href && title) {
                var vodId = href.match(/\/detail\/(\d+)\.html/)
                cards.push({
                    vod_id: vodId ? vodId[1] : href,
                    vod_name: title,
                    vod_pic: resolveImg(cover),
                    vod_remarks: remark || '',
                    ext: { url: SITE + href },
                })
            }
        })
    } catch (error) {
        $print('getCards error: ' + error)
    }

    return jsonify({ list: cards })
}

// ============ Get episodes ============
async function getTracks(ext) {
    ext = argsify(ext)
    var tracks = []
    var url = ext.url

    try {
        var data = await fetchPage(url)
        if (!data) return jsonify({ list: [] })

        var $ = cheerio.load(data)

        var sourceNames = []
        $('.source-item').each(function (_, el) {
            var name = $(el).find('.source-item-label').text().trim()
            var sub = $(el).find('.source-item-sublabel').text().trim()
            sourceNames.push(name + (sub ? '(' + sub + ')' : ''))
        })

        var groups = []
        $('.episode-list').each(function (idx, el) {
            var groupTracks = []
            $(el).find('.episode-item').each(function (_, ep) {
                var href = $(ep).attr('href')
                var name = $(ep).find('span').text().trim()
                if (href && name) {
                    groupTracks.push({
                        name: name,
                        pan: '',
                        ext: { url: SITE + href },
                    })
                }
            })
            if (groupTracks.length > 0) {
                var groupName = sourceNames[idx] || ('线路' + (idx + 1))
                groups.push({ title: groupName, tracks: groupTracks })
            }
        })

        if (groups.length === 0) {
            var playHref = $('.play-btn').parent().attr('href')
            if (playHref) {
                groups.push({
                    title: '播放',
                    tracks: [{
                        name: '播放',
                        pan: '',
                        ext: { url: SITE + playHref },
                    }],
                })
            }
        }

        tracks = groups
    } catch (error) {
        $print('getTracks error: ' + error)
    }

    return jsonify({ list: tracks })
}

// ============ Get play URL ============
async function getPlayinfo(ext) {
    ext = argsify(ext)
    var url = ext.url

    try {
        var data = await fetchPage(url, {
            headers: {
                'Referer': SITE + '/',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Upgrade-Insecure-Requests': '1',
            },
        })
        if (!data) return jsonify({ urls: [] })

        var match = data.match(/src\s*:\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/)
        if (match) {
            return jsonify({
                urls: [match[1]],
                headers: [{ 'Referer': SITE + '/' }],
            })
        }

        var playerMatch = data.match(/url\s*:\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/)
        if (playerMatch) {
            return jsonify({
                urls: [playerMatch[1]],
                headers: [{ 'Referer': SITE + '/' }],
            })
        }

        var m3u8Match = data.match(/["'](https?:\/\/[^"']*m3u8[^"']*)["']/)
        if (m3u8Match) {
            return jsonify({
                urls: [m3u8Match[1]],
                headers: [{ 'Referer': SITE + '/' }],
            })
        }

        $print('No stream URL found in play page')
    } catch (error) {
        $print('getPlayinfo error: ' + error)
    }

    return jsonify({ urls: [] })
}

// ============ Search ============
async function search(ext) {
    ext = argsify(ext)
    var cards = []
    var keyword = ext.text || ''
    var page = ext.page || 1

    if (!keyword) return jsonify({ list: [] })

    try {
        var homeData = await fetchPage(SITE + '/')
        var tokenMatch = homeData.match(/name="t"\s+value="([^"]+)"/)
        var token = tokenMatch ? tokenMatch[1] : ''

        var searchUrl = SITE + '/search?t=' + encodeURIComponent(token) + '&k=' + encodeURIComponent(keyword)
        if (page > 1) {
            searchUrl += '&page=' + page
        }

        var data = await fetchPage(searchUrl, {
            headers: {
                'Referer': SITE + '/',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Upgrade-Insecure-Requests': '1',
            },
        })

        if (!data) return jsonify({ list: [] })

        var $ = cheerio.load(data)

        $('.search-result-item').each(function (_, element) {
            var $el = $(element)
            var href = $el.attr('href')
            var title = $el.find('.title').text().trim()
            var cover = $el.find('img').first().attr('data-original')
            var remark = $el.find('.search-result-item-header div').first().text().trim()

            if (href && title) {
                var vodId = href.match(/\/detail\/(\d+)\.html/)
                cards.push({
                    vod_id: vodId ? vodId[1] : href,
                    vod_name: title,
                    vod_pic: resolveImg(cover),
                    vod_remarks: remark || '',
                    ext: { url: SITE + href },
                })
            }
        })
    } catch (error) {
        $print('search error: ' + error)
    }

    return jsonify({ list: cards })
}
