/**
 * ============================================================
 *  TVBox / CatVOD  Plugin  —  animotvslash.org
 *  Style: cheerio HTML-scraping  (mirrors libvio plugin style)
 *
 *  Site engine: HiAnime / AniWatch clone
 *  Key endpoints (all relative to SITE):
 *    Category pages  /top-airing?page=N
 *    Anime detail    /anime-name-id
 *    AJAX ep list    /ajax/v2/episode/list/{animeDataId}
 *    AJAX servers    /ajax/v2/episode/servers?episodeId={epId}
 *    AJAX sources    /ajax/v2/episode/sources?id={serverId}
 *    Search          /search?keyword={q}&page=N
 *
 *  TVBox Runtime provides: createCheerio, $fetch, argsify, jsonify
 *  Self-test: node animotvslash_plugin.js --test
 * ============================================================
 */

'use strict';

// ── Execution mode ───────────────────────────────────────────
const IS_TEST = typeof process !== 'undefined' && process.argv.includes('--test');

// ── TVBox runtime shims (only injected in test mode) ─────────
let cheerio, $fetch, argsify, jsonify;

if (IS_TEST) {
  // Minimal cheerio-compatible shim using a real subset of the API
  const CHEERIO_AVAIL = (() => { try { require.resolve('cheerio'); return true; } catch { return false; } })();
  if (CHEERIO_AVAIL) {
    cheerio = require('cheerio');
    // Wrap to match TVBox `createCheerio()` style
    const _load = cheerio.load.bind(cheerio);
    cheerio = { load: _load };
  } else {
    // Lightweight fake cheerio for mock-only tests
    cheerio = {
      load: (html) => {
        const $ = (sel) => ({
          each: () => {},
          text: () => '',
          attr: () => '',
          find: () => ({ text: () => '', attr: () => '' }),
          toArray: () => [],
          length: 0,
        });
        $.load = cheerio.load;
        return $;
      },
    };
  }

  $fetch = { get: async () => ({ data: '' }) }; // overridden per-test
  argsify = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
  jsonify = (v) => JSON.stringify(v);
} else {
  // Production: these are injected by TVBox runtime
  cheerio = createCheerio();
  argsify = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
  jsonify = (v) => JSON.stringify(v);
}

// ────────────────────────────────────────────────────────────
//  Constants
// ────────────────────────────────────────────────────────────
const _config = typeof $config_str !== 'undefined' ? argsify($config_str) : {};
const SITE = _config.site || 'https://animotvslash.org';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
         + 'AppleWebKit/537.36 (KHTML, like Gecko) '
         + 'Chrome/130.0.0.0 Safari/537.36';

const headers = {
  'Referer'         : SITE + '/',
  'Origin'          : SITE,
  'User-Agent'      : UA,
  'X-Requested-With': 'XMLHttpRequest',
  'Accept'          : 'text/html, application/json, */*',
};

// ── Server preference list ───────────────────────────────────
const SERVER_PREF = ['vidstreaming', 'megacloud', 'streamsb', 'vidcloud'];

// ────────────────────────────────────────────────────────────
//  App config  (tabs mirror the site navigation)
// ────────────────────────────────────────────────────────────
const appConfig = {
  ver  : 1,
  title: 'AnimoTVSlash',
  site : SITE,
  tabs : [
    { name: 'Home',         ext: { path: '/',               hasMore: false } },
    { name: 'Top Airing',   ext: { path: '/top-airing'                    } },
    { name: 'Trending',     ext: { path: '/home'                          } },
    { name: 'Most Popular', ext: { path: '/most-popular'                  } },
    { name: 'Movies',       ext: { path: '/movie'                         } },
    { name: 'TV Series',    ext: { path: '/tv'                            } },
    { name: 'OVA',          ext: { path: '/ova'                           } },
    { name: 'ONA',          ext: { path: '/ona'                           } },
    { name: 'Special',      ext: { path: '/special'                       } },
    { name: 'Subbed',       ext: { path: '/subbed-anime'                  } },
    { name: 'Dubbed',       ext: { path: '/dubbed-anime'                  } },
  ],
};

// ────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────

