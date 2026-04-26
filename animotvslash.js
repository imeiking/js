/**
 * XPTV Extension — ANIMOTVSLASH  v3.0
 * https://www.animotvslash.org
 *
 * ★ 修复重点
 *  1. 所有请求使用移动版 URL (?m=1) + 完整浏览器 Headers 绕过 403
 *  2. Tab 列表改用 /search/label/<Label>?m=1 并用 Blogger 移动版 HTML 选择器
 *  3. 集数列表用正则从 post-body 纯文本里批量提取 "one-piece-episode-N" 链接
 *  4. 搜索用 /?s=keyword&m=1
 */

const cheerio = createCheerio()

/* ─── 请求头：模拟真实手机浏览器，绕过 CF Bot 检测 ─────────────── */
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) ' +
           'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 ' +
           'Mobile/15E148 Safari/604.1'

const HEADERS = {
    'User-Agent':      UA,
    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection':      'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control':   'no-cache',
    'Referer':         'https://www.animotvslash.org/',
}

const BASE = 'https://www.animotvslash.org'

/* ─── 给 URL 加上移动版参数 ─────────────────────────────────────── */
function mob(url) {
    if (!url) return url
    return url.includes('?') ? url + '&m=1' : url + '?m=1'
}

/* ═══════════════════════════════════════════════════════════
   1. getConfig
═══════════════════════════════════════════════════════════ */
let appConfig = {
    ver:   1,
    title: 'ANIMOTVSLASH',
    site:  BASE,
    tabs: [
        {
            name: '🔥 Latest',
            ext:  { url: BASE + '/', label: '' },
        },
        {
            name: '📡 Airing',
            ext:  { url: BASE + '/search/label/Airing', label: 'Airing' },
        },
        {
            name: '✅ Completed',
            ext:  { url: BASE + '/search/label/Completed', label: 'Completed' },
        },
        {
            name: '🎬 Movie',
            ext:  { url: BASE + '/search/label/Movie', label: 'Movie' },
        },
        {
            name: '📺 Ongoing',
            ext:  { url: BASE + '/search/label/Ongoing', label: 'Ongoing' },
        },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

/* ═══════════════════════════════════════════════════════════
   2. getCards — 解析列表页卡片
   
   Blogger 移动版 HTML 结构（.hentry / article）:
     <div class="post-outer">
       <div class="post hentry">
         <h3 class="post-title entry-title">
           <a href="/xxx-episode-1/?m=1">Title</a>
         </h3>
         <div class="post-body">
           <img src="...cover..." />
         </div>
       </div>
     </div>
   
   分页：Blogger 移动版用 updated-max 参数翻页
   但更简单的做法是直接用 ?updated-max=XXX&max-results=20
   我们先获取第一页，通过 "Older Posts" 链接拿到下一页 URL
═══════════════════════════════════════════════════════════ */
async function getCards(ext) {
    ext = argsify(ext)

    // 决定请求 URL
    // 翻页时 ext.nextUrl 存储下一页完整 URL
    let reqUrl
    if (ext.nextUrl) {
        reqUrl = ext.nextUrl
    } else {
        reqUrl = mob(ext.url || BASE + '/')
    }

    let cards   = []
    let nextUrl = null

    try {
        const { data } = await $fetch.get(reqUrl, { headers: HEADERS })
        const $ = cheerio.load(data)

        // ── 解析卡片 ──────────────────────────────────────────────
        // Blogger 移动版：.post-outer 或 article.hentry
        $('article.hentry, .post-outer .post').each((_, el) => {
            // 链接 + 标题
            const a     = $(el).find('h3.post-title a, h2.post-title a, .entry-title a').first()
            let   href  = a.attr('href') || ''
            const title = a.text().trim().replace(/\s*[-–]\s*ANIMOTVSLASH\s*$/i, '')

            if (!href || !title) return

            // 确保绝对 URL，去掉 m=1
            if (href.startsWith('/')) href = BASE + href
            href = href.replace(/[?&]m=1/g, '')

            // 封面图
            const img   = $(el).find('img').first()
            const cover = img.attr('src') || img.attr('data-src') || ''

            // 标签 / 备注
            const label = $(el).find('.label a, .post-labels a').first().text().trim()

            cards.push({
                vod_id:      href,
                vod_name:    title,
                vod_pic:     cover,
                vod_remarks: label,
                ext:         { url: href },
            })
        })

        // ── 没有命中 → 降级：所有带 episode 关键词的链接 ──────────
        if (cards.length === 0) {
            $('a[href*="episode"]').each((_, el) => {
                let   href  = $(el).attr('href') || ''
                const title = $(el).text().trim()
                if (!href || !title || title.length < 3) return
                if (href.startsWith('/')) href = BASE + href
                href = href.replace(/[?&]m=1/g, '')
                if (!href.includes('animotvslash.org')) return
                cards.push({
                    vod_id:   href,
                    vod_name: title.replace(/\s*[-–]\s*ANIMOTVSLASH\s*$/i, ''),
                    vod_pic:  '',
                    ext:      { url: href },
                })
            })
            // 去重
            const seen = new Set()
            cards = cards.filter(c => {
                if (seen.has(c.vod_id)) return false
                seen.add(c.vod_id)
                return true
            })
        }

        // ── 下一页链接 ────────────────────────────────────────────
        // Blogger 移动版：<a id="Blog1_blog-pager-older-link">
        //                  或文字包含 "Older" / "Next"
        const olderHref = $('a#Blog1_blog-pager-older-link, a.blog-pager-older-link, a:contains("Older"), a:contains("Next")').first().attr('href')
        if (olderHref) {
            nextUrl = olderHref.startsWith('http') ? olderHref : BASE + olderHref
            if (!nextUrl.includes('m=1')) nextUrl += (nextUrl.includes('?') ? '&' : '?') + 'm=1'
        }

    } catch (e) {
        $print('getCards error: ' + e)
    }

    return jsonify({
        list:    cards,
        ext:     { url: ext.url, nextUrl },   // 传递给下一页
        hasMore: !!nextUrl,
    })
}

/* ═══════════════════════════════════════════════════════════
   3. getTracks — 从单集页面提取集数列表
   
   页面结构（来自 Google 搜索片段已确认）：
     每集页面的 .post-body 里包含该系列**所有集**的锚点链接：
     "Eps 1035 - Title - Date" / "Eps 1034 - ..."
   
   链接格式：https://animotvslash.org/[anime-slug]-episode-[N]/
═══════════════════════════════════════════════════════════ */
async function getTracks(ext) {
    ext = argsify(ext)
    const url = ext.url

    let groups = []

    try {
        const { data } = await $fetch.get(mob(url), { headers: HEADERS })
        const $ = cheerio.load(data)

        // 系列标题：去掉 "Episode N" 及其后内容
        const rawTitle = $(
            'h1.post-title, h2.post-title, .post-title, h1.entry-title, h1'
        ).first().text().trim()
        const seriesName = rawTitle
            .replace(/\s*[-–]\s*ANIMOTVSLASH\s*$/i, '')
            .replace(/\s*[:-]?\s*episode\s*\d+.*/i, '')
            .trim()

        // ── 方案A：从 HTML 锚点抓取 ──────────────────────────────
        const epMap = new Map()

        // 选择 post-body 下所有 <a>，筛选包含 episode 的
        $('div.post-body a[href], div#post-body a[href], .entry-content a[href], .post-content a[href]').each((_, el) => {
            let   href = $(el).attr('href') || ''
            const text = $(el).text().trim()
            if (!/episode/i.test(href)) return
            if (href.startsWith('/'))   href = BASE + href
            href = href.replace(/[?&]m=1/g, '')
            if (!href.includes('animotvslash.org')) return
            if (!epMap.has(href)) epMap.set(href, text || href)
        })

        // ── 方案B：若 A 没拿到，用正则从原始 HTML 提取所有 episode slug ──
        if (epMap.size === 0) {
            // 提取所有 href="/[slug]-episode-[N]/" 模式
            const slugRe = /href=["'](https?:\/\/(?:www\.)?animotvslash\.org\/[^"']*episode[^"']*\/?)["']/gi
            let m
            while ((m = slugRe.exec(data)) !== null) {
                let epUrl = m[1].replace(/[?&]m=1/g, '')
                // 从 URL 提取 ep 号作为 name
                const numM = epUrl.match(/episode[-\s_]*(\d+)/i)
                const name = numM ? `Episode ${numM[1]}` : epUrl
                if (!epMap.has(epUrl)) epMap.set(epUrl, name)
            }
        }

        if (epMap.size > 0) {
            // 按集号数字排序
            const sorted = Array.from(epMap.entries()).sort((a, b) => {
                const na = parseInt((a[0].match(/episode[-_]?(\d+)/i) || [])[1] || '0', 10)
                const nb = parseInt((b[0].match(/episode[-_]?(\d+)/i) || [])[1] || '0', 10)
                return na - nb
            })

            groups.push({
                title:  seriesName || 'Episodes',
                tracks: sorted.map(([epUrl, name]) => ({
                    name: name.replace(/\s*[-–]\s*ANIMOTVSLASH\s*$/i, '').trim(),
                    pan:  '',
                    ext:  { url: epUrl },
                })),
            })
        } else {
            // 当前页即播放页
            const numM = url.match(/episode[-_]?(\d+)/i)
            groups.push({
                title:  seriesName || 'Play',
                tracks: [{
                    name: numM ? `Episode ${numM[1]}` : (seriesName || 'Watch'),
                    pan:  '',
                    ext:  { url },
                }],
            })
        }

    } catch (e) {
        $print('getTracks error: ' + e)
    }

    return jsonify({ list: groups })
}

/* ═══════════════════════════════════════════════════════════
   4. getPlayinfo — 提取真实播放地址
   
   已知该站使用 JW Player 或外部 iframe embed
   JW Player 特征：jwplayer("xxx").setup({ file:"https://..." })
═══════════════════════════════════════════════════════════ */
async function getPlayinfo(ext) {
    ext = argsify(ext)
    const targetUrl = ext.url
    let playUrl = ''
    let referer = BASE

    // 通用提取器
    function extract(html) {
        return (
            (html.match(/(?:file|src)\s*[:=]\s*["'`](https?:\/\/[^"'`\s,)]+\.m3u8[^"'`\s,)]*)/i) || [])[1] ||
            (html.match(/(?:file|src)\s*[:=]\s*["'`](https?:\/\/[^"'`\s,)]+\.mp4[^"'`\s,)]*)/i) || [])[1] ||
            (html.match(/"file"\s*:\s*"(https?:\/\/[^"]+)"/i) || [])[1] ||
            (html.match(/source:\s*["'`](https?:\/\/[^"'`]+)/i) || [])[1] ||
            ''
        )
    }

    function getIframeSrc($, baseUrl) {
        const src = $('div.post-body iframe, .entry-content iframe, iframe[src*="embed"], iframe').first().attr('src') ||
                    $('iframe').first().attr('data-src') || ''
        if (!src) return ''
        if (src.startsWith('//'))  return 'https:' + src
        if (src.startsWith('/'))   return baseUrl.match(/^https?:\/\/[^/]+/)[0] + src
        return src
    }

    try {
        const { data: html } = await $fetch.get(mob(targetUrl), { headers: HEADERS })

        // 1. 直接从页面 HTML 提取
        playUrl = extract(html)

        // 2. 跟进 iframe
        if (!playUrl) {
            const $ = cheerio.load(html)
            const src = getIframeSrc($, targetUrl)
            if (src) {
                const iHeaders = { ...HEADERS, Referer: targetUrl }
                const { data: ifHtml } = await $fetch.get(src, { headers: iHeaders })
                referer  = src
                playUrl  = extract(ifHtml)

                // 3. 二级 iframe
                if (!playUrl) {
                    const $if  = cheerio.load(ifHtml)
                    const src2 = getIframeSrc($if, src)
                    if (src2 && src2 !== src) {
                        const { data: if2Html } = await $fetch.get(src2, {
                            headers: { ...HEADERS, Referer: src },
                        })
                        referer = src2
                        playUrl = extract(if2Html)
                    }
                }
            }
        }
    } catch (e) {
        $print('getPlayinfo error: ' + e)
    }

    if (!playUrl) {
        $utils.toastError('无法获取播放地址，请尝试浏览器打开')
    }

    return jsonify({
        urls:    [playUrl],
        headers: [{ 'User-Agent': UA, Referer: referer }],
    })
}

/* ═══════════════════════════════════════════════════════════
   5. search
═══════════════════════════════════════════════════════════ */
async function search(ext) {
    ext = argsify(ext)
    const q    = encodeURIComponent(ext.text || '')
    const url  = `${BASE}/?s=${q}&m=1`

    let cards = []

    try {
        const { data } = await $fetch.get(url, { headers: HEADERS })
        const $ = cheerio.load(data)

        $('article.hentry, .post-outer .post').each((_, el) => {
            const a     = $(el).find('h3.post-title a, h2.post-title a, .entry-title a').first()
            let   href  = a.attr('href') || ''
            const title = a.text().trim().replace(/\s*[-–]\s*ANIMOTVSLASH\s*$/i, '')
            if (!href || !title) return
            if (href.startsWith('/')) href = BASE + href
            href = href.replace(/[?&]m=1/g, '')
            const img   = $(el).find('img').first()
            const cover = img.attr('src') || img.attr('data-src') || ''
            cards.push({
                vod_id:   href,
                vod_name: title,
                vod_pic:  cover,
                ext:      { url: href },
            })
        })

        // 降级：episode 链接
        if (cards.length === 0) {
            $('a[href*="episode"]').each((_, el) => {
                let   href  = $(el).attr('href') || ''
                const title = $(el).text().trim()
                if (!href || !title || title.length < 4) return
                if (href.startsWith('/')) href = BASE + href
                href = href.replace(/[?&]m=1/g, '')
                cards.push({
                    vod_id:   href,
                    vod_name: title.replace(/\s*[-–]\s*ANIMOTVSLASH\s*$/i, ''),
                    vod_pic:  '',
                    ext:      { url: href },
                })
            })
            const seen = new Set()
            cards = cards.filter(c => {
                if (seen.has(c.vod_id)) return false
                seen.add(c.vod_id)
                return true
            })
        }
    } catch (e) {
        $print('search error: ' + e)
    }

    return jsonify({ list: cards })
}
