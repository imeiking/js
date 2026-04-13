// 韩剧网 (hanju7.com) XPTV 源
// 类型: HTML 抓取 + AES-CBC 解密播放
// 分类: 1=韩剧, 3=韩国电影, 4=韩国综艺
// 搜索: 站点有反爬虫保护, 搜索功能可能不可用

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SITE = 'https://www.hanju7.com';
const AES_KEY = 'my-to-newhan-2025';

async function aesDecrypt(encryptedText, key) {
  try {
    const CryptoJS = createCryptoJS();
    const keyBytes = CryptoJS.enc.Utf8.parse(key.slice(0, 32).padEnd(32, '\0'));
    const encryptedBytes = CryptoJS.enc.Base64.parse(encryptedText);
    const iv = CryptoJS.lib.WordArray.create(encryptedBytes.words.slice(0, 4), 16);
    const ciphertext = CryptoJS.lib.WordArray.create(
      encryptedBytes.words.slice(4),
      encryptedBytes.sigBytes - 16
    );
    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: ciphertext },
      keyBytes,
      { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
    );
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    console.error('AES decrypt error:', e);
    return '';
  }
}

async function getLocalInfo() {
  return jsonify({
    ver: 1,
    name: '韩剧网',
    api: 'csp_hanju7',
    type: 3
  });
}

async function getConfig() {
  return jsonify({
    ver: 1,
    title: '韩剧网',
    site: SITE,
    tabs: [
      { name: '韩剧', ext: { id: '1', tid: '1' } },
      { name: '韩国电影', ext: { id: '3', tid: '3' } },
      { name: '韩国综艺', ext: { id: '4', tid: '4' } }
    ]
  });
}

async function getCards(ext) {
  ext = argsify(ext);
  const { tid = '1', page = 1 } = ext;
  const list = [];
  const pg = page > 1 ? (page - 1) : '';
  const url = `${SITE}/list/${tid}---${pg}.html`;

  const { data } = await $fetch.get(url, {
    headers: { 'User-Agent': UA, 'Referer': SITE + '/' }
  });

  const cheerio = createCheerio();
  const $ = cheerio.load(data);

  $('li').each((i, el) => {
    const $el = $(el);
    const $a = $el.find('a.tu').first();
    if (!$a.length) return;

    const href = $a.attr('href') || '';
    const title = $a.attr('title') || '';
    const pic = $a.attr('data-original') || '';
    const remarks = $a.find('.tip').text().trim() || '';
    const nameLink = $el.find('p a').first();
    const vodName = nameLink.text().trim() || title;

    if (href && vodName) {
      const fullPic = pic.startsWith('//') ? 'https:' + pic : pic;
      const fullHref = href.startsWith('/') ? SITE + href : href;
      const idMatch = href.match(/\/detail\/(\d+)/);
      const vodId = idMatch ? idMatch[1] : href;

      list.push({
        vod_id: vodId,
        vod_name: vodName,
        vod_pic: fullPic,
        vod_remarks: remarks,
        ext: { id: vodId, url: fullHref }
      });
    }
  });

  return jsonify({ list, page });
}

async function getTracks(ext) {
  ext = argsify(ext);
  const { id, url } = ext;

  const { data } = await $fetch.get(url, {
    headers: { 'User-Agent': UA, 'Referer': SITE + '/' }
  });

  const cheerio = createCheerio();
  const $ = cheerio.load(data);

  // 提取封面 (详情页 og:image)
  const ogImage = $('meta[property="og:image"]').attr('content') || '';

  // 提取集数
  const tracks = [];
  $('li a[onclick]').each((i, el) => {
    const $el = $(el);
    const onclick = $el.attr('onclick') || '';
    const name = $el.text().trim();
    const match = onclick.match(/bb_a\(\s*['"]([^'"]+)['"]/);
    if (match && name) {
      tracks.push({
        name: name,
        ext: { epId: match[1], vid: id, ogImage: ogImage }
      });
    }
  });

  return jsonify({
    list: [
      { title: '默认线路', tracks }
    ]
  });
}

async function getPlayinfo(ext) {
  ext = argsify(ext);
  const { epId } = ext;

  try {
    // 1. 获取加密的 m3u8 URL
    const apiUrl = `${SITE}/u/u1.php?ud=${epId}`;
    const { data: encrypted } = await $fetch.get(apiUrl, {
      headers: { 'User-Agent': UA, 'Referer': SITE + '/detail/' }
    });

    if (!encrypted || encrypted.length < 20) {
      console.error('getPlayinfo: empty encrypted response');
      return jsonify({ urls: [] });
    }

    // 2. AES-CBC 解密
    const decryptedUrl = await aesDecrypt(encrypted, AES_KEY);
    if (!decryptedUrl) {
      console.error('getPlayinfo: decrypt failed');
      return jsonify({ urls: [] });
    }

    // 清理 URL (去除换行等空白字符)
    const cleanUrl = decryptedUrl.trim();

    return jsonify({
      urls: [cleanUrl],
      headers: [
        { 'User-Agent': UA, 'Referer': SITE + '/' }
      ]
    });
  } catch (error) {
    console.error('getPlayinfo error:', error);
    return jsonify({ urls: [] });
  }
}

async function search(ext) {
  ext = argsify(ext);
  const { text, wd, page = 1 } = ext;
  const keyword = text || wd || '';
  const list = [];

  try {
    const postData = `show=searchkey&keyboard=${encodeURIComponent(keyword)}`;
    const { data } = await $fetch.post(`${SITE}/search/`, postData, {
      headers: {
        'User-Agent': UA,
        'Referer': SITE + '/',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const cheerio = createCheerio();
    const $ = cheerio.load(data);

    $('li').each((i, el) => {
      const $el = $(el);
      // 搜索结果结构: <li><i>1.</i><p id="name"><a href="..." title="...">name(year)</a></p><p id="time">category</p><p id="actor">...</p></li>
      const $nameLink = $el.find('p#name a').first();
      if (!$nameLink.length) return;

      const href = $nameLink.attr('href') || '';
      const title = $nameLink.attr('title') || '';
      const vodName = $nameLink.text().trim() || title;
      const remarks = $el.find('p#time').text().trim() || '';

      if (href && vodName) {
        const fullHref = href.startsWith('/') ? SITE + href : href;
        const idMatch = href.match(/\/detail\/(\d+)/);
        const vodId = idMatch ? idMatch[1] : href;
        // 搜索结果无封面, 用站内图片规则构造
        const pic = idMatch ? `https://pics.hanju7.com/pics/${idMatch[1]}.jpg` : '';

        list.push({
          vod_id: vodId,
          vod_name: vodName,
          vod_pic: pic,
          vod_remarks: remarks,
          ext: { id: vodId, url: fullHref }
        });
      }
    });
  } catch (error) {
    console.error('search error:', error);
  }

  return jsonify({ list, page });
}
