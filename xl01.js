/*
 * 修罗影视（雪落影视 XLYS，https://v.xl01.cc.ua）—— XPTV (JSC) 点播源【修复版】
 * ----------------------------------------------------------------------
 * 修复点：
 *  1. 删除 getConfig 中错误的 /zzzzz 取 Cookie 逻辑（/zzzzz 是广告 JSON 接口，
 *     不 Set-Cookie，且经常 521；原代码 respHeaders['set-cookie'][0] 会直接崩溃）。
 *     全站列表/详情/播放均无需 Cookie。
 *  2. 修复非筛选标签页：原代码在 getCards 里对新建的 /s/all/{page} 做 replace，
 *     ext.url（美剧/韩剧/动漫等）被完全忽略，所有标签都显示全部内容。
 *  3. 筛选首次加载不再重复请求两次。
 *  4. 筛选 URL 构建：空参数不再以 type=&year=&order= 上送；area 中文值正确编码。
 *  5. 筛选器解析修复：不限项不再产生空 key；key 统一为 cat/type/area/year/order。
 *  6. getPlayinfo：pid 正则加保护；/lines 结果只解析一次；/god 的 POST body
 *     按 application/x-www-form-urlencoded 序列化（原代码直接传对象，JSC 不会
 *     自动转成表单），并加失败兜底。
 *  7. search：去掉站点导航里不存在的 ?code=112；div.row 无标题链接时跳过；
 *     封面兼容 src / data-src。
 * ----------------------------------------------------------------------
 */

const CryptoJS = createCryptoJS()
const cheerio = createCheerio()

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

const appConfig = {
    ver: 20260926,
    title: '修罗影视',
    site: 'https://v.xl01.cc.ua',
    tabs: [
        {
            name: '分类',
            ext: {
                type: 'filter',
                url: '/s/all',
            },
        },
        {
            name: '最新电影',
            ext: {
                url: '/s/all?type=0',
            },
        },
        {
            name: '最新剧集',
            ext: {
                url: '/s/all?type=1',
            },
        },
        {
            name: '欧美剧集',
            ext: {
                url: '/s/meiju',
            },
        },
        {
            name: '日韩剧集',
            ext: {
                url: '/s/hanju',
            },
        },
        {
            name: '港台剧集',
            ext: {
                url: '/s/gangtaiju',
            },
        },
        {
            name: '动漫',
            ext: {
                url: '/s/donghua?type=1',
            },
        },
    ],
}

// 筛选器（进入「分类」标签时由页面解析填充）
let filter = []

// 注意：该站 WAF 对带 Origin 头的 GET 请求直接回 521，故全局不发送 Origin
const headers = {
    Referer: appConfig.site + '/',
    'User-Agent': UA,
}

/* ===================== 工具函数 ===================== */

function httpGet(url, extra) {
    return $fetch.get(url, {
        headers: Object.assign({}, headers, extra || {}),
    })
}

// 把标签 ext.url（可能带 /页码 和 ?query）替换为目标页码
// 站点规范：第 1 页不带页码段（/s/all?type=0），第 N>1 页为 /s/all/N
function withPage(extUrl, page) {
    let base = extUrl
    let qs = ''
    const qi = extUrl.indexOf('?')
    if (qi >= 0) {
        base = extUrl.substring(0, qi)
        qs = extUrl.substring(qi)
    }
    base = base.replace(/\/\d+$/, '')
    if (page > 1) base += '/' + page
    return base + qs
}

// 从已加载的列表页 HTML 解析卡片（站点所有列表页结构一致）
function buildCards($) {
    const cards = []
    $('.movie-card').each((_, each) => {
        const path = $(each).find('a.card-img').attr('href') || $(each).find('a').attr('href')
        if (!path) return
        const img = $(each).find('.card-img img')
        let pic = img.attr('data-src') || img.attr('src') || ''
        // 跳过懒加载占位图
        if (pic.indexOf('data:image/') === 0) {
            pic = img.attr('data-src') || ''
        }
        cards.push({
            vod_id: path,
            vod_name: $(each).find('.card-info > h4').text().trim(),
            vod_pic: pic,
            vod_remarks: $(each).find('.episode-badge').text().trim(),
            ext: {
                url: appConfig.site + path,
            },
        })
    })
    return cards
}

async function extractCards(url) {
    const { data } = await httpGet(url)
    return buildCards(cheerio.load(data))
}

/* ===================== JSC 生命周期 ===================== */

