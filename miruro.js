/**
 * Miruro.tv XPTV Extension v3
 * 修复: version字段(null→undefined)、x-obfuscated处理、错误调试、cookie初始化
 */

const appConfig = {
  ver: 1,
  title: 'Miruro',
  site: 'https://www.miruro.tv',
  tabs: [
    { name: '热门趋势', ext: { url: 'browse', sort: 'TRENDING_DESC' } },
    { name: '最流行', ext: { url: 'search', sort: 'POPULARITY_DESC' } },
    { name: '正在播出', ext: { url: 'browse', sort: 'TRENDING_DESC', status: 'RELEASING' } },
    { name: '即将上映', ext: { url: 'browse', sort: 'POPULARITY_DESC', status: 'NOT_YET_RELEASED' } },
    { name: '高分', ext: { url: 'search', sort: 'AVERAGE_SCORE_DESC' } },
    { name: '电影', ext: { url: 'browse', sort: 'POPULARITY_DESC', format: 'MOVIE' } },
    { name: 'TV', ext: { url: 'browse', sort: 'POPULARITY_DESC', format: 'TV' } },
    { name: 'OVA', ext: { url: 'browse', sort: 'POPULARITY_DESC', format: 'OVA' } },
  ],
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const baseHeaders = {
  'User-Agent': UA,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': appConfig.site + '/',
  'Origin': appConfig.site,
};

// XOR 混淆密钥 (如网站启用 x-obfuscated:2 需设置十六进制字符串)
const OBF_KEY = null;

// 调试模式: 出错时返回错误信息卡片
const DEBUG = true;

function base64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function gunzip(data) {
  try {
    if (typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('gzip');
      const stream = new Response(data).body.pipeThrough(ds);
      const reader = stream.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const total = chunks.reduce((acc, c) => acc + c.length, 0);
      const result = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        result.set(c, offset);
        offset += c.length;
      }
      return new TextDecoder().decode(result);
    }
  } catch (e) {}
  return new TextDecoder().decode(data);
}

function getHeader(respHeaders, name) {
  if (!respHeaders) return null;
  const lower = name.toLowerCase();
  for (const key of Object.keys(respHeaders)) {
    if (key.toLowerCase() === lower) return respHeaders[key];
  }
  return null;
}

/**
 * 通过加密管道发送 GET 请求
 * 关键: version字段用undefined(序列化时被忽略),不能用null
 */
async function pipeGet(path, query = {}) {
  // 清理空值参数
  const cleanQuery = {};
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') cleanQuery[k] = v;
  }

  // 构造请求对象 - version用undefined,序列化时自动忽略
  const reqObj = {
    path: path,
    method: 'GET',
    query: cleanQuery,
    body: null,
    // version 不设置(等同于undefined)
  };

  const jsonStr = JSON.stringify(reqObj);
  const encoded = base64urlEncode(jsonStr);
  const url = `${appConfig.site}/api/secure/pipe?e=${encoded}`;

  const resp = await $fetch.get(url, { headers: baseHeaders });
  const rawData = resp.data;
  const respHeaders = resp.respHeaders || resp.headers || {};

  // 检查 x-obfuscated 头
  const obfuscated = getHeader(respHeaders, 'x-obfuscated');

  if (obfuscated && typeof rawData === 'string' && rawData.length > 0) {
    // base64 解码
    let bytes = base64urlDecode(rawData);
    // XOR 解密 (仅 x-obfuscated:2 且有密钥时)
    if (obfuscated === '2' && OBF_KEY) {
      const keyBytes = new Uint8Array(OBF_KEY.match(/.{2}/g).map(h => parseInt(h, 16)));
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] ^= keyBytes[i % keyBytes.length];
      }
    }
    // gzip 解压 (官方代码总是解压)
    const decompressed = await gunzip(bytes);
    return JSON.parse(decompressed);
  }

  // 无混淆头: data 可能是 JSON 字符串或已解析的对象
  if (typeof rawData === 'string') {
    if (rawData.length === 0) throw new Error('Empty response');
    try {
      return JSON.parse(rawData);
    } catch (e) {
      throw new Error(`Invalid JSON response: ${rawData.substring(0, 100)}`);
    }
  }
  if (rawData && typeof rawData === 'object') return rawData;
  throw new Error('Unexpected response format');
}

function getTitle(anime) {
  return anime.title?.english || anime.title?.romaji || anime.title?.native || 'Unknown';
}

function getCover(anime) {
  return anime.coverImage?.large || anime.coverImage?.medium || anime.coverImage?.extraLarge || '';
}