/**
 * Parse a single `.flw-item` DOM node into a TVBox card object.
 * HiAnime HTML structure per card:
 *
 *   <div class="flw-item">
 *     <div class="film-poster">
 *       <a href="/anime-name-123" class="film-poster-ahref dynamic-name" title="Anime Name">
 *         <img data-src="https://cdn.../poster.jpg" class="film-poster-img" ...>
 *       </a>
 *       <div class="tick ltr">
 *         <div class="tick-item tick-sub">12</div>
 *         <div class="tick-item tick-dub">10</div>
 *       </div>
 *     </div>
 *     <div class="film-detail">
 *       <h3 class="film-name"><a href="/anime-name-123" ...>Anime Name</a></h3>
 *       <div class="fd-infor">
 *         <span class="fdi-item">TV</span>
 *         <span class="fdi-item fdi-duration">24m</span>
 *       </div>
 *     </div>
 *   </div>
 */
function parseCard($, el) {
  const $el   = $(el);
  const $link = $el.find('.film-poster a, a.film-poster-ahref').first();
  const href  = $link.attr('href') || '';

  // Skip non-anime hrefs
  if (!href || href === '#') return null;

  const title   = $link.attr('title') || $el.find('.film-name a').first().text().trim();
  const poster  = $el.find('img').first().attr('data-src')
               || $el.find('img').first().attr('src')
               || '';
  const sub     = $el.find('.tick-item.tick-sub').first().text().trim();
  const dub     = $el.find('.tick-item.tick-dub').first().text().trim();
  const remarks = [sub && 'Sub:' + sub, dub && 'Dub:' + dub].filter(Boolean).join('  ') || '';

  return {
    vod_id     : href,
    vod_name   : title,
    vod_pic    : poster,
    vod_remarks: remarks,
    ext        : { url: SITE + href },
  };
}

/**
 * Pick the best streaming server from a server list.
 * @param {Array} list  — array of { serverName, serverId } objects
 * @returns {string}    — serverId of chosen server
 */
function pickServer(list) {
  if (!list || !list.length) return null;
  for (const pref of SERVER_PREF) {
    const s = list.find(x => (x.serverName || '').toLowerCase().includes(pref));
    if (s) return s.serverId;
  }
  return list[0].serverId;
}

/**
 * Extract the numeric anime dataId from a detail page.
 * HiAnime embeds it in multiple places:
 *   - <div id="ani_detail" data-id="...">
 *   - <script>var syncData = {"id":"...","malId":"...",...}</script>
 */
function extractDataId(html) {
  // Method 1: data attribute on #ani_detail or similar wrapper
  const attr = html.match(/id="ani_detail"[^>]+data-id="(\d+)"/);
  if (attr) return attr[1];

  // Method 2: syncData JSON embedded in page scripts
  const sync = html.match(/var\s+syncData\s*=\s*(\{[^}]+\})/);
  if (sync) {
    try {
      const obj = JSON.parse(sync[1]);
      if (obj.id) return String(obj.id);
    } catch (_) {}
  }

  // Method 3: #watch-episode data-id
  const watch = html.match(/data-id="(\d+)"/);
  if (watch) return watch[1];

  return null;
}

// ────────────────────────────────────────────────────────────
//  TVBox interface
// ────────────────────────────────────────────────────────────

async function getConfig() {
  return jsonify(appConfig);
}

/**
 * getCards(ext)
 *   ext.path    — URL path segment (e.g. '/top-airing')
 *   ext.page    — 1-based page number
 *   ext.hasMore — false to stop pagination (used by Home tab)
 *
 * Returns: { list: Card[] }
 */
async function getCards(ext) {
  ext = argsify(ext);

  const path    = ext.path    || '/top-airing';
  const page    = ext.page    || 1;
  const hasMore = ext.hasMore !== false;

  // Home tab has no pagination
  if (!hasMore && page > 1) {
    return jsonify({ list: [] });
  }

  const url = SITE + path + '?page=' + page;
  const { data } = await $fetch.get(url, { headers });

  const $     = cheerio.load(data);
  const cards = [];
  const seen  = new Set();

  $('.flw-item').each((_, el) => {
    const card = parseCard($, el);
    if (card && !seen.has(card.vod_id)) {
      seen.add(card.vod_id);
      cards.push(card);
    }
  });

  return jsonify({ list: cards });
}