async function getConfig() {
    // 站点无需任何 Cookie / 前置请求
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    const page = ext.page || 1

    try {
        /* ---------- 「分类」筛选标签：首次进入，解析筛选栏 ---------- */
        if (ext.type === 'filter' && !ext.filters) {
            const url = appConfig.site + withPage(ext.url, page)
            const { data } = await httpGet(url)
            const $ = cheerio.load(data)
            const cards = buildCards($)

            filter = []
            $('.xl-compact-filter > dl').each((_, e) => {
                const name = $(e).find('dt').text().replace(/：/g, '').trim()
                const isCategory = name === '影视类型'
                const values = []
                let key = ''

                $(e)
                    .find('dd > a')
                    .each((_, a) => {
                        const subname = $(a).text().trim()
                        const path = $(a).attr('href') || ''
                        let value = ''
                        let currentKey = ''

                        if (isCategory) {
                            currentKey = 'cat'
                            const catPath = path.split('?')[0]
                            value = catPath === '/s/all' ? '' : catPath.replace('/s/', '')
                        } else {
                            const q = path.split('?')[1] || ''
                            const pair = q.split('=')
                            currentKey = pair[0] || ''
                            value = pair[1] || ''
                        }

                        if (subname === '不限') value = ''
                        if (currentKey) key = currentKey
                        values.push({ n: subname, v: value })
                    })

                if (key) {
                    filter.push({
                        name: name,
                        key: key,
                        init: values[0] ? values[0].v : '',
                        value: values,
                    })
                }
            })

            return jsonify({
                list: cards,
                filter: filter,
            })
        }

        /* ---------- 「分类」筛选标签：带筛选条件 ---------- */
        if (ext.type === 'filter' && ext.filters) {
            const f = ext.filters
            const cat = f.cat || 'all'
            const qs = []
            // 仅上送非空参数；area 在筛选器里已是 URL 编码值
            if (f.type) qs.push('type=' + f.type)
            if (f.area) qs.push('area=' + f.area)
            if (f.year) qs.push('year=' + f.year)
            if (f.order) qs.push('order=' + f.order)
            const url =
                appConfig.site +
                '/s/' + cat +
                (page > 1 ? '/' + page : '') +
                (qs.length ? '?' + qs.join('&') : '')
            const cards = await extractCards(url)
            return jsonify({
                list: cards,
                filter: filter,
            })
        }

        /* ---------- 普通标签：严格基于 ext.url 翻页 ---------- */
        const url = appConfig.site + withPage(ext.url, page)
        const cards = await extractCards(url)
        return jsonify({
            list: cards,
        })
    } catch (e) {
        $print('xiuluo getCards error: ' + e)
        return jsonify({
            list: [],
            filter: filter,
        })
    }
}

async function getTracks(ext) {
    ext = argsify(ext)
    const groups = []
    const group = {
        title: '在线',
        tracks: [],
    }

    try {
        const { data } = await httpGet(ext.url)
        const $ = cheerio.load(data)
        $('a.play-item').each((_, each) => {
            const path = $(each).attr('href') || ''
            if (path.startsWith('/play/') || path.startsWith('/guoju/play/')) {
                group.tracks.push({
                    name: $(each).text().trim(),
                    pan: '',
                    ext: {
                        url: appConfig.site + path,
                    },
                })
            }
        })
    } catch (e) {
        $print('xiuluo getTracks error: ' + e)
    }

    groups.push(group)
    return jsonify({ list: groups })
}

async function search(ext) {
    ext = argsify(ext)
    const cards = []
    const page = ext.page || 1
    if (page > 1) return jsonify({ list: cards })

    try {
        const text = encodeURIComponent(ext.text)
        const url = appConfig.site + '/search/' + text
        const { data } = await httpGet(url)
        const $ = cheerio.load(data)
        $('div.row').each((_, each) => {
            const a = $(each).find('a.search-movie-title')
            const href = a.attr('href')
            if (!href) return
            const pic =
                $(each).find('img.object-cover').attr('src') ||
                $(each).find('img.object-cover').attr('data-src') ||
                ''
            cards.push({
                vod_id: href,
                vod_name: a.attr('title') || a.text().trim(),
                vod_pic: pic.indexOf('data:image/') === 0 ? '' : pic,
                vod_remarks: '',
                ext: {
                    url: appConfig.site + href,
                },
            })
        })
    } catch (e) {
        $print('xiuluo search error: ' + e)
    }

    return jsonify({ list: cards })
}

/* =====================================================================
 * 播放解析：播放页内 var pid → MD5/AES 签名 → /lines 取流；
 * 备用分支 POST /god/{pid}
 * ===================================================================== */

async function getPlayinfo(ext) {
    ext = argsify(ext)

    const { data } = await httpGet(ext.url)

    const pidMatch = data.match(/var pid\s*=\s*(\d+)\s*;/)
    if (!pidMatch) {
        $print('xiuluo: pid not found, page may be down')
        return jsonify({ urls: [] })
    }
    const pid = pidMatch[1]
    const t = Date.now()
    const signStr = pid + '-' + t

    // MD5(pid-t) 取前 16 位作 AES-128 key，ECB/Pkcs7 加密同串
    const md5Hash = CryptoJS.MD5(signStr).toString(CryptoJS.enc.Hex).toLowerCase()
    const key = CryptoJS.enc.Utf8.parse(md5Hash.substring(0, 16))
    const encrypted = CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(signStr), key, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7,
    })
    const sg = encrypted.ciphertext.toString(CryptoJS.enc.Hex).toUpperCase()

    const linesUrl = appConfig.site + '/lines?t=' + t + '&sg=' + sg + '&pid=' + pid
    const linesResp = await httpGet(linesUrl, { accept: 'application/json' })
    let d = {}
    try {
        d = (argsify(linesResp.data).data) || {}
    } catch (e) {
        d = {}
    }

    const playHeaders = [
        {
            'User-Agent': UA,
            Referer: appConfig.site + '/',
        },
    ]

    // 分支一：url3 直链
    if (d.url3) {
        const play = d.url3.indexOf(',') !== -1 ? d.url3.split(',')[0].trim() : d.url3.trim()
        return jsonify({
            urls: [play],
            headers: playHeaders,
        })
    }

    // /god 表单 POST（tos 分支 verifyCode=888，默认分支 666）
    const verifyCode = d.tos ? 888 : 666
    const godUrl = appConfig.site + '/god/' + pid + (d.tos ? '?type=1' : '')
    const body = 't=' + t + '&sg=' + encodeURIComponent(sg) + '&verifyCode=' + verifyCode
    try {
        const res = await $fetch.post(godUrl, body, {
            headers: {
                'User-Agent': UA,
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                Referer: appConfig.site + '/',
            },
        })
        const playUrl = argsify(res.data).url
        if (playUrl) {
            return jsonify({
                urls: [playUrl],
                headers: playHeaders,
            })
        }
    } catch (e) {
        $print('xiuluo god request error: ' + e)
    }

    return jsonify({ urls: [] })
}
