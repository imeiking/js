// cinebto-xptv-final.js

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'

const BASE = 'https://cinebto.com'

// ====== 可选代理（如有需要自行填）======
// 例: const PROXY = url => 'http://127.0.0.1:7890/' + encodeURIComponent(url)
const PROXY = null

// ====== 简单缓存 ======
const CACHE = new Map()

// ============================
// 通用请求
// ============================
async function safeGet(url, headers = {}) {
  try {
    const target = PROXY ? PROXY(url) : url
    const u = new URL(url)

    const res = await $http.get(target, {
      headers: {
        'User-Agent': UA,
        Accept: '*/*',
        Referer: u.origin + '/',
        ...headers
      },
      timeout: 10000
    })

    return res?.data || ''
  } catch {
    return ''
  }
}

// ============================
// m3u8 可用性检测
// ============================
async function checkM3U8(url) {
  try {
    const target = PROXY ? PROXY(url) : url

    const res = await $http.get(target, {
      headers: {
        'User-Agent': UA,
        Referer: new URL(url).origin + '/'
      },
      timeout: 8000
    })

    return typeof res?.data === 'string' && res.data.includes('#EXTM3U')
  } catch {
    return false
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
// 搜索
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

// ============================
// 详情
// ============================
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
// 单线路解析
// ============================
async function parseLine(embedUrl) {
  if (CACHE.has(embedUrl)) return CACHE.get(embedUrl)

  try {
    const embedHtml = await safeGet(embedUrl)
    if (!embedHtml) return null

    const rcpMatch = embedHtml.match(/src:\s*['"](\/rcp[^'"]+)/)
    if (!rcpMatch) return null

    const rcpUrl = new URL(rcpMatch[1], embedUrl).href

    const rcpHtml = await safeGet(rcpUrl)
    if (!rcpHtml) return null

    const jsMatch = rcpHtml.match(/src=['"](.*?prorcp.*?\.js)/)
    if (!jsMatch) return null

    const jsUrl = new URL(jsMatch[1], rcpUrl).href

    const js = await safeGet(jsUrl)
    if (!js) return null

    const m3u8 =
      js.match(/https?:\/\/[^'"\\]+\.m3u8[^'"\\]*/)?.[0] ||
      js.match(/file:\s*"(https?:\/\/[^"]+)"/)?.[1]

    if (m3u8) {
      CACHE.set(embedUrl, m3u8)
    }

    return m3u8 || null
  } catch {
    return null
  }
}

// ============================
// 播放（并发 + 校验）
// ============================
async function play(flag, id) {
  const lines = id.split('#').map(i => i.split('$')[1] || id)

  // 并发解析
  const tasks = lines.map(url => parseLine(url))
  const results = await Promise.all(tasks)

  // 逐个验证 m3u8
  for (const m3u8 of results) {
    if (!m3u8) continue

    const ok = await checkM3U8(m3u8)
    if (ok) {
      return {
        parse: 0,
        url: m3u8
      }
    }
  }

  // fallback：顺序重试
  for (const url of lines) {
    for (let i = 0; i < 2; i++) {
      const m3u8 = await parseLine(url)
      if (m3u8 && (await checkM3U8(m3u8))) {
        return {
          parse: 0,
          url: m3u8
        }
      }
    }
  }

  return {
    parse: 1,
    url: id
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