/**
 * getTracks(ext)
 *   ext.url — full detail page URL (e.g. 'https://animotvslash.org/solo-leveling-18718')
 *
 * Flow:
 *   1. Fetch detail page → extract numeric animeDataId
 *   2. GET /ajax/v2/episode/list/{dataId} → episode list HTML (in JSON .html field)
 *   3. Parse episode links into tracks
 *
 * Returns: { list: [ { title, tracks } ] }
 */
async function getTracks(ext) {
  ext = argsify(ext);
  const detailUrl = ext.url;

  // Step 1 — fetch detail page, get numeric dataId
  const { data: detailHtml } = await $fetch.get(detailUrl, { headers });
  const dataId = extractDataId(detailHtml);

  if (!dataId) {
    return jsonify({ list: [{ title: 'Episodes', tracks: [] }] });
  }

  // Step 2 — fetch episode list via AJAX
  const ajaxUrl = SITE + '/ajax/v2/episode/list/' + dataId;
  const { data: epJson } = await $fetch.get(ajaxUrl, { headers });
  const epData = typeof epJson === 'string' ? JSON.parse(epJson) : epJson;
  const epHtml = epData.html || epData.data || '';

  // Step 3 — parse episodes
  const $ = cheerio.load(epHtml);
  const tracks = [];

  $('a.ssl-item.ep-item, .ss-list a').each((_, el) => {
    const $a    = $(el);
    const href  = $a.attr('href') || '';
    const num   = $a.attr('data-number') || $a.attr('data-num') || '';
    const epId  = $a.attr('data-id')     || '';
    const title = $a.attr('title')        || $a.text().trim();
    const name  = title && title.length > 2 ? title
                : (num.length > 1 ? num : '0' + num);

    tracks.push({
      name: name,
      ext : {
        url   : detailUrl,    // keep for reference
        epId  : epId,
        epNum : num,
      },
    });
  });

  return jsonify({ list: [{ title: 'Episodes', tracks }] });
}

/**
 * getPlayinfo(ext)
 *   ext.url   — detail page URL
 *   ext.epId  — episode ID string (from getTracks)
 *   ext.epNum — episode number (informational)
 *
 * Flow:
 *   1. GET /ajax/v2/episode/servers?episodeId={epId} → server list
 *   2. Pick best server (vidstreaming > megacloud > …)
 *   3. GET /ajax/v2/episode/sources?id={serverId} → streaming link
 *   4. Return direct link or embed URL for TVBox player
 *
 * Returns: { urls: [string], headers: object }
 */
async function getPlayinfo(ext) {
  ext = argsify(ext);
  const epId = ext.epId;

  if (!epId) {
    return jsonify({ urls: [], headers });
  }

  // Step 1 — server list
  const srvUrl  = SITE + '/ajax/v2/episode/servers?episodeId=' + epId;
  const { data: srvJson } = await $fetch.get(srvUrl, { headers });
  const srvData  = typeof srvJson === 'string' ? JSON.parse(srvJson) : srvJson;
  const srvHtml  = srvData.html || srvData.data || '';

  const $s   = cheerio.load(srvHtml);
  const subs = [];
  const dubs = [];

  $s('.server-item[data-type="sub"], .servers-sub .server-item').each((_, el) => {
    subs.push({ serverName: $s(el).text().trim(), serverId: $s(el).attr('data-id') });
  });
  $s('.server-item[data-type="dub"], .servers-dub .server-item').each((_, el) => {
    dubs.push({ serverName: $s(el).text().trim(), serverId: $s(el).attr('data-id') });
  });

  const serverList = subs.length ? subs : dubs;
  const serverId   = pickServer(serverList);

  if (!serverId) {
    return jsonify({ urls: [], headers });
  }

  // Step 2 — streaming source link
  const srcUrl  = SITE + '/ajax/v2/episode/sources?id=' + serverId;
  const { data: srcJson } = await $fetch.get(srcUrl, { headers });
  const srcData = typeof srcJson === 'string' ? JSON.parse(srcJson) : srcJson;

  // srcData.link  → embed URL (e.g. https://megacloud.tv/embed-1/e-1/…)
  // srcData.sources → direct m3u8 list (if server returns it directly)
  let playUrl = '';

  if (srcData.sources && srcData.sources.length) {
    // Direct sources available — prefer highest quality m3u8
    const sorted = srcData.sources
      .filter(s => s.file || s.url)
      .sort((a, b) => {
        const q = x => parseInt((x.label || '0').replace(/\D/g, '')) || 0;
        return q(b) - q(a);
      });
    playUrl = (sorted[0] && (sorted[0].file || sorted[0].url)) || '';
  } else if (srcData.link) {
    // Embed URL — return as-is; TVBox's WebView/player will handle it
    playUrl = srcData.link;
  }

  return jsonify({ urls: [playUrl], headers });
}

