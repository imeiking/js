const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const BASE = "https://getav.net";
const STATIC_BASE = "https://static.worldstatic.com";

const HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6",
  Referer: `${BASE}/zh`,
};

const PLAY_HEADERS = {
  "User-Agent": UA,
  Referer: `${BASE}/`,
};

const appConfig = {
  ver: 20260526,
  title: "GetAV",
  site: `${BASE}/zh`,
  tabs: [
    {
      id: "latest",
      name: "最近更新",
      ext: { path: "/zh/latest", query: { sort: "uploadDate" } },
    },
    {
      id: "new",
      name: "新片上市",
      ext: { path: "/zh/new-releases" },
    },
    {
      id: "hot",
      name: "热门影片",
      ext: { path: "/zh/hot" },
    },
    {
      id: "uncensored",
      name: "无码影片",
      ext: { path: "/zh/search", query: { isUncensored: true, limit: 24, locale: "zh" } },
    },
    {
      id: "subtitle",
      name: "字幕影片",
      ext: { path: "/zh/subtitle" },
    },
    {
      id: "4k",
      name: "4K视频",
      ext: { path: "/zh/4k" },
    },
  ],
};

async function getConfig() {
  return jsonify(appConfig);
}

async function getCards(ext) {
  ext = argsify(ext);
  const page = Number(ext.page || 1);
  const url = buildUrl(ext.path || "/zh/latest", page, ext.query || {});

  try {
    const html = await fetchText(url);
    if (isBlocked(html)) return blockedResult(page);

    const cards = parseCards(html);
    return jsonify({
      list: cards,
      page,
      pagecount: cards.length > 0 ? page + 1 : page,
      total: cards.length,
    });
  } catch (error) {
    $print(error);
    return jsonify({ list: [] });
  }
}

async function getTracks(ext) {
  ext = argsify(ext);
  const url = detailUrl(ext);

  try {
    const html = await fetchText(url);
    if (isBlocked(html)) {
      return jsonify({
        list: [
          {
            title: "提示",
            tracks: [
              {
                name: "站点 Cloudflare 验证拦截",
                pan: "",
                ext: { url },
              },
            ],
          },
        ],
      });
    }

    const title = parseDetailTitle(html, ext.title || "");
    const streams = extractStreams(html);
    const tracks =
      streams.length > 0
        ? streams.map((stream, index) => ({
            name: stream.name || `播放线路 ${index + 1}`,
            pan: "",
            ext: {
              url: stream.url,
              title,
              referer: url,
            },
          }))
        : [
            {
              name: "默认播放",
              pan: "",
              ext: { url, title, referer: url },
            },
          ];

    return jsonify({
      list: [
        {
          title: "播放",
          tracks,
        },
      ],
    });
  } catch (error) {
    $print(error);
    return jsonify({ list: [] });
  }
}

async function getPlayinfo(ext) {
  ext = argsify(ext);

  try {
    let urls = [];
    if (ext.url && /\/index\.txt/i.test(ext.url)) {
      urls = [ext.url];
    } else if (ext.url) {
      const html = await fetchText(ext.url);
      urls = extractStreams(html).map((item) => item.url);
    }

    return jsonify({
      urls,
      headers: PLAY_HEADERS,
    });
  } catch (error) {
    $print(error);
    return jsonify({ urls: [] });
  }
}

async function search(ext) {
  ext = argsify(ext);
  const text = ext.text || ext.wd || ext.keyword || "";
  const page = Number(ext.page || 1);
  if (!text) return jsonify({ list: [] });

  try {
    const url = buildUrl("/zh/search", page, { q: text });
    const html = await fetchText(url);
    if (isBlocked(html)) return blockedResult(page);

    const cards = parseCards(html);
    return jsonify({
      list: cards,
      page,
      pagecount: cards.length > 0 ? page + 1 : page,
      total: cards.length,
    });
  } catch (error) {
    $print(error);
    return jsonify({ list: [] });
  }
}

function buildUrl(path, page, query) {
  const params = [];
  Object.keys(query || {}).forEach((key) => {
    if (query[key] !== undefined && query[key] !== null && query[key] !== "") {
      params.push(`${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`);
    }
  });
  params.push(`page=${page}`);
  return `${BASE}${path}?${params.join("&")}`;
}

async function fetchText(url) {
  const { data } = await $fetch.get(url, {
    headers: Object.assign({}, HEADERS, { Referer: `${BASE}/zh` }),
  });
  if (typeof data === "string") return data;
  return JSON.stringify(data || "");
}

