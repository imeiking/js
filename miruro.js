/**
 * Miruro.tv XPTV Extension
 * 基于 Miruro 加密管道协议 (/api/secure/pipe) 实现
 * GET 请求: base64url 编码请求对象
 * 响应: 可能经过 x-obfuscated 头标识的混淆 + gzip 压缩
 */

const appConfig = {
  ver: 1,
  title: 'Miruro',
  site: 'https://www.miruro.tv',
  tabs: [
    { name: '热门', ext: { url: 'trending' } },
    { name: '流行', ext: { url: 'popular' } },
    { name: '新番', ext: { url: 'recent' } },
    { name: '即将上映', ext: { url: 'upcoming' } },
    { name: '电影', ext: { url: 'filter', format: 'MOVIE' } },
    { name: 'TV', ext: { url: 'filter', format: 'TV' } },
    { name: 'OVA', ext: { url: 'filter', format: 'OVA' } },
  ],
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const baseHeaders = {
  'User-Agent': UA,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': appConfig.site + '/',
  'Origin': appConfig.site,
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
};

// XOR 混淆密钥 (从 VITE_PIPE_OBF_KEY 环境变量获取，十六进制字符串)
// 如果网站启用了 x-obfuscated:2，需要设置此密钥
const OBF_KEY = null; // 例如: 'a1b2c3d4...'

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
  // fallback: try pako or manual
  return new TextDecoder().decode(data);
}

/**
 * 通过加密管道发送 GET 请求
 */
async function pipeGet(path, query = {}) {
  const reqObj = {
    path: path,
    method: 'GET',
    query: query,
    body: null,
    version: null,
  };
  const encoded = base64urlEncode(JSON.stringify(reqObj));
  const url = `${appConfig.site}/api/secure/pipe?e=${encoded}`;

  const resp = await $fetch.get(url, { headers: baseHeaders });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }

  const text = resp.data || resp.text;
  const obfuscated = resp.headers?.['x-obfuscated'] || resp.headers?.['X-Obfuscated'];

  if (obfuscated) {
    let bytes = base64urlDecode(text);
    // XOR 解密 (如果 x-obfuscated: 2 且有密钥)
    if (obfuscated === '2' && OBF_KEY) {
      const keyBytes = new Uint8Array(OBF_KEY.match(/.{2}/g).map(h => parseInt(h, 16)));
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] ^= keyBytes[i % keyBytes.length];
      }
    }
    // gzip 解压 (检查 gzip 魔数 0x1f 0x8b)
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      return JSON.parse(await gunzip(bytes));
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  if (typeof text === 'string') {
    return JSON.parse(text);
  }
  return text;
}

function getTitle(anime) {
  return anime.title?.english || anime.title?.romaji || anime.title?.native || 'Unknown';
}

function getCover(anime) {
  return anime.coverImage?.large || anime.coverImage?.medium || anime.coverImage?.extraLarge || '';
}

function formatCard(anime) {
  const episodes = anime.episodes || anime.nextAiringEpisode?.episode || '?';
  const status = anime.status || '';
  const format = anime.format || '';
  let remarks = '';
  if (anime.nextAiringEpisode) {
    remarks = `EP${anime.nextAiringEpisode.episode - 1}/${episodes || '?'}`;
  } else if (episodes) {
    remarks = `${episodes}集`;
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

async function getConfig() {
  return jsonify(appConfig);
}

async function getCards(ext) {
  ext = argsify(ext);
  const url = ext.url || 'trending';
  const page = ext.page || 1;

  let data;
  if (url === 'filter') {
    const query = {
      type: 'ANIME',
      sort: 'POPULARITY_DESC',
      page: page,
      perPage: 20,
    };
    if (ext.format) query.format = ext.format;
    if (ext.status) query.status = ext.status;
    if (ext.genre) query.genre = ext.genre;
    data = await pipeGet('search/browse', query);
  } else {
    data = await pipeGet(url, { page, perPage: 20 });
  }

  const results = data.results || data.data || [];
  const cards = results.map(formatCard);

  return jsonify({
    list: cards,
  });
}

async function getTracks(ext) {
  ext = argsify(ext);
  const anilistId = ext.anilistId;

  if (!anilistId) {
    return jsonify({ list: [] });
  }

  const data = await pipeGet('episodes', { anilistId });
  const providers = data.providers || {};

  const groups = [];
  for (const [providerName, providerData] of Object.entries(providers)) {
    const episodes = providerData.episodes || {};
    const subEps = episodes.sub || [];
    const dubEps = episodes.dub || [];
    const ssubEps = episodes.ssub || [];

    if (subEps.length > 0) {
      const group = {
        title: `${providerName.toUpperCase()} SUB`,
        tracks: subEps.map(ep => ({
          name: `EP${ep.number}${ep.title ? ' - ' + ep.title : ''}`,
          pan: '',
          ext: {
            episodeId: ep.id,
            provider: providerName,
            category: 'sub',
            anilistId: anilistId,
          },
        })),
      };
      groups.push(group);
    }

    if (dubEps.length > 0) {
      const group = {
        title: `${providerName.toUpperCase()} DUB`,
        tracks: dubEps.map(ep => ({
          name: `EP${ep.number}${ep.title ? ' - ' + ep.title : ''}`,
          pan: '',
          ext: {
            episodeId: ep.id,
            provider: providerName,
            category: 'dub',
            anilistId: anilistId,
          },
        })),
      };
      groups.push(group);
    }

    if (ssubEps.length > 0) {
      const group = {
        title: `${providerName.toUpperCase()} SSUB`,
        tracks: ssubEps.map(ep => ({
          name: `EP${ep.number}${ep.title ? ' - ' + ep.title : ''}`,
          pan: '',
          ext: {
            episodeId: ep.id,
            provider: providerName,
            category: 'ssub',
            anilistId: anilistId,
          },
        })),
      };
      groups.push(group);
    }
  }

  return jsonify({ list: groups });
}

async function getPlayinfo(ext) {
  ext = argsify(ext);
  const { episodeId, provider, category, anilistId } = ext;

  if (!episodeId || !provider) {
    return jsonify({ urls: [], headers: [] });
  }

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

  // 优先选择 HLS 流
  const hlsStream = streams.find(s => s.type === 'hls' || s.url?.includes('.m3u8')) || streams[0];
  const playUrl = hlsStream.url;

  // 构建播放 headers (某些提供商需要 referer)
  const playHeaders = {
    'User-Agent': UA,
  };
  if (provider === 'zoro' || provider === 'arc') {
    playHeaders['Referer'] = 'https://hianime.to/';
  }

  return jsonify({
    urls: [playUrl],
    headers: [playHeaders],
  });
}

async function search(ext) {
  ext = argsify(ext);
  const text = ext.text || '';
  const page = ext.page || 1;

  if (!text) {
    return jsonify({ list: [] });
  }

  const data = await pipeGet('search', {
    query: text,
    type: 'ANIME',
    page: page,
    perPage: 20,
  });

  const results = data.results || data.data || [];
  const cards = results.map(formatCard);

  return jsonify({ list: cards });
}
