/*
 * 咕咕番 (gugu3.com) —— XPTV / drpy 播放源
 * 内核：苹果CMS V10 + Streamlab(短视)主题
 * 能力：
 *   1. 分类：番剧 / 剧场版 / 特摄
 *   2. 分类筛选：影视类型(class)、地区(area)、年份(year)
 *   3. 排序：最新(time) / 人气(hits) / 评分(score)
 *   4. 关键词搜索、详情选集、播放地址解析(player.gugu3.com 换流)
 *
 * 列表接口 /index.php/api/vod 为主题自带的签名接口：
 *   key = MD5("DS" + 秒级时间戳 + "DCC147D11943AF75")
 */

const cheerio = createCheerio()
const CryptoJS = createCryptoJS()

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const appConfig = {
    ver: 20260829,
    title: '咕咕番',
    site: 'https://www.gugu3.com',
    player: 'https://player.gugu3.com',
    signUid: 'DCC147D11943AF75',
}

// 站点分类（与前台导航一致）
const TABS = [
    { name: '番剧', ext: { id: '6' } },
    { name: '剧场版', ext: { id: '21' } },
    { name: '特摄', ext: { id: '23' } },
]

// 各分类的影视类型（取自站点筛选面板 data-type=class）
const CLASS_6 = [
    '科幻', '少女', '搞笑', '推理', '美食', '日常', '魔法', '爱情', '治愈', '音乐',
    '冒险', '歌舞', '竞技', '乙女向', '运动', '热血', '剧情', '奇幻', '游戏', '校园',
    '战斗', '恋爱', '励志', '后宫', '悬疑', '泡面番', '神魔', '百合', '青春', '职场', '战争',
]
const CLASS_23 = ['动画'].concat(CLASS_6)

// 地区（站点 vod_area 维度，番剧以日本为主，另含国产/欧美等）
const AREAS = ['日本', '国产', '欧美', '其他']

function buildYears() {
    const arr = []
    const nowYear = new Date().getFullYear()
    for (let y = nowYear; y >= 2000; y--) arr.push(String(y))
    return arr
}

// 生成某个分类的筛选面板（XPTV 会在分类页渲染为可点选的筛选项）
function makeFilter(classList) {
    const opt = (arr) => arr.map((v) => ({ n: v, v }))
    return [
        {
            key: 'class',
            name: '类型',
            value: [{ n: '全部', v: '' }].concat(opt(classList)),
        },
        {
            key: 'area',
            name: '地区',
            value: [{ n: '全部', v: '' }].concat(opt(AREAS)),
        },
        {
            key: 'year',
            name: '年份',
            value: [{ n: '全部', v: '' }].concat(opt(buildYears())),
        },
        {
            key: 'by',
            name: '排序',
            value: [
                { n: '最新', v: 'time' },
                { n: '人气', v: 'hits' },
                { n: '评分', v: 'score' },
            ],
        },
    ]
}

const filterList = {
    6: makeFilter(CLASS_6),
    21: makeFilter(CLASS_6),
    23: makeFilter(CLASS_23),
}

// 主题签名：MD5("DS" + 秒级时间戳 + Uid)
function makeSign(t) {
    return CryptoJS.MD5('DS' + t + appConfig.signUid).toString()
}

function commonHeaders(referer) {
    const h = {
        'User-Agent': UA,
        Referer: referer || appConfig.site + '/',
    }
    return h
}

async function getConfig() {
    return jsonify({
        ver: appConfig.ver,
        title: appConfig.title,
        site: appConfig.site,
        tabs: TABS,
    })
}

// 分类列表（含筛选 / 排序 / 翻页）
async function getCards(ext) {
    ext = argsify(ext)
    const page = ext.page || 1
    const typeId = String(ext.id || '6')

    // 用户在筛选面板选择的条件
    const f = (ext && ext.filters) || {}
    const cls = f.class || ''
    const area = f.area || ''
    const year = f.year || ''
    const by = f.by || 'time' // 默认按最新

    const t = Math.floor(Date.now() / 1000)
    const key = makeSign(t)

    // 主题签名列表接口（POST 表单）
    const params = {
        type: typeId,
        class: cls,
        area: area,
        lang: '',
        version: '',
        state: '',
        letter: '',
        year: year,
        by: by,
        page: String(page),
        time: String(t),
        key: key,
    }
    const body = Object.keys(params)
        .map((k) => `${k}=${encodeURIComponent(params[k])}`)
        .join('&')

    const { data } = await $fetch.post(appConfig.site + '/index.php/api/vod', body, {
        headers: {
            'User-Agent': UA,
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            Origin: appConfig.site,
            Referer: `${appConfig.site}/index.php/vod/show/id/${typeId}.html`,
        },
    })

    let json
    try {
        json = argsify(data)
    } catch (e) {
        json = { list: [] }
    }

    const cards = (json.list || []).map((it) => {
        const id = String(it.vod_id != null ? it.vod_id : it.id || '')
        const name = it.vod_name || it.name || ''
        let pic = it.vod_pic || it.pic || ''
        if (pic && pic.startsWith('//')) pic = 'https:' + pic
        const remarks = it.vod_remarks != null ? it.vod_remarks : it.remarks || it.name2 || ''
        return {
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: remarks,
            ext: { id: id },
        }
    })

    return jsonify({
        list: cards,
        filter: filterList[typeId] || filterList['6'],
    })
}