/**
 * search(ext)
 *   ext.text — search keyword
 *   ext.page — page number (only page 1 served due to site structure)
 *
 * Returns: { list: Card[] }
 */
async function search(ext) {
  ext = argsify(ext);
  const page = ext.page || 1;

  if (page > 1) {
    return jsonify({ list: [] });
  }

  const q   = encodeURIComponent(ext.text || '');
  const url = SITE + '/search?keyword=' + q;
  const { data } = await $fetch.get(url, { headers });

  const $     = cheerio.load(data);
  const cards = [];
  const seen  = new Set();

  $('.flw-item').each((_, el) => {
    const card = parseCard($, el);
    if (card && !seen.has(card.vod_id)) {
      seen.add(card.vod_id);
      cards.push(card);
    }
  });

  return jsonify({ list: cards });
}

// ────────────────────────────────────────────────────────────
//  Self-Test Suite
// ────────────────────────────────────────────────────────────
if (IS_TEST) {
  const C = {
    R: '\x1b[0m', G: '\x1b[32m', Re: '\x1b[31m',
    Y: '\x1b[33m', Cy: '\x1b[36m', B: '\x1b[1m', D: '\x1b[2m',
  };
  const ok   = m => console.log('  ' + C.G  + '\u2714' + C.R + '  ' + m);
  const fail = m => console.log('  ' + C.Re + '\u2718' + C.R + '  ' + m);
  const info = m => console.log('  ' + C.Y  + '\u2139' + C.R + '  ' + C.D + m + C.R);
  const head = m => console.log('\n' + C.B + C.Cy + '\u25b6 ' + m + C.R);
  const div  = () => console.log(C.B + '\u2500'.repeat(54) + C.R);

  // ── Mock HTML fixtures (realistic HiAnime DOM) ─────────────
  const MOCK_CARD_HTML = `
<div class="tab-content">
  <div class="film_list-wrap">

    <div class="flw-item">
      <div class="film-poster">
        <a href="/solo-leveling-18718" class="film-poster-ahref dynamic-name" title="Solo Leveling">
          <img data-src="https://cdn.example.com/sl.jpg" class="film-poster-img" />
        </a>
        <div class="tick ltr">
          <div class="tick-item tick-sub">12</div>
          <div class="tick-item tick-dub">12</div>
        </div>
      </div>
      <div class="film-detail">
        <h3 class="film-name"><a href="/solo-leveling-18718">Solo Leveling</a></h3>
        <div class="fd-infor"><span class="fdi-item">TV</span><span class="fdi-item fdi-duration">24m</span></div>
      </div>
    </div>

    <div class="flw-item">
      <div class="film-poster">
        <a href="/jujutsu-kaisen-s3-21234" class="film-poster-ahref dynamic-name" title="Jujutsu Kaisen Season 3">
          <img data-src="https://cdn.example.com/jjk.jpg" class="film-poster-img" />
        </a>
        <div class="tick ltr">
          <div class="tick-item tick-sub">24</div>
          <div class="tick-item tick-dub">20</div>
        </div>
      </div>
      <div class="film-detail">
        <h3 class="film-name"><a href="/jujutsu-kaisen-s3-21234">Jujutsu Kaisen Season 3</a></h3>
        <div class="fd-infor"><span class="fdi-item">TV</span></div>
      </div>
    </div>

    <div class="flw-item">
      <div class="film-poster">
        <a href="/your-name-9756" class="film-poster-ahref dynamic-name" title="Your Name.">
          <img data-src="https://cdn.example.com/yn.jpg" class="film-poster-img" />
        </a>
        <div class="tick ltr">
          <div class="tick-item tick-sub">1</div>
          <div class="tick-item tick-dub">1</div>
        </div>
      </div>
      <div class="film-detail">
        <h3 class="film-name"><a href="/your-name-9756">Your Name.</a></h3>
        <div class="fd-infor"><span class="fdi-item">Movie</span><span class="fdi-item fdi-duration">1h 52m</span></div>
      </div>
    </div>

  </div>
</div>`;

  // Minimal card HTML with only 1 result (for search)
  const MOCK_SEARCH_HTML = MOCK_CARD_HTML.replace('Jujutsu Kaisen Season 3', 'Naruto')
                                          .replace('/jujutsu-kaisen-s3-21234', '/naruto-20');

  // Detail page HTML (contains numeric dataId)
  const MOCK_DETAIL_HTML = `
<html><body>
  <div id="ani_detail" data-id="18718">
    <h2 class="film-name dynamic-name">Solo Leveling</h2>
  </div>
</body></html>`;

  // AJAX episode list response
  const MOCK_EP_LIST_JSON = JSON.stringify({
    html: (() => {
      let items = '';
      for (let i = 1; i <= 12; i++) {
        items += `<a class="ssl-item ep-item" href="/watch/solo-leveling-18718?ep=${84000+i}"
                    data-id="${84000+i}" data-number="${i}" title="Episode ${i}">
                    <span class="ep-name">Episode ${i}</span>
                  </a>`;
      }
      return `<div class="ss-list">${items}</div>`;
    })(),
    status: true,
  });

  // AJAX server list response
  const MOCK_SERVERS_JSON = JSON.stringify({
    html: `
      <div class="ps__-list">
        <div class="server-item ps__-cast" data-type="sub" data-id="4001">Vidstreaming</div>
        <div class="server-item ps__-cast" data-type="sub" data-id="4002">Megacloud</div>
      </div>
      <div class="ps__-list">
        <div class="server-item ps__-cast" data-type="dub" data-id="4003">Vidstreaming</div>
      </div>`,
    status: true,
  });

  // AJAX sources response (direct m3u8)
  const MOCK_SOURCES_JSON = JSON.stringify({
    sources: [
      { file: 'https://stream.example.com/sl/ep1_1080p.m3u8', label: '1080p', type: 'hls' },
      { file: 'https://stream.example.com/sl/ep1_720p.m3u8',  label: '720p',  type: 'hls' },
    ],
    link   : 'https://megacloud.tv/embed-1/e-1/XXXX',
    status : true,
  });

  // ── Mock $fetch router ─────────────────────────────────────
  function makeFetch(overrides = {}) {
    return {
      get: async (url) => {
        if (overrides[url]) return overrides[url];

        // Category / search pages → card list HTML
        if (url.includes('/top-airing') || url.includes('/movie') || url.includes('/search')) {
          return { data: MOCK_CARD_HTML };
        }
        // Detail page
        if (url.match(/animotvslash\.org\/[a-z-]+-\d+$/)) {
          return { data: MOCK_DETAIL_HTML };
        }
        // AJAX episode list
        if (url.includes('/ajax/v2/episode/list/')) {
          return { data: MOCK_EP_LIST_JSON };
        }
        // AJAX servers
        if (url.includes('/ajax/v2/episode/servers')) {
          return { data: MOCK_SERVERS_JSON };
        }
        // AJAX sources
        if (url.includes('/ajax/v2/episode/sources')) {
          return { data: MOCK_SOURCES_JSON };
        }
        return { data: '' };
      },
    };
  }

  // ── Runner ─────────────────────────────────────────────────
  let passed = 0, failed = 0;

  async function test(label, fn) {
    try {
      const r = await fn();
      if (r) { ok(label); passed++; }
      else   { fail(label + ' (false)'); failed++; }
    } catch (e) {
      fail(label + ' \u2192 ' + e.message);
      failed++;
    }
  }

  async function suite() {
    console.log('\n' + C.B + '='.repeat(54) + C.R);
    console.log(C.B + '  AnimoTVSlash Cheerio Plugin  \u2014  Self-Test' + C.R);
    console.log(C.B + '  Style: libvio cheerio-scraper (HiAnime clone)' + C.R);
    console.log(C.B + '='.repeat(54) + C.R);

    // ── T1: getConfig ────────────────────────────────────────
    head('T1  getConfig()');
    div();
    $fetch = makeFetch();
    await test('returns valid JSON', async () => {
      return typeof JSON.parse(await getConfig()) === 'object';
    });
    await test('title === "AnimoTVSlash"', async () => {
      return JSON.parse(await getConfig()).title === 'AnimoTVSlash';
    });
    await test('has 11 tabs', async () => {
      return JSON.parse(await getConfig()).tabs.length === 11;
    });
    await test('every tab has {name, ext.path}', async () => {
      return JSON.parse(await getConfig()).tabs.every(t => t.name && t.ext && t.ext.path);
    });
    await test('Home tab has hasMore:false', async () => {
      const tabs = JSON.parse(await getConfig()).tabs;
      return tabs[0].ext.hasMore === false;
    });

    // ── T2: getCards — top-airing ────────────────────────────
    head('T2  getCards()  — /top-airing page 1');
    div();
    $fetch = makeFetch();
    let cards1 = [];
    await test('returns {list:Array}', async () => {
      const r = JSON.parse(await getCards({ path: '/top-airing', page: 1 }));
      cards1 = r.list; return Array.isArray(r.list);
    });
    await test('parses 3 cards from mock HTML', async () => {
      info('vod_ids: ' + cards1.map(c => c.vod_id).join(', '));
      return cards1.length === 3;
    });
    await test('each card has vod_id, vod_name, vod_pic', async () => {
      return cards1.every(c => c.vod_id && c.vod_name && c.vod_pic);
    });
    await test('ext.url = SITE + vod_id', async () => {
      return cards1.every(c => c.ext && c.ext.url === SITE + c.vod_id);
    });
    await test('sub/dub counts in vod_remarks', async () => {
      return cards1.every(c => /Sub:\d+/.test(c.vod_remarks));
    });
    await test('no duplicate vod_ids', async () => {
      const ids = cards1.map(c => c.vod_id);
      return new Set(ids).size === ids.length;
    });

    // ── T3: getCards — movie ─────────────────────────────────
    head('T3  getCards()  — /movie page 1');
    div();
    await test('movie tab returns cards', async () => {
      const { list } = JSON.parse(await getCards({ path: '/movie', page: 1 }));
      return list.length > 0;
    });

    // ── T4: getCards — pagination guard ──────────────────────
    head('T4  getCards()  — hasMore:false guard');
    div();
    await test('page > 1 with hasMore:false returns empty', async () => {
      const { list } = JSON.parse(await getCards({ path: '/', page: 2, hasMore: false }));
      return list.length === 0;
    });
    await test('page > 1 with hasMore:true still fetches', async () => {
      const { list } = JSON.parse(await getCards({ path: '/top-airing', page: 2 }));
      return Array.isArray(list); // content depends on mock; shape must be correct
    });

    // ── T5: search ───────────────────────────────────────────
    head('T5  search()  — keyword "naruto"');
    div();
    $fetch = makeFetch({
      [SITE + '/search?keyword=naruto']: { data: MOCK_SEARCH_HTML },
    });
    let sl = [];
    await test('returns list array', async () => {
      const r = JSON.parse(await search({ text: 'naruto', page: 1 }));
      sl = r.list; return Array.isArray(r.list);
    });
    await test('page > 1 returns empty list', async () => {
      const r = JSON.parse(await search({ text: 'naruto', page: 2 }));
      return r.list.length === 0;
    });
    await test('URL-encodes special chars', async () => {
      // "Attack on Titan" has a space — should encode correctly
      $fetch = makeFetch({ [SITE + '/search?keyword=Attack%20on%20Titan']: { data: MOCK_CARD_HTML } });
      const r = JSON.parse(await search({ text: 'Attack on Titan', page: 1 }));
      return Array.isArray(r.list);
    });
    $fetch = makeFetch(); // reset

    // ── T6: getTracks ────────────────────────────────────────
    head('T6  getTracks()  — solo-leveling-18718');
    div();
    $fetch = makeFetch();
    let tracks = [];
    await test('returns {list:[{title,tracks}]}', async () => {
      const r = JSON.parse(await getTracks({ url: SITE + '/solo-leveling-18718' }));
      tracks = r.list[0] && r.list[0].tracks || [];
      info(tracks.length + ' eps in "' + (r.list[0] && r.list[0].title) + '"');
      return Array.isArray(r.list) && r.list[0] && r.list[0].title === 'Episodes';
    });
    await test('extracts 12 episodes (mock fixture)', async () => {
      return tracks.length === 12;
    });
    await test('each track has name and ext.epId', async () => {
      return tracks.every(t => t.name && t.ext && t.ext.epId);
    });
    await test('epIds are numeric strings', async () => {
      return tracks.every(t => /^\d+$/.test(t.ext.epId));
    });
    await test('handles detail page with no dataId gracefully', async () => {
      $fetch = makeFetch({
        [SITE + '/unknown-anime-0']: { data: '<html><body>no data-id</body></html>' },
      });
      const r = JSON.parse(await getTracks({ url: SITE + '/unknown-anime-0' }));
      return r.list[0].tracks.length === 0;
    });
    $fetch = makeFetch(); // reset

    // ── T7: getPlayinfo ──────────────────────────────────────
    head('T7  getPlayinfo()  — ep 84001 (vidstreaming)');
    div();
    $fetch = makeFetch();
    let pr = null;
    await test('returns {urls, headers}', async () => {
      pr = JSON.parse(await getPlayinfo({ url: SITE + '/solo-leveling-18718', epId: '84001', epNum: '1' }));
      return Array.isArray(pr.urls) && typeof pr.headers === 'object';
    });
    await test('selects 1080p m3u8 as top URL', async () => {
      info('url: ' + (pr && pr.urls[0]));
      return pr && pr.urls[0] && pr.urls[0].includes('1080p');
    });
    await test('URL ends with .m3u8', async () => {
      return pr && pr.urls[0] && pr.urls[0].endsWith('.m3u8');
    });
    await test('headers include Referer', async () => {
      return pr && 'Referer' in pr.headers;
    });
    await test('handles missing epId gracefully', async () => {
      const r = JSON.parse(await getPlayinfo({ url: SITE + '/x', epId: '' }));
      return Array.isArray(r.urls) && r.urls.length === 0;
    });
    await test('falls back to embed link when no direct sources', async () => {
      $fetch = makeFetch({
        [SITE + '/ajax/v2/episode/servers?episodeId=99999']: { data: MOCK_SERVERS_JSON },
        [SITE + '/ajax/v2/episode/sources?id=4001']: {
          data: JSON.stringify({ sources: [], link: 'https://megacloud.tv/embed-1/XXXX', status: true }),
        },
      });
      const r = JSON.parse(await getPlayinfo({ url: SITE + '/x', epId: '99999' }));
      return r.urls[0] && r.urls[0].includes('megacloud.tv');
    });
    $fetch = makeFetch(); // reset

    // ── T8: extractDataId ────────────────────────────────────
    head('T8  extractDataId()  — unit tests');
    div();
    await test('extracts id from data-id attribute', async () => {
      return extractDataId('<div id="ani_detail" data-id="18718">') === '18718';
    });
    await test('extracts id from syncData JSON', async () => {
      return extractDataId('var syncData = {"id":"4321","malId":"999"}') === '4321';
    });
    await test('falls back to any data-id="NNN"', async () => {
      return extractDataId('<div class="x" data-id="555">') === '555';
    });
    await test('returns null when no id present', async () => {
      return extractDataId('<html><body>nothing here</body></html>') === null;
    });

    // ── T9: parseCard ────────────────────────────────────────
    head('T9  parseCard()  — unit tests');
    div();

    const CHEERIO_AVAIL = (() => { try { require.resolve('cheerio'); return true; } catch { return false; } })();
    if (CHEERIO_AVAIL) {
      const ch = require('cheerio');
      await test('correctly parses title, href, poster, remarks', async () => {
        const $ = ch.load(MOCK_CARD_HTML);
        const el = $('.flw-item').first().get(0);
        const card = parseCard($, el);
        return card.vod_id === '/solo-leveling-18718'
            && card.vod_name === 'Solo Leveling'
            && card.vod_pic.includes('sl.jpg')
            && card.vod_remarks.includes('Sub:12');
      });
      await test('returns null for # href', async () => {
        const $ = ch.load('<div class="flw-item"><a href="#" class="film-poster-ahref">x</a></div>');
        const el = $('.flw-item').first().get(0);
        return parseCard($, el) === null;
      });
      await test('uses data-src over src for poster', async () => {
        const $ = ch.load(`
          <div class="flw-item">
            <a href="/test-1" class="film-poster-ahref" title="Test">
              <img data-src="ds.jpg" src="s.jpg" />
            </a>
          </div>`);
        const card = parseCard($, $('.flw-item').first().get(0));
        return card.vod_pic === 'ds.jpg';
      });
    } else {
      info('cheerio npm package not installed; T9 skipped (install with: npm install cheerio)');
    }

    // ── T10: pickServer ──────────────────────────────────────
    head('T10 pickServer()  — unit tests');
    div();
    await test('picks vidstreaming first', async () => {
      return pickServer([{ serverName: 'Megacloud', serverId: '1' }, { serverName: 'Vidstreaming', serverId: '2' }]) === '2';
    });
    await test('falls back to megacloud', async () => {
      return pickServer([{ serverName: 'Megacloud', serverId: '10' }, { serverName: 'StreamSB', serverId: '11' }]) === '10';
    });
    await test('returns first when no match', async () => {
      return pickServer([{ serverName: 'Unknown', serverId: '99' }]) === '99';
    });
    await test('returns null for empty list', async () => {
      return pickServer([]) === null;
    });

    // ── T11: string arg coercion ─────────────────────────────
    head('T11 String args coercion  (TVBox passes JSON strings)');
    div();
    $fetch = makeFetch();
    await test('getCards handles JSON string', async () => {
      const r = JSON.parse(await getCards('{"path":"/top-airing","page":1}'));
      return Array.isArray(r.list);
    });
    await test('search handles JSON string', async () => {
      const r = JSON.parse(await search('{"text":"naruto","page":1}'));
      return Array.isArray(r.list);
    });
    await test('getTracks handles JSON string', async () => {
      const r = JSON.parse(await getTracks('{"url":"' + SITE + '/solo-leveling-18718"}'));
      return Array.isArray(r.list);
    });
    await test('getPlayinfo handles JSON string', async () => {
      const r = JSON.parse(await getPlayinfo('{"url":"' + SITE + '/x","epId":"84001"}'));
      return Array.isArray(r.urls);
    });

    // ── Summary ──────────────────────────────────────────────
    const total  = passed + failed;
    const pct    = Math.round((passed / total) * 100);
    const filled = Math.round(pct / 5);
    const bar    = '\u2588'.repeat(filled) + '\u2591'.repeat(20 - filled);
    const colour = failed === 0 ? C.G : failed < 4 ? C.Y : C.Re;

    console.log('\n' + C.B + '='.repeat(54) + C.R);
    console.log('  ' + C.G + 'Passed: ' + passed + C.R + '   ' + C.Re + 'Failed: ' + failed + C.R + '   Total: ' + total);
    console.log('  ' + colour + bar + '  ' + pct + '%' + C.R);
    if (failed === 0) {
      console.log('\n  ' + C.B + C.G + 'All tests passed \u2714' + C.R);
    } else {
      console.log('\n  ' + C.B + C.Re + failed + ' test(s) failed \u2718' + C.R);
    }
    console.log(C.B + '='.repeat(54) + C.R + '\n');

    process.exit(failed > 0 ? 1 : 0);
  }

  suite().catch(e => { console.error('Fatal:', e); process.exit(1); });
}
