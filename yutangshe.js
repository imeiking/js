// ╔══════════════════════════════════════════════════╗
// ║  XPTV VOD 脚本  —  鱼塘社 tv.yutangshe.com      ║
// ║  适用于苹果CMS (maccms) 标准 JSON API             ║
// ║  type: 3   ext: <本文件URL>                       ║
// ╚══════════════════════════════════════════════════╝

const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const HOST = 'https://tv.yutangshe.com'
const API  = HOST + '/api.php/provide/vod/'

// ─── appConfig ───────────────────────────────────────
// tabs 在 getConfig 时动态从 API 拉取，这里先给空数组占位
// XPTV 会先调用 getConfig → 再用 tabs[i].ext 调用 getCards
let appConfig = {
    ver: 1,
    title: '鱼塘社',
    site: HOST,
    tabs: [],           // 动态填充
}

// ─────────────────────────────────────────────────────
// 公共请求头
// ─────────────────────────────────────────────────────
function reqHeaders() {
    return {
        'User-Agent': UA,
        'Referer': HOST + '/',
        'Accept': 'application/json, text/plain, */*',
    }
}

// ─────────────────────────────────────────────────────
// getConfig —— 首次加载，拉取分类列表作为 tabs
// ─────────────────────────────────────────────────────
async function getConfig() {
    try {
        const res = await $fetch.get(API + '?ac=list', {
            headers: reqHeaders(),
        })
        const json = argsify(res.data)

        // 苹果CMS 返回格式: { class: [{type_id, type_name}, ...], ... }
        const classes = json.class || json.list || []

        const SKIP_KEYWORDS = ['广告', '专题', '公告', '资讯', '新闻', 'AD', 'ad']
        const tabs = classes
            .filter(c => {
                const name = c.type_name || c.name || ''
                return !SKIP_KEYWORDS.some(k => name.includes(k))
            })
            .map(c => ({
                name: c.type_name || c.name || '未知',
                ext: {
                    typeId: String(c.type_id || c.id || ''),
                    pg: 1,
                },
            }))

        // 若拉取失败或分类为空，给默认分类
        if (tabs.length === 0) {
            tabs.push(
                { name: '电影',   ext: { typeId: '1', pg: 1 } },
                { name: '电视剧', ext: { typeId: '2', pg: 1 } },
                { name: '综艺',   ext: { typeId: '3', pg: 1 } },
                { name: '动漫',   ext: { typeId: '4', pg: 1 } },
            )
        }

        appConfig.tabs = tabs
    } catch (e) {
        $print('getConfig error: ' + e)
        // 降级兜底分类
        appConfig.tabs = [
            { name: '电影',   ext: { typeId: '1', pg: 1 } },
            { name: '电视剧', ext: { typeId: '2', pg: 1 } },
            { name: '综艺',   ext: { typeId: '3', pg: 1 } },
            { name: '动漫',   ext: { typeId: '4', pg: 1 } },
        ]
    }

    return jsonify(appConfig)
}

// ─────────────────────────────────────────────────────
// getCards —— 分类列表，支持翻页
// ext: { typeId, pg }
// ─────────────────────────────────────────────────────
async function getCards(ext) {
    ext = argsify(ext)
    const { typeId, pg = 1 } = ext
    const cards = []

    // 苹果CMS 列表接口: ?ac=detail&t={typeId}&pg={pg}
    const url = `${API}?ac=detail&t=${typeId}&pg=${pg}`

    let json
    try {
        const res = await $fetch.get(url, { headers: reqHeaders() })
        json = argsify(res.data)
    } catch (e) {
        $print('getCards fetch error: ' + e)
        return jsonify({ list: [] })
    }

    // json.list 是视频数组
    const list = json.list || []

    for (const item of list) {
        // 苹果CMS 字段: vod_id, vod_name, vod_pic, vod_remarks, vod_year, vod_area
        const id      = item.vod_id   || item.id || ''
        const name    = item.vod_name || item.name || ''
        const pic     = item.vod_pic  || item.pic || ''
        const remarks = item.vod_remarks || item.remarks || item.vod_douban_score || ''

        if (!id || !name) continue

        cards.push({
            vod_id:      String(id),
            vod_name:    name,
            vod_pic:     pic,
            vod_remarks: remarks,
            ext: {
                vodId: String(id),
            },
        })
    }

    return jsonify({ list: cards })
}

// ─────────────────────────────────────────────────────
// getTracks —— 视频详情 + 剧集列表
// ext: { vodId }
// ─────────────────────────────────────────────────────
async function getTracks(ext) {
    ext = argsify(ext)
    const { vodId } = ext
    const groups = []

    // 苹果CMS 详情接口: ?ac=detail&ids={vodId}
    const url = `${API}?ac=detail&ids=${vodId}`

    let item
    try {
        const res = await $fetch.get(url, { headers: reqHeaders() })
        const json = argsify(res.data)
        item = (json.list || [])[0]
    } catch (e) {
        $print('getTracks fetch error: ' + e)
        return jsonify({ list: [] })
    }

    if (!item) return jsonify({ list: [] })

    // vod_play_from: 用"$$$"分隔多个播放源名称，例如 "m3u8$$$mp4"
    // vod_play_url:  用"$$$"分隔多个播放源的集数串
    //   每个集数串内: "第1集$url1#第2集$url2#..."
    const fromStr = item.vod_play_from || ''
    const urlStr  = item.vod_play_url  || ''

    const froms = fromStr.split('$$$')
    const urlGroups = urlStr.split('$$$')

    froms.forEach((from, idx) => {
        const episodesRaw = urlGroups[idx] || ''
        const episodeList = episodesRaw.split('#').filter(Boolean)

        const tracks = episodeList.map(ep => {
            // ep 格式: "集名$播放地址"
            const parts = ep.split('$')
            const epName = parts[0] ? parts[0].trim() : `第${idx + 1}集`
            const epUrl  = parts[1] ? parts[1].trim() : ''
            return {
                name: epName,
                pan: '',
                ext: {
                    playUrl: epUrl,
                    from: from.trim(),
                },
            }
        }).filter(t => t.ext.playUrl)

        if (tracks.length > 0) {
            // 只保留明显可用的源（过滤掉空名）
            const groupTitle = from.trim() || `线路${idx + 1}`
            groups.push({
                title: groupTitle,
                tracks,
            })
        }
    })

    // 如果没有解析到任何集数，兜底提示
    if (groups.length === 0) {
        $print('getTracks: 未解析到剧集, raw=' + urlStr.slice(0, 200))
    }

    return jsonify({ list: groups })
}