// 详情：解析线路与选集
async function getTracks(ext) {
    ext = argsify(ext)
    const id = String(ext.id)
    const detailUrl = `${appConfig.site}/index.php/vod/detail/id/${id}.html`
    const { data } = await $fetch.get(detailUrl, { headers: commonHeaders(detailUrl) })
    const $ = cheerio.load(data)

    // 线路名
    const lineNames = []
    $('.anthology-tab .swiper-slide').each((_, el) => {
        lineNames.push($(el).text().replace(/\d+$/, '').trim())
    })

    // 每个线路对应的选集块（顺序与线路名一一对应）
    const groups = []
    const $boxes = $('.anthology-list-box')
    $boxes.each((idx, box) => {
        const tracks = []
        $(box)
            .find('ul.anthology-list-play li a')
            .each((_, a) => {
                const href = $(a).attr('href') || ''
                if (!href) return
                const playPath = href.startsWith('http') ? href : appConfig.site + href
                tracks.push({
                    name: $(a).text().trim(),
                    pan: '',
                    ext: { play: playPath },
                })
            })
        if (tracks.length === 0) return
        groups.push({
            title: lineNames[idx] || `线路${groups.length + 1}`,
            tracks,
        })
    })

    return jsonify({ list: groups })
}

// 播放：play 页 -> player_aaaa -> (直链 | player.gugu3.com 换流)
async function getPlayinfo(ext) {
    ext = argsify(ext)
    const playUrl = ext.play
    if (!playUrl) return jsonify({ urls: [] })

    const { data } = await $fetch.get(playUrl, { headers: commonHeaders(playUrl) })

    const m = data.match(/var player_aaaa=(\{[\s\S]*?\})<\/script>/)
    if (!m) return jsonify({ urls: [] })
    const pa = argsify(m[1])
    let raw = pa.url || ''
    const from = pa.from || ''

    // 已经是直链（mp4/m3u8/flv/mkv）直接返回
    const isDirect = /^https?:\/\/.+\.(m3u8|mp4|flv|mkv)(\?|#|$)/i.test(raw)
    if (isDirect) {
        return jsonify({ urls: [raw], headers: [commonHeaders(appConfig.site + '/')] })
    }

    // 不同线路对应不同的弹幕播放器主机（与 /static/player/<from>.js 一致）
    // yunjie / vwnet 等 -> player.gugu3.com；kira001 -> dm.gugu3.com
    const playerHost = from === 'kira001' ? 'https://dm.gugu3.com' : appConfig.player

    // 令牌地址：交给站内弹幕播放器换流
    // 1) 取播放器页里的 time / key / vkey
    const playerPage = await $fetch.get(
        `${playerHost}/?url=${encodeURIComponent(raw)}`,
        {
            headers: {
                'User-Agent': UA,
                Referer: playUrl,
                'Sec-Fetch-Dest': 'iframe',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-site',
            },
        },
    )
    const ph = playerPage.data || ''
    const cfgBlock = (ph.match(/var config\s*=\s*\{([\s\S]*?)\};/) || [, ''])[1]
    const pick = (k) => {
        const mm = cfgBlock.match(new RegExp('"' + k + '"\\s*:\\s*"([^"]*)"'))
        return mm ? mm[1] : ''
    }
    const pTime = pick('time')
    const pKey = pick('key')
    const pVkey = pick('vkey')

    // 2) POST 换流接口得到真实地址
    const body = `url=${encodeURIComponent(raw)}&time=${encodeURIComponent(
        pTime,
    )}&key=${encodeURIComponent(pKey)}&vkey=${encodeURIComponent(pVkey)}`
    const res = await $fetch.post(`${playerHost}/admin/mizhi_json.php`, body, {
        headers: {
            'User-Agent': UA,
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            Origin: playerHost,
            Referer: `${playerHost}/?url=${encodeURIComponent(raw)}`,
        },
    })
    let real = ''
    try {
        const ro = argsify(res.data)
        real = ro.url || ro.video_url || ''
    } catch (e) {
        real = ''
    }
    // 上游全部解析失败时，接口会回一张 byteimg 错误占位图，这里识别并丢弃，
    // 让 XPTV 提示该集无法播放，用户可切换其它线路
    if (/tplv-|bot-workflow-sign|\.image(\?|#|$)/i.test(real)) real = ''

    return jsonify({
        urls: real ? [real] : [],
        headers: [
            {
                'User-Agent': UA,
                Referer: appConfig.site + '/',
            },
        ],
    })
}

// 搜索（走稳定的 GET 搜索结果页）
async function search(ext) {
    ext = argsify(ext)
    const page = ext.page || 1
    const wd = encodeURIComponent(ext.text || '')
    const url = `${appConfig.site}/index.php/vod/search/page/${page}/wd/${wd}.html`

    const { data } = await $fetch.get(url, { headers: commonHeaders(url) })
    const $ = cheerio.load(data)
    const cards = []
    $('.public-list-box.search-box').each((_, el) => {
        const $el = $(el)
        const href = $el.find('a.public-list-exp').attr('href') || ''
        const idm = href.match(/\/detail\/id\/(\d+)\.html/)
        if (!idm) return
        let pic = $el.find('img.gen-movie-img').attr('data-src') || $el.find('img').attr('data-src') || ''
        if (pic && pic.startsWith('//')) pic = 'https:' + pic
        cards.push({
            vod_id: idm[1],
            vod_name: $el.find('.thumb-txt').first().text().trim(),
            vod_pic: pic,
            vod_remarks: $el.find('.public-list-prb').first().text().trim(),
            ext: { id: idm[1] },
        })
    })

    return jsonify({ list: cards })
}
