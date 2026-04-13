// 88看球 - 體育直播源
// 目標站: 88kanqiu.cc (體育直播)

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const SITE = 'http://www.88kanqiu.cc';

const HEADERS = {
  'User-Agent': UA,
  'Referer': SITE + '/'
};

// base64 解碼（XPTV JSC 環境，無 Buffer/atob）
function base64Decode(str) {
  try {
    const CryptoJS = createCryptoJS();
    return CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(str));
  } catch (e) {
    return '';
  }
}

const filterList = {
  '1': [{ key: 'cateId', name: '類型', value: [
    { n: 'NBA', v: '1' }, { n: 'CBA', v: '2' }, { n: '籃球綜合', v: '4' }, { n: '緯來體育', v: '21' }
  ]}],
  '8': [{ key: 'cateId', name: '聯賽', value: [
    { n: '英超', v: '8' }, { n: '西甲', v: '9' }, { n: '意甲', v: '10' }, { n: '歐冠', v: '12' },
    { n: '歐聯', v: '13' }, { n: '德甲', v: '14' }, { n: '法甲', v: '15' }, { n: '歐國聯', v: '16' },
    { n: '足總杯', v: '27' }, { n: '國王杯', v: '33' }, { n: '中超', v: '7' }, { n: '亞冠', v: '11' },
    { n: '足球綜合', v: '23' }, { n: '歐協聯', v: '28' }, { n: '美職聯', v: '26' }
  ]}]
};

async function getLocalInfo() {
  return jsonify({
    ver: 1,
    name: '88看球',
    api: 'csp_88kanqiu',
    type: 3,
    categories: [
      { id: '', name: '全部直播' },
      { id: '1', name: '籃球直播' },
      { id: '8', name: '足球直播' },
      { id: '21', name: '其他直播' }
    ]
  });
}

async function getConfig() {
  return jsonify({
    ver: 1,
    title: '88看球',
    site: SITE,
    tabs: [
      { name: '全部直播', ext: { id: '' } },
      { name: '籃球直播', ext: { id: '1' } },
      { name: '足球直播', ext: { id: '8' } },
      { name: '其他直播', ext: { id: '21' } }
    ]
  });
}

async function getCards(ext) {
  try {
    ext = argsify(ext);
    const { id = '' } = ext;
    const cateId = ext.filters?.cateId || id;
    const cheerio = createCheerio();

    const path = cateId ? `/match/${cateId}/live` : '';
    const url = SITE + path;

    const { data } = await $fetch.get(url, { headers: HEADERS });
    const $ = cheerio.load(data);
    const list = [];

    $('.list-group-item').each((_, element) => {
      const $el = $(element);
      const btnPrimary = $el.find('.btn.btn-primary');

      const time = $el.find('.category-game-time').text()?.trim() || '';
      const gameType = $el.find('.game-type').text()?.trim() || '';
      const teamNames = $el.find('.team-name');
      const homeTeam = teamNames.length > 0 ? teamNames.first().text().trim() : '';
      const awayTeam = teamNames.length > 1 ? teamNames.last().text().trim() : '';

      const name = `${time} ${gameType} ${homeTeam} vs ${awayTeam}`.trim();
      if (name === 'vs' || !name) return;

      let vid = SITE;
      let remark = '暂无';
      if (btnPrimary.length > 0) {
        vid = SITE + btnPrimary.attr('href');
        remark = btnPrimary.text().trim();
      }

      const imgs = $el.find('img');
      let pic = imgs.length > 0 ? imgs.first().attr('src') : '';
      if (!pic) pic = 'https://pic.imgdb.cn/item/657673d6c458853aeff94ab9.jpg';
      if (!pic.startsWith('http')) pic = SITE + pic;

      const encodedName = encodeURIComponent(name);
      list.push({
        vod_id: `${vid}###${encodedName}`,
        vod_name: name,
        vod_pic: pic,
        vod_remarks: remark,
        ext: { detail_url: vid, name: name, remark: remark }
      });
    });

    return jsonify({ list, filter: filterList[id] || [], page: 1 });
  } catch (error) {
    console.error('getCards error:', error);
    return jsonify({ list: [], page: 1 });
  }
}

async function getTracks(ext) {
  try {
    ext = argsify(ext);
    const { detail_url, name = '赛事直播', remark } = ext;

    // 比賽尚未開始，沒有播放連結
    if (!detail_url || detail_url === SITE || remark === '暂无') {
      return jsonify({
        list: [
          {
            title: name,
            tracks: [
              { name: '比賽尚未開始', ext: { wait: true } }
            ]
          }
        ]
      });
    }

    const cheerio = createCheerio();
    const playUrlApi = detail_url + '-url';

    const { data } = await $fetch.get(playUrlApi, {
      headers: {
        ...HEADERS,
        'Referer': detail_url
      }
    });

    let raw = data.data || data;
    // 提取 base64 部分（從 eyJ 開頭的 JSON base64 到結尾）
    const b64Match = raw.match(/(ey[A-Za-z0-9+/=]+)/);
    if (!b64Match) {
      return jsonify({ list: [] });
    }
    const decodedData = JSON.parse(base64Decode(b64Match[1]));
    const links = decodedData.links || [];

    // 從播放器 URL 參數提取真實流地址
    function extractRealUrl(urlStr) {
      const match = urlStr.match(/[?&](?:url|liveUrl|m3u8)=([^&]+)/);
      if (match && match[1]) {
        try { return decodeURIComponent(match[1]); } catch (e) { return match[1]; }
      }
      return null;
    }

    // 分類：直链優先，嗅探在後
    const directLinks = [];
    const sniffLinks = [];

    links.forEach(it => {
      const realUrl = extractRealUrl(it.url);
      if (realUrl && (realUrl.includes('.m3u8') || realUrl.includes('.flv') || realUrl.includes('.ts'))) {
        directLinks.push({ name: it.name, url: realUrl });
      } else {
        sniffLinks.push(it);
      }
    });

    const sortedLinks = [...directLinks, ...sniffLinks];
    const tracks = sortedLinks.map(it => ({
      name: it.name,
      ext: {
        url: it.url,
        is_direct: !!(it.url.includes('.m3u8') || it.url.includes('.flv') || it.url.includes('.ts'))
      }
    }));

    return jsonify({
      list: [
        {
          title: name,
          tracks: tracks
        }
      ]
    });
  } catch (error) {
    console.error('getTracks error:', error);
    return jsonify({ list: [] });
  }
}

async function getPlayinfo(ext) {
  try {
    ext = argsify(ext);
    const { url, is_direct = false, wait = false } = ext;

    // 比賽尚未開始
    if (wait || !url) {
      return jsonify({ urls: [] });
    }

    if (is_direct) {
      return jsonify({
        urls: [url],
        headers: [HEADERS]
      });
    }

    // 嗅探模式
    return jsonify({
      urls: [url],
      headers: [HEADERS]
    });
  } catch (error) {
    console.error('getPlayinfo error:', error);
    return jsonify({ urls: [] });
  }
}

async function search(ext) {
  // 體育直播源不支援搜索
  return jsonify({ list: [], page: 1 });
}
