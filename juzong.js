// 剧踪影院（juzong.me）XPTV 源
// 仅用于你拥有权限或获得授权的内容；站点内容与播放地址由站点自行提供。

const appConfig = {
  site: 'https://www.juzong.me',
  name: '剧踪影院',
}

const headers = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
  'Referer': `${appConfig.site}/`,
}

const $config = argsify(typeof $config_str === 'string' ? $config_str : '{}')
const cheerio = createCheerio()

function parseJson(input, fallback = {}) {
  if (typeof input !== 'string') return input || fallback
  try { return JSON.parse(input) } catch (_) { return fallback }
}

function abs(url) {
  if (!url) return ''
  return new URL(url, appConfig.site).href
}

async function getHtml(url) {
  const { data } = await $fetch.get(abs(url), { headers })
  return typeof data === 'string' ? data : JSON.stringify(data)
}

function getConfig() {
  return jsonify({
    name: appConfig.name,
    site: appConfig.site,
    title: appConfig.name,
    host: appConfig.site,
    version: 1,
    tabs: [
      { name: '电影', ext: { url: '/vodshow/1-----------/' } },
      { name: '剧集', ext: { url: '/vodshow/2-----------/' } },
      { name: '综艺', ext: { url: '/vodshow/3-----------/' } },
      { name: '动漫', ext: { url: '/vodshow/4-----------/' } },
    ],
  })
}

async function getCards(ext) {
  const opt = parseJson(ext)
  const url = opt.url || '/'
  const $ = cheerio.load(await getHtml(url))
  const list = []
  $('a[href*="/voddetail/"]').each((_, el) => {
    const href = $(el).attr('href')
    const title = $(el).find('.title, .name').text().trim() || $(el).text().trim()
    if (!href || !title || list.some(x => x.vod_id === href)) return
    const box = $(el).closest('li, .stui-vodlist__box, .module-item, .item')
    const pic = box.find('img').attr('data-original') || box.find('img').attr('src') || ''
    const remark = box.find('.pic-text, .text-muted, .remarks').text().trim()
    list.push({
      vod_id: href,
      vod_name: title.replace(/^\s*\d+\s*[.、]\s*/, ''),
      vod_pic: abs(pic),
      vod_remarks: remark,
      ext: { url: abs(href) },
    })
  })
  return jsonify({ list })
}

async function getTracks(ext) {
  const opt = parseJson(ext)
  const $ = cheerio.load(await getHtml(opt.url || opt.vod_id))
  const grouped = {}
  $('a[href*="/vodplay/"]').each((_, a) => {
    const href = $(a).attr('href') || ''
    const match = href.match(/\/vodplay\/[^/]+-(\d+)-\d+/)
    if (!match) return
    const key = match[1]
    if (!grouped[key]) grouped[key] = []
    grouped[key].push({ name: $(a).text().trim() || '播放', url: abs(href) })
  })
  const groups = Object.keys(grouped).map((key, i) => ({
    name: `线路${i + 1}`,
    tracks: grouped[key],
  }))
  return jsonify({ list: groups, groups })
}

async function getPlayinfo(ext) {
  const opt = parseJson(ext)
  const html = await getHtml(opt.url || opt.playUrl || opt.vod_id)
  // MacCMS 有时把 player_data 放在单行 script 中，不能要求分号后必须换行。
  const match = html.match(/var\s+player_data\s*=\s*(\{[\s\S]*?\})\s*;/)
  if (!match) return jsonify({ url: '' })
  let data = parseJson(match[1], {})
  let url = data.url || ''
  if (data.encrypt === 1) url = decodeURIComponent(url)
  // juzongx 等线路返回站点私有加密串，不能当作可播放 URL；让用户切换到可解析线路。
  if (!/^https?:\/\//i.test(url)) url = ''
  return jsonify({ url, header: headers })
}

async function search(ext) {
  const opt = parseJson(ext)
  const wd = encodeURIComponent(opt.wd || opt.keyword || '')
  return getCards({ url: `/vodsearch/${wd}----------1---/` })
}
