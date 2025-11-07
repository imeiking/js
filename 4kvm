// 4K影视
const cheerio = createCheerio()
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
const headers = {
  'Referer': 'https://www.4kvm.net/',
  'Origin': 'https://www.4kvm.net',
  'User-Agent': UA,
}
const appConfig = {
  ver: 1,
  title: "4K影视",
  site: "https://www.4kvm.net",
  tabs: [{
    name: '电影',
    ext: {
      url: 'https://www.4kvm.net/movies--------{page}---/'
    },
  }, {
    name: '电视剧',
    ext: {
      url: 'https://www.4kvm.net/tv--------{page}---/'  // 注意：如果 /tv 404，请检查网站实际URL，可能为 /dianshiju 或 /series，替换此处
    },
  }, {
    name: '番剧',
    ext: {
      url: 'https://www.4kvm.net/anime--------{page}---/'  // 假设URL，根据网站调整
    },
  }]
}
async function getConfig() {
    return jsonify(appConfig)
}
async function getCards(ext) {
  ext = argsify(ext)
  let cards = []
  let url = ext.url
  let page = ext.page || 1
  url = url.replace('{page}', page)
  try {
    const { data } = await $fetch.get(url, {
      headers
    })
    const $ = cheerio.load(data)
    // 假设使用常见模板选择器，如 stui-vodlist__item；实际运行后用浏览器检查元素调整
    $('.stui-vodlist__item, .vod-item, .public-list-exp').each((_, each) => {  // 多选择器fallback
      let itemLink = $(each).find('a').first()
      if (itemLink.length === 0) return
      cards.push({
        vod_id: itemLink.attr('href'),
        vod_name: $(each).find('h4, .title, .vod-name').text().trim() || itemLink.attr('title'),
        vod_pic: appConfig.site + ($(each).find('img').attr('data-original') || $(each).find('img').attr('src')),
        vod_remarks: $(each).find('.pic-text, .public-list-prb, .remarks').text().trim(),
        ext: {
          url: appConfig.site + itemLink.attr('href'),
        },
      })
    })
    if (cards.length === 0) {
      $print('Warning: No cards found, check selectors for ' + url)
    }
  } catch (e) {
    $print('Error fetching cards: ' + e.message)
  }
  return jsonify({
      list: cards,
  });
}
async function getTracks(ext) {
  ext = argsify(ext)
  let groups = []
  let url = ext.url
  try {
    const { data } = await $fetch.get(url, {
        headers
    })
    const $ = cheerio.load(data)
    // 假设分类标签如 .stui-content__tab 或 swiper-slide；调整为实际
    let gn = []
    $('.stui-content__tab a, .swiper-slide a').each((_, each) => {
      let text = $(each).text().trim()
      let cleanText = text.replace(/[0-9]/g, '').replace(/\s+/g, ' ').trim()
      if (cleanText) gn.push(cleanText)
    })
    if (gn.length === 0) gn = ['默认']
    
    // 遍历选集分组，如 .stui-content__playlist
    $('.stui-content__playlist, .anthology-list-box, .episode-list').each((i, each) => {
      let groupTitle = gn[i] || `选集${i + 1}`
      let group = {
        title: groupTitle,
        tracks: [],
      }
      $(each).find('li a, a.this-link').each((_, item) => {
        let trackName = $(item).text().trim()
        let trackUrl = $(item).attr('href')
        if (trackName && trackUrl) {
          group.tracks.push({
            name: trackName,
            pan: '',
            ext: {
              url: appConfig.site + trackUrl
            }
          })
        }
      })
      if (group.tracks.length > 0) groups.push(group)
    })
    if (groups.length === 0) {
      $print('Warning: No tracks found, check selectors for ' + url)
      // Fallback: 假设单组所有a链接为tracks
      let fallbackTracks = []
      $('a[href*="/episodes/"], .play-link').each((_, item) => {
        let name = $(item).text().trim() || '播放'
        fallbackTracks.push({
          name: name,
          pan: '',
          ext: { url: appConfig.site + $(item).attr('href') }
        })
      })
      if (fallbackTracks.length > 0) {
        groups.push({ title: '默认', tracks: fallbackTracks })
      }
    }
  } catch (e) {
    $print('Error fetching tracks: ' + e.message)
  }
  return jsonify({ list: groups })
}
async function getPlayinfo(ext) {
    ext = argsify(ext)
    let url = ext.url
    let urls = []
    try {
      const { data } = await $fetch.get(url, {
          headers
      })
      const $ = cheerio.load(data)
      // 尝试多种提取方式：iframe src, script var, data-url
      let playerSrc = $('iframe[src*="m3u8"], iframe').attr('src') ||
                      $('video source').attr('src') ||
                      data.match(/var\s+playerUrl\s*=\s*'([^']+)'/)?.[1] ||
                      data.match(/player_aaaa=(.+?)<\/script>/)?.[1]  // 类似原代码
      if (playerSrc) {
        let m3u = decodeURIComponent(playerSrc.includes('base64') ? base64decode(playerSrc) : playerSrc)
        urls.push(m3u)
        $print(`***m3u: ${m3u}`)
      } else {
        // Fallback: 找播放按钮链接
        let playLink = $('.play-btn, a[onclick*="play"]').attr('href') || $('.video-source a').first().attr('href')
        if (playLink) urls.push(appConfig.site + playLink)
        $print('No direct m3u, using fallback: ' + urls[0])
      }
    } catch (e) {
      $print('Error fetching playinfo: ' + e.message)
    }
    return jsonify({ 'urls': urls.length > 0 ? urls : [''] })
}
async function search(ext) {
  ext = argsify(ext)
  let cards = [];
  let text = encodeURIComponent(ext.text)
  let page = ext.page || 1
  if (page > 1) {
    return jsonify({ list: cards })
  }
  // 假设搜索URL，根据实际调整；常见为 /search?wd= 或 /s.html?wd=
  let searchUrl = `${appConfig.site}/search?wd=${text}`  // 或 /s.html?wd=${text}
  try {
    const { data } = await $fetch.get(searchUrl, {
      headers
    })
    const $ = cheerio.load(data)
    // 类似getCards，但针对搜索结果
    $('.search-result .stui-vodlist__item, .public-list-box').each((_, each) => {
      let itemLink = $(each).find('a').first()
      cards.push({
        vod_id: itemLink.attr('href'),
        vod_name: $(each).find('.thumb-txt, h4').text().trim(),
        vod_pic: appConfig.site + ($(each).find('img').attr('data-src') || $(each).find('img').attr('data-original')),
        vod_remarks: $(each).find('.public-list-prb').text().trim(),
        ext: {
          url: appConfig.site + itemLink.attr('href'),
        },
      })
    })
    if (cards.length === 0) {
      $print('Warning: No search results, try URL: ' + searchUrl + ' or adjust selector')
    }
  } catch (e) {
    $print('Error searching: ' + e.message + '. Check search URL.')
  }
  return jsonify({
      list: cards,
  })
}
// 保留原base64decode，如果需要
function base64decode(str) {
  var base64DecodeChars = new Array(-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 62, -1, -1, -1, 63, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, -1, -1, -1, -1, -1, -1, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, -1, -1, -1, -1, -1, -1, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, -1, -1, -1, -1, -1);
  var c1, c2, c3, c4;
  var i, len, out;
  len = str.length;
  i = 0;
  out = "";
  while (i < len) {
    do { c1 = base64DecodeChars[str.charCodeAt(i++) & 0xff] } while (i < len && c1 == -1);
    if (c1 == -1) break;
    do { c2 = base64DecodeChars[str.charCodeAt(i++) & 0xff] } while (i < len && c2 == -1);
    if (c2 == -1) break;
    out += String.fromCharCode((c1 << 2) | ((c2 & 0x30) >> 4));
    do { c3 = str.charCodeAt(i++) & 0xff; if (c3 == 61) return out; c3 = base64DecodeChars[c3] } while (i < len && c3 == -1);
    if (c3 == -1) break;
    out += String.fromCharCode(((c2 & 0XF) << 4) | ((c3 & 0x3C) >> 2));
    do { c4 = str.charCodeAt(i++) & 0xff; if (c4 == 61) return out; c4 = base64DecodeChars[c4] } while (i < len && c4 == -1);
    if (c4 == -1) break;
    out += String.fromCharCode(((c3 & 0x03) << 6) | c4)
  }
  return out
}