function formatCard(anime) {
  let remarks = '';
  const format = anime.format || '';
  if (anime.nextAiringEpisode) {
    const total = anime.episodes || '?';
    remarks = `EP${anime.nextAiringEpisode.episode - 1}/${total}`;
  } else if (anime.episodes) {
    remarks = `${anime.episodes}集`;
  }
  if (format) remarks = format + (remarks ? ' ' + remarks : '');

  return {
    vod_id: String(anime.id),
    vod_name: getTitle(anime),
    vod_pic: getCover(anime),
    vod_remarks: remarks,
    vod_pubdate: anime.seasonYear ? String(anime.seasonYear) : '',
    ext: {
      url: `${appConfig.site}/info/${anime.id}`,
      anilistId: anime.id,
    },
  };
}

function errorCard(msg) {
  return {
    vod_id: 'error',
    vod_name: DEBUG ? `[错误] ${msg}` : '加载失败',
    vod_pic: '',
    vod_remarks: '',
    ext: {},
  };
}

async function getConfig() {
  return jsonify(appConfig);
}

async function getCards(ext) {
  ext = argsify(ext);
  const urlType = ext.url || 'browse';
  const page = ext.page || 1;

  const query = {
    type: 'ANIME',
    page: page,
    perPage: 20,
  };
  if (ext.sort) query.sort = ext.sort;
  if (ext.status) query.status = ext.status;
  if (ext.format) query.format = ext.format;
  if (ext.genre) query.genre = ext.genre;

  const apiPath = urlType === 'search' ? 'search' : 'search/browse';

  try {
    const data = await pipeGet(apiPath, query);
    const results = data.results || data.data || data.Page?.media || [];
    const cards = results.map(formatCard);
    return jsonify({ list: cards });
  } catch (e) {
    return jsonify({ list: [errorCard(`getCards: ${e.message || e}`)] });
  }
}

async function getTracks(ext) {
  ext = argsify(ext);
  const anilistId = ext.anilistId;

  if (!anilistId) {
    return jsonify({ list: [] });
  }

  try {
    const data = await pipeGet('episodes', { anilistId });
    const providers = data.providers || {};

    const groups = [];
    for (const [providerName, providerData] of Object.entries(providers)) {
      const episodes = providerData.episodes || {};
      const subEps = episodes.sub || [];
      const dubEps = episodes.dub || [];
      const ssubEps = episodes.ssub || [];

      const makeTrack = (ep, cat) => ({
        name: `EP${ep.number}${ep.title ? ' - ' + ep.title : ''}`,
        pan: '',
        ext: {
          episodeId: ep.id,
          provider: providerName,
          category: cat,
          anilistId: anilistId,
        },
      });

      if (subEps.length > 0) {
        groups.push({
          title: `${providerName.toUpperCase()} SUB`,
          tracks: subEps.map(ep => makeTrack(ep, 'sub')),
        });
      }
      if (dubEps.length > 0) {
        groups.push({
          title: `${providerName.toUpperCase()} DUB`,
          tracks: dubEps.map(ep => makeTrack(ep, 'dub')),
        });
      }
      if (ssubEps.length > 0) {
        groups.push({
          title: `${providerName.toUpperCase()} SSUB`,
          tracks: ssubEps.map(ep => makeTrack(ep, 'ssub')),
        });
      }
    }

    return jsonify({ list: groups });
  } catch (e) {
    return jsonify({ list: [{ title: `[错误] ${e.message || e}`, tracks: [] }] });
  }
}

async function getPlayinfo(ext) {
  ext = argsify(ext);
  const { episodeId, provider, category, anilistId } = ext;

  if (!episodeId || !provider) {
    return jsonify({ urls: [], headers: [] });
  }

  try {
    const query = {
      episodeId: episodeId,
      provider: provider,
      category: category || 'sub',
    };
    if (anilistId) query.anilistId = anilistId;

    const data = await pipeGet('sources', query);
    const streams = data.streams || [];

    if (streams.length === 0) {
      return jsonify({ urls: [], headers: [] });
    }

    const hlsStream = streams.find(s => s.type === 'hls' || (s.url && s.url.includes('.m3u8'))) || streams[0];
    const playUrl = hlsStream.url;

    const playHeaders = { 'User-Agent': UA };
    if (provider === 'zoro' || provider === 'arc') {
      playHeaders['Referer'] = 'https://hianime.to/';
    }

    return jsonify({
      urls: [playUrl],
      headers: [playHeaders],
    });
  } catch (e) {
    return jsonify({ urls: [], headers: [] });
  }
}

async function search(ext) {
  ext = argsify(ext);
  const text = ext.text || '';
  const page = ext.page || 1;

  if (!text) {
    return jsonify({ list: [] });
  }

  try {
    const data = await pipeGet('search', {
      query: text,
      type: 'ANIME',
      page: page,
      perPage: 20,
    });

    const results = data.results || data.data || data.Page?.media || [];
    const cards = results.map(formatCard);
    return jsonify({ list: cards });
  } catch (e) {
    return jsonify({ list: [errorCard(`search: ${e.message || e}`)] });
  }
}