// ─────────────────────────────────────────────────────
// getPlayinfo —— 获取最终播放地址
// ext: { playUrl, from }
// ─────────────────────────────────────────────────────
async function getPlayinfo(ext) {
    ext = argsify(ext)
    let { playUrl, from } = ext

    // 直链: m3u8 / mp4 直接返回
    if (playUrl && (playUrl.endsWith('.m3u8') || playUrl.endsWith('.mp4') ||
        playUrl.includes('.m3u8?') || playUrl.includes('.mp4?'))) {
        return jsonify({
            urls: [playUrl],
            headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }],
        })
    }

    // 如果是相对路径，拼接域名
    if (playUrl && playUrl.startsWith('/')) {
        playUrl = HOST + playUrl
    }

    // 有些站 playUrl 本身就是完整直链（http://...）
    if (playUrl && playUrl.startsWith('http')) {
        // 尝试判断是否需要进一步解析（iframe 嵌套播放页面）
        const lowerUrl = playUrl.toLowerCase()
        if (lowerUrl.includes('.m3u8') || lowerUrl.includes('.mp4')) {
            return jsonify({
                urls: [playUrl],
                headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }],
            })
        }

        // 否则拉取播放页，从 HTML 中提取真实地址
        try {
            const res = await $fetch.get(playUrl, {
                headers: { 'User-Agent': UA, 'Referer': HOST + '/' },
            })
            const extracted = extractVideoUrl(res.data, playUrl)
            if (extracted) {
                return jsonify({
                    urls: [extracted],
                    headers: [{ 'User-Agent': UA, 'Referer': playUrl }],
                })
            }
        } catch (e) {
            $print('getPlayinfo page fetch error: ' + e)
        }
    }

    // 最终兜底
    return jsonify({
        urls: [playUrl || ''],
        headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }],
    })
}

// ─────────────────────────────────────────────────────
// search —— 搜索
// ext: { text, page }
// ─────────────────────────────────────────────────────
async function search(ext) {
    ext = argsify(ext)
    const text = encodeURIComponent(ext.text || '')
    const pg   = ext.page || 1
    const cards = []

    // 苹果CMS 搜索接口: ?ac=detail&wd={keyword}&pg={pg}
    const url = `${API}?ac=detail&wd=${text}&pg=${pg}`

    let json
    try {
        const res = await $fetch.get(url, { headers: reqHeaders() })
        json = argsify(res.data)
    } catch (e) {
        $print('search fetch error: ' + e)
        return jsonify({ list: [] })
    }

    const list = json.list || []
    for (const item of list) {
        const id      = item.vod_id   || item.id || ''
        const name    = item.vod_name || item.name || ''
        const pic     = item.vod_pic  || item.pic || ''
        const remarks = item.vod_remarks || item.vod_douban_score || ''

        if (!id || !name) continue

        cards.push({
            vod_id:      String(id),
            vod_name:    name,
            vod_pic:     pic,
            vod_remarks: remarks,
            ext: { vodId: String(id) },
        })
    }

    return jsonify({ list: cards })
}

// ─────────────────────────────────────────────────────
// 辅助: 从 HTML/JS 页面中提取视频 URL
// ─────────────────────────────────────────────────────
function extractVideoUrl(html, referer) {
    if (!html) return ''

    // 常见 m3u8/mp4 直链正则（忽略大小写）
    const patterns = [
        // player_aaaa / 主流播放器配置
        /player_aaaa\s*=\s*\{[^}]*"url"\s*:\s*"([^"]+)"/,
        /"url"\s*:\s*"(https?:\/\/[^"]+\.(?:m3u8|mp4)[^"]*)"/i,
        // video src
        /<source[^>]+src=["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
        /<video[^>]+src=["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
        // jwplayer / dplayer
        /file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
        /src\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
        // url= 赋值
        /url\s*=\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
        /url\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
        // 通用 https://...m3u8 或 https://...mp4
        /(https?:\/\/[^\s"'<>]+\.m3u8(?:\?[^\s"'<>]*)?)/i,
        /(https?:\/\/[^\s"'<>]+\.mp4(?:\?[^\s"'<>]*)?)/i,
    ]

    for (const pattern of patterns) {
        const m = html.match(pattern)
        if (m) {
            const url = m[1].replace(/\\/g, '').replace(/\\u002F/g, '/').trim()
            if (url.startsWith('http')) return url
        }
    }

    // 尝试 JSON 解码（有些站把 URL 转成 unicode 转义）
    try {
        const decoded = html.replace(/\\u[\dA-F]{4}/gi,
            match => String.fromCharCode(parseInt(match.replace(/\\u/i, ''), 16)))
        for (const pattern of patterns) {
            const m = decoded.match(pattern)
            if (m) {
                const url = m[1].replace(/\\/g, '').trim()
                if (url.startsWith('http')) return url
            }
        }
    } catch (e) { /* ignore */ }

    return ''
}
