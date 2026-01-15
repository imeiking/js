

```javascript
const CryptoJS = createCryptoJS()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let appConfig = {
    ver: 20240520,
    title: '二rk影视',
    site: 'https://www.2rk.cc',
    tabs: [
        { name: '电影', ext: { id: '1' } },
        { name: '连续剧', ext: { id: '2' } },
        { name: '综艺', ext: { id: '3' } },
        { name: '动漫', ext: { id: '4' } },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

/**
 * 获取分类列表数据
 */
async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { id, page = 1 } = ext

    // 适配苹果CMS的标准列表路径
    const url = `${appConfig.site}/vodtype/${id}-${page}.html`

    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA }
    })

    // 使用正则解析网页 HTML (针对 2rk.cc 的结构)
    // 匹配容器内的列表项
    const listMatches = data.matchAll(/<div class="stui-vodlist__box">([\s\S]*?)<\/div>/g)
    for (const match of listMatches) {
        const itemHtml = match[1]
        const vod_id = itemHtml.match(/href="\/voddetail\/(.*?)\.html"/)?.[1]
        const vod_name = itemHtml.match(/title="(.*?)"/)?.[1]
        const vod_pic = itemHtml.match(/data-original="(.*?)"/)?.[1]
        const vod_remarks = itemHtml.match(/<span class="pic-text text-right">(.*?)<\/span>/)?.[1]

        if (vod_id) {
            cards.push({
                vod_id: vod_id,
                vod_name: vod_name,
                vod_pic: vod_pic.startsWith('http') ? vod_pic : appConfig.site + vod_pic,
                vod_remarks: vod_remarks,
                ext: {
                    url: `${appConfig.site}/voddetail/${vod_id}.html`,
                },
            })
        }
    }

    return jsonify({ list: cards })
}

/**
 * 获取剧集/选集列表
 */
async function getTracks(ext) {
    ext = argsify(ext)
    let url = ext.url
    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA }
    })

    let groups = []
    // 匹配播放列表名称 (如 酷云、极速)
    const tabMatches = data.matchAll(/<h3 class="title">(.*?)<\/h3>/g)
    const listMatches = data.matchAll(/<ul class="stui-content__playlist clearfix">([\s\S]*?)<\/ul>/g)
    
    let tabNames = []
    for (const m of tabMatches) tabNames.push(m[1])

    let i = 0
    for (const m of listMatches) {
        let tracks = []
        const liMatches = m[1].matchAll(/<a href="\/vodplay\/(.*?)\.html">(.*?)<\/a>/g)
        for (const li of liMatches) {
            tracks.push({
                name: li[2],
                ext: {
                    playUrl: `${appConfig.site}/vodplay/${li[1]}.html`
                }
            })
        }
        
        groups.push({
            title: tabNames[i] || '默认线路',
            tracks: tracks
        })
        i++
    }

    return jsonify({ list: groups })
}

/**
 * 获取最终播放地址
 */
async function getPlayinfo(ext) {
    ext = argsify(ext)
    let playPageUrl = ext.playUrl

    const { data } = await $fetch.get(playPageUrl, {
        headers: { 'User-Agent': UA }
    })

    // 苹果CMS通常在网页源代码中包含 player_aaaa={...} 的 JSON
    const playerConfig = data.match(/player_aaaa=(.*?)</)?.[1]
    let playUrl = ""
    
    if (playerConfig) {
        const config = JSON.parse(playerConfig)
        // config.url 是原始地址，可能需要解析或直接播放
        playUrl = decodeURIComponent(config.url)
    }

    // 注意：如果该网站使用了加密解析（如自带解析接口），则需要进一步请求解析接口
    // 这里暂时返回解析后的地址
    return jsonify({
        urls: [playUrl],
        headers: [{ 'User-Agent': UA, 'Referer': appConfig.site }]
    })
}

/**
 * 搜索功能
 */
async function search(ext) {
    ext = argsify(ext)
    let { text, page = 1 } = ext
    const url = `${appConfig.site}/vodsearch/${encodeURIComponent(text)}----------${page}---.html`

    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA }
    })

    let cards = []
    const searchMatches = data.matchAll(/<div class="stui-vodlist__box">([\s\S]*?)<\/div>/g)
    
    for (const match of searchMatches) {
        const itemHtml = match[1]
        const vod_id = itemHtml.match(/href="\/voddetail\/(.*?)\.html"/)?.[1]
        const vod_name = itemHtml.match(/title="(.*?)"/)?.[1]
        const vod_pic = itemHtml.match(/data-original="(.*?)"/)?.[1]
        
        if (vod_id) {
            cards.push({
                vod_id: vod_id,
                vod_name: vod_name,
                vod_pic: vod_pic.startsWith('http') ? vod_pic : appConfig.site + vod_pic,
                ext: {
                    url: `${appConfig.site}/voddetail/${vod_id}.html`,
                },
            })
        }
    }

    return jsonify({ list: cards })
}