function parseCards(html) {
  const map = {};
  const order = [];
  const anchorReg = /<a\b([^>]*?)href=(["'])([^"']*\/videos\/[^"']+)\2([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorReg.exec(html))) {
    const attrs = `${match[1] || ""} ${match[4] || ""}`;
    const href = normalizeUrl(decodeHtml(match[3]));
    const idMatch = href.match(/\/videos\/([^/?#]+)/i);
    if (!idMatch) continue;

    const id = idMatch[1].toLowerCase();
    const code = id.toUpperCase();
    const inner = match[5] || "";
    const text = cleanText(inner);
    const img = pickImage(inner, attrs);
    const alt = pickAttr(inner, "alt") || pickAttr(attrs, "title");

    if (!map[id]) {
      map[id] = {
        vod_id: id,
        vod_name: code,
        vod_pic: "",
        vod_remarks: "",
        ext: {
          id,
          url: href,
        },
      };
      order.push(id);
    }

    if (img && !map[id].vod_pic) {
      map[id].vod_pic = img;
    }

    if (img && text && !map[id].vod_remarks) {
      map[id].vod_remarks = cleanRemark(text);
    }

    if (!img && text) {
      map[id].vod_name = cleanTitle(text, code);
    }

    if (alt && map[id].vod_name === code) {
      map[id].vod_name = cleanTitle(alt, code);
    }
  }

  return order
    .map((id) => map[id])
    .filter((item) => item.vod_name && item.vod_id)
    .slice(0, 60);
}

function extractStreams(html) {
  const text = normalizeEscaped(html);
  const reg = /https?:\/\/static\.worldstatic\.com\/cdn\/assets\/deliveries\/v2\/[^"'<>\s\\]+?\/index\.txt\?t=[A-Za-z0-9]+(?:&e=\d+)?/g;
  const urls = unique((text.match(reg) || []).map((url) => decodeHtml(url)));

  return urls.map((url, index) => ({
    name: index === 0 ? "默认线路" : `备用线路 ${index + 1}`,
    url,
  }));
}

function parseDetailTitle(html, fallback) {
  const jsonTitle = html.match(/"name"\s*:\s*"([^"]{3,300})"/);
  if (jsonTitle) return cleanTitle(decodeJsonString(jsonTitle[1]), "");

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) {
    return cleanTitle(cleanText(title[1]).replace(/\s*\|\s*GetAV\s*$/i, ""), "");
  }

  return fallback || "GetAV";
}

function detailUrl(ext) {
  if (ext.url) return normalizeUrl(ext.url);
  const id = String(ext.id || ext.vod_id || "").toLowerCase();
  return `${BASE}/zh/videos/${id}`;
}

function pickImage(inner, attrs) {
  const src =
    pickAttr(inner, "src") ||
    pickAttr(inner, "data-src") ||
    firstFromSrcset(pickAttr(inner, "srcset")) ||
    firstFromSrcset(pickAttr(attrs, "srcset"));
  return normalizeImage(src);
}

function normalizeImage(url) {
  if (!url) return "";
  url = decodeHtml(url);
  if (url.indexOf("/_next/image?") >= 0) {
    const found = url.match(/[?&]url=([^&]+)/);
    if (found) url = decodeURIComponent(found[1]);
  }
  return normalizeUrl(url);
}

function normalizeUrl(url) {
  if (!url) return "";
  url = decodeHtml(String(url)).replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) {
    if (url.startsWith("/cdn/assets/")) return `${STATIC_BASE}${url}`;
    return `${BASE}${url}`;
  }
  return url;
}

function firstFromSrcset(srcset) {
  if (!srcset) return "";
  const first = srcset.split(",")[0] || "";
  return first.trim().split(/\s+/)[0] || "";
}

function pickAttr(html, name) {
  const reg = new RegExp(`${name}=(["'])(.*?)\\1`, "i");
  const found = String(html || "").match(reg);
  return found ? decodeHtml(found[2]) : "";
}

function cleanTitle(text, code) {
  text = normalizeSpace(text)
    .replace(/\s+\d+(?:\.\d+)?万?\s+\d+$/u, "")
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/\s*\|\s*GetAV\s*$/i, "");

  if (code && text && !text.toUpperCase().startsWith(code)) {
    text = `${code} ${text}`;
  }

  return text || code || "GetAV";
}

function cleanRemark(text) {
  return normalizeSpace(text)
    .replace(/您的浏览器不支持视频播放。?/g, "")
    .replace(/\bLIVE\b/gi, "")
    .replace(/^\s+|\s+$/g, "");
}

function cleanText(html) {
  return normalizeSpace(
    decodeHtml(
      String(html || "")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function normalizeSpace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function normalizeEscaped(text) {
  return decodeHtml(String(text || ""))
    .replace(/\\u0026/g, "&")
    .replace(/\\u003d/g, "=")
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/");
}

function decodeJsonString(text) {
  return String(text || "")
    .replace(/\\"/g, '"')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function decodeHtml(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

function unique(list) {
  const seen = {};
  const result = [];
  list.forEach((item) => {
    if (!item || seen[item]) return;
    seen[item] = true;
    result.push(item);
  });
  return result;
}

function isBlocked(html) {
  return /Just a moment|Attention Required|Cloudflare|cf_chl|enable JavaScript and cookies/i.test(
    String(html || "")
  );
}

function blockedResult(page) {
  return jsonify({
    list: [
      {
        vod_id: "cloudflare-blocked",
        vod_name: "GetAV 当前触发 Cloudflare 验证，请换网络或稍后再试",
        vod_pic: "",
        vod_remarks: "Cloudflare",
        ext: {
          id: "cloudflare-blocked",
          url: `${BASE}/zh`,
        },
      },
    ],
    page,
    pagecount: page,
  });
}
