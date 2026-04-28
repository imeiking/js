// cinebto-xptv-pro.js

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'

const BASE = 'https://cinebto.com'

// ============================
// 代理池（可扩展）
// ============================
const PROXY_POOL = [
  null // 默认直连，可添加多个代理函数
  // url => 'http://127.0.0.1:7890/' + encodeURIComponent(url)
]

function getProxy() {
  return PROXY_POOL[Math.floor(Math.random() * PROXY_POOL.length)]
}

// ============================
// 缓存池
// ============================
const CACHE = new Map()
const SPEED_CACHE = new Map()

// ============================
// 通用请求
// ============================
async function safeGet(url) {
  try {
    const proxy = getProxy()
    const target = proxy ? proxy(url) : url

    const res = await $http.get(target, {
      headers: {
        'User-Agent': UA,
        Referer: new URL(url).origin + '/'
      },
      timeout: 8000
    })

    return res?.data || ''
  } catch {
    return ''
  }
}

// ============================
// 提取 iframe
// ============================
function extractIframes(html) {
  const set = new Set()
  const reg = /<iframe[^>]+src="([^"]+)"/g
  let m
  while ((m = reg.exec(html))) {
    set.add(m[1])
  }
  return [...set]
}

// ============================
// m3u8 检测 + 预加载 + 测速
// ============================
async function testSpeed(m3u8) {
  const start = Date.now()

  try {
    const proxy = getProxy()
    const target = proxy ? proxy(m3u8) : m3u8

    const res = await $http.get(target, {
      headers: {
        'User-Agent': UA,
        Referer: new URL(m3u8).origin + '/'
      },
      timeout: 6000
    })

    const text = res?.data || ''
    if (!text.includes('#EXTM3U')) return null

    // 提取 TS
    const ts = text
      .split('\n')
      .filter(l => l && !l.startsWith('#'))[0]

    if (ts) {
      const tsUrl = ts.startsWith('http')
        ? ts
        : new URL(ts, m3u8).href

      const tsTarget = proxy ? proxy(tsUrl) : tsUrl

      // 请求第一个分片测速
      await $http.get(tsTarget, {
        headers: {
          'User-Agent': UA,
          Referer: new URL(m3u8).origin + '/'
        },
        timeout: 6000
      })
    }

    const cost = Date.now() - start
    SPEED_CACHE.set(m3u8, cost)

    return cost
  } catch {
    return null
  }
}

// ============================
// m3u8 预加载
// ============================
async function preload(m3u8) {
  try {
    const proxy = getProxy()
    const target = proxy ? proxy(m3u8) : m3u8

    const res = await $http.get(target, {
      headers: {
        'User-Agent': UA,
        Referer: new URL(m3u8).origin + '/'
      },
      timeout: 8000
    })

    const text = res?.data || ''
    if (!text.includes('#EXTM3U')) return false

    const tsList = text
      .split('\n')
      .filter(l => l && !l.startsWith('#'))
      .slice(0, 2)

    await Promise.all(
      tsList.map(ts => {
        const tsUrl = ts.startsWith('http')
          ? ts
          : new URL(ts, m3u8).href

        const final = proxy ? proxy(tsUrl) : tsUrl

        return $http.get(final, {
          headers: {
            'User-Agent': UA,
            Referer: new URL(m3u8).origin + '/'
          },
          timeout: 5000
        }).catch(() => {})
      })
    )

    return true
  } catch {
    return false
  }
}

// ============================
// 单线路解析
// ============================
async function parseLine(embedUrl) {
  if (CACHE.has(embedUrl)) return CACHE.get(embedUrl)

  try {
    const html = await safeGet(embedUrl)
    if (!html) return null

    const rcp = html.match(/src:\s*['"](\/rcp[^'"]+)/)?.[1]
    if (!rcp) return null

    const rcpUrl = new URL(rcp, embedUrl).href

    const rcpHtml = await safeGet(rcpUrl)
    if (!rcpHtml) return null

    const js = rcpHtml.match(/src=['"](.*?prorcp.*?\.js)/)?.[1]
    if (!js) return null

    const jsUrl = new URL(js, rcpUrl).href

    const jsText = await safeGet(jsUrl)
    if (!jsText) return null

    const m3u8 =
      jsText.match(/https?:\/\/[^'"\\]+\.m3u8[^'"\\]*/)?.[0] ||
      jsText.match(/file:\s*"(https?:\/\/[^"]+)"/)?.[1]

    if (m3u8) CACHE.set(embedUrl, m3u8)

    return m3u8 || null
  } catch {
    return null
  }
}

// ============================
// 播放（商业级核心）
// ============================
async function play(flag, id) {
  const lines = id.split('#').map(i => i.split('$')[1] || id)

  // 1️⃣ 并发解析
  const parsed = (await Promise.all(lines.map(parseLine))).filter(Boolean)

  if (!parsed.length) {
    return { parse: 1, url: id }
  }

  // 2️⃣ 并发测速
  const speeds = await Promise.all(parsed.map(testSpeed))

  const candidates = parsed
    .map((url, i) => ({ url, speed: speeds[i] || 9999 }))
    .sort((a, b) => a.speed - b.speed)

  // 3️⃣ 选最快并预加载
  for (const item of candidates) {
    const ok = await preload(item.url)
    if (ok) {
      return {
        parse: 0,
        url: item.url
      }
    }
  }

  // 4️⃣ fallback
  return {
    parse: 0,
    url: candidates[0].url
  }
}

// ============================
// 搜索 / 详情
// ============================
async function search(wd) {
  const html = await safeGet(`${BASE}/?s=${encodeURIComponent(wd)}`)

  const list = []
  const reg =
    /<a href="(https:\/\/cinebto\.com\/[^"]+)"[^>]*>\s*<img[^>]*src="([^"]+)"[^>]*alt="([^"]+)"/g

  let m
  while ((m = reg.exec(html))) {
    list.push({
      vod_id: m[1],
      vod_name: m[3],
      vod_pic: m[2]
    })
  }

  return list
}

async function detail(id) {
  const html = await safeGet(id)

  const title = html.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1] || ''
  const pic = html.match(/poster[^>]+src="([^"]+)"/)?.[1] || ''

  const iframes = extractIframes(html)

  const playList = iframes
    .map((u, i) => `线路${i + 1}$${u}`)
    .join('#')

  return {
    vod_id: id,
    vod_name: title,
    vod_pic: pic,
    vod_play_from: 'cinebto',
    vod_play_url: playList
  }
}

// ============================
// 导出
// ============================
export default {
  init: async () => {},
  home: async () => ({
    class: [{ type_id: '1', type_name: '电影' }]
  }),
  homeVod: async () => [],
  category: async () => ({ list: [] }),
  search,
  detail,
  play
}
