/**
 * XPTV Extension - yFlix
 * https://yflix.to
 *
 * Notes:
 * 1. Lists/search/detail follow yFlix's current HTML structure.
 * 2. Episodes and servers come from yFlix's current ajax endpoints.
 * 3. Playback is resolved by loading the site's own obfuscated helper script
 *    into a lightweight sandbox and reusing its exposed decoder helpers.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'

const BASE = 'https://yflix.to'

const HEADERS = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': BASE + '/',
    'Origin': BASE,
}

const AJAX_HEADERS = {
    'User-Agent': UA,
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': BASE + '/',
    'Origin': BASE,
    'X-Requested-With': 'XMLHttpRequest',
}

const TABS = [
    { name: 'Home', ext: { path: '/home', page: 1 } },
    { name: 'Movies', ext: { path: '/movie', page: 1 } },
    { name: 'TV-Series', ext: { path: '/tv', page: 1 } },
    { name: 'Top IMDb', ext: { path: '/top-imdb', page: 1 } },
    { name: 'Updates', ext: { path: '/updates', page: 1 } },
]

const CONFIG = {
    ver: 1,
    title: 'yFlix',
    site: BASE,
    tabs: TABS,
}

const signerCache = {}
const pageCache = {}

function tidy(text) {
    return String(text || '').replace(/\s+/g, ' ').trim()
}

function absoluteUrl(url) {
    const value = tidy(url)
    if (!value) return ''
    if (/^https?:\/\//i.test(value)) return value
    if (value.startsWith('//')) return 'https:' + value
    if (value.startsWith('/')) return BASE + value
    return BASE + '/' + value.replace(/^\.?\//, '')
}

function buildQuery(params) {
    return Object.keys(params || {})
        .filter(key => params[key] !== undefined && params[key] !== null && params[key] !== '')
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&')
}

async function fetchText(url, headers) {
    const { data } = await $fetch.get(url, { headers: headers || HEADERS })
    return typeof data === 'string' ? data : String(data || '')
}

async function fetchJson(url, headers) {
    const text = await fetchText(url, headers)
    return JSON.parse(text)
}

function getPagedUrl(path, page) {
    const url = absoluteUrl(path)
    const nextPage = parseInt(page || '1', 10) || 1
    if (nextPage <= 1) return url
    return url + (url.includes('?') ? '&' : '?') + 'page=' + nextPage
}

function parseCard($item) {
    const poster = $item.find('a.poster').first()
    const titleLink = $item.find('.info .title').first()
    const url = absoluteUrl(poster.attr('href') || titleLink.attr('href') || '')
    const title = tidy(titleLink.text())
    const pic = absoluteUrl(
        $item.find('img').attr('data-src') ||
        $item.find('img').attr('src') ||
        ''
    )
    const quality = tidy($item.find('.quality').first().text())
    const meta = $item.find('.metadata span').toArray().map(node => tidy($(node).text())).filter(Boolean)

    if (!url || !title) return null

    const remark = [quality].concat(meta).filter(Boolean).join(' | ')

    return {
        vod_id: url,
        vod_name: title,
        vod_pic: pic,
        vod_remarks: remark,
        ext: { url },
    }
}

function parseCardsFromHtml(html) {
    const $ = createCheerio()(html)
    const list = $('.film-section .item').toArray()
        .map(node => parseCard($(node)))
        .filter(Boolean)

    const hasMore = $('.pagination a[rel="next"], .pagination .next a, .pagination a.next').length > 0

    return { $, list, hasMore }
}

function parseSearchExt(ext) {
    const next = argsify(ext)
    next.text = tidy(next.text || '')
    next.page = parseInt(next.page || '1', 10) || 1
    return next
}

function parseCardsExt(ext) {
    const next = argsify(ext)
    next.path = tidy(next.path || '/home')
    next.page = parseInt(next.page || '1', 10) || 1
    return next
}

function getBase64Api() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='

    function btoaPolyfill(input) {
        let str = String(input)
        let output = ''
        let block
        let charCode
        let idx = 0
        let map = chars

        while (str.charAt(idx | 0) || (map = '=', idx % 1)) {
            charCode = str.charCodeAt(idx += 3 / 4)
            if (charCode > 0xff) {
                throw new Error('btoa failed: character code exceeds 0xFF')
            }
            block = block << 8 | charCode
            output += map.charAt(63 & block >> 8 - idx % 1 * 8)
        }

        return output
    }

    function atobPolyfill(input) {
        let str = String(input).replace(/=+$/, '')
        if (str.length % 4 === 1) {
            throw new Error('atob failed: invalid base64 string')
        }
        let output = ''
        let bc = 0
        let bs
        let buffer
        let idx = 0

        while ((buffer = str.charAt(idx++))) {
            buffer = chars.indexOf(buffer)
            if (buffer === -1) continue
            bs = bc % 4 ? bs * 64 + buffer : buffer
            if (bc++ % 4) {
                output += String.fromCharCode(255 & bs >> (-2 * bc & 6))
            }
        }

        return output
    }

    return {
        atob: typeof atob === 'function' ? atob : atobPolyfill,
        btoa: typeof btoa === 'function' ? btoa : btoaPolyfill,
    }
}

function makeStub(documentRef, name) {
    const node = {
        tagName: String(name || 'stub').toUpperCase(),
        style: {},
        dataset: {},
        classList: {
            add() {},
            remove() {},
            contains() { return false },
            toggle() {},
        },
        children: [],
        attributes: {},
        innerHTML: '',
        textContent: '',
        src: '',
        href: '',
        value: '',
        ownerDocument: documentRef,
        getAttribute(key) { return this.attributes[key] || '' },
        setAttribute(key, value) { this.attributes[key] = String(value) },
        removeAttribute(key) { delete this.attributes[key] },
        appendChild(child) { this.children.push(child); return child },
        insertBefore(child) { this.children.push(child); return child },
        removeChild() {},
        addEventListener() {},
        removeEventListener() {},
        querySelector() { return makeStub(documentRef, name + '.qs') },
        querySelectorAll() { return [] },
        getElementsByTagName() { return [] },
        getBoundingClientRect() {
            return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }
        },
        toString() { return '' },
        valueOf() { return 0 },
    }

    return new Proxy(node, {
        get(target, prop) {
            if (prop in target) return target[prop]
            if (prop === Symbol.toPrimitive) return () => ''
            return makeStub(documentRef, name + '.' + String(prop))
        },
        apply() {
            return makeStub(documentRef, name + '()')
        },
    })
}

function buildSignerSandbox(pageUrl, dataMeta, ratingId, secret) {
    const base64Api = getBase64Api()
    const documentRef = {
        readyState: 'complete',
        title: 'yFlix',
        body: null,
        head: null,
        documentElement: null,
        addEventListener() {},
        removeEventListener() {},
    }

    const watchPage = {
        tagName: 'DIV',
        ownerDocument: documentRef,
        attributes: { 'data-meta': dataMeta || '' },
        getAttribute(name) { return this.attributes[name] || '' },
        setAttribute(name, value) { this.attributes[name] = String(value) },
        removeAttribute(name) { delete this.attributes[name] },
        addEventListener() {},
        removeEventListener() {},
        querySelector() { return makeStub(documentRef, '#watch-page') },
        querySelectorAll() { return [] },
        getElementsByTagName() { return [] },
    }

    const ratingNode = {
        tagName: 'DIV',
        ownerDocument: documentRef,
        attributes: { 'data-id': ratingId || '' },
        getAttribute(name) { return this.attributes[name] || '' },
        setAttribute(name, value) { this.attributes[name] = String(value) },
        removeAttribute(name) { delete this.attributes[name] },
        addEventListener() {},
        removeEventListener() {},
        querySelector() { return makeStub(documentRef, '#movie-rating') },
        querySelectorAll() { return [] },
        getElementsByTagName() { return [] },
    }

    documentRef.body = makeStub(documentRef, 'body')
    documentRef.head = makeStub(documentRef, 'head')
    documentRef.documentElement = makeStub(documentRef, 'html')
    documentRef.createElement = tag => makeStub(documentRef, tag)
    documentRef.getElementsByTagName = () => [makeStub(documentRef, 'tag')]
    documentRef.getElementById = id => {
        if (id === 'watch-page') return watchPage
        if (id === 'movie-rating') return ratingNode
        return makeStub(documentRef, id)
    }
    documentRef.querySelector = selector => {
        if (selector === '#watch-page') return watchPage
        if (selector === '#movie-rating') return ratingNode
        return makeStub(documentRef, selector)
    }
    documentRef.querySelectorAll = () => []

    const sandbox = {
        window: null,
        self: null,
        globalThis: null,
        document: documentRef,
        navigator: { userAgent: UA, platform: 'Win32' },
        location: {
            href: pageUrl,
            hash: '',
            search: '',
            pathname: pageUrl.replace(/^https?:\/\/[^/]+/, ''),
            origin: BASE,
            host: 'yflix.to',
            hostname: 'yflix.to',
        },
        console: {
            log() {},
            warn() {},
            error() {},
            clear() {},
            debug() {},
            info() {},
        },
        setTimeout() { return 1 },
        clearTimeout() {},
        setInterval() { return 1 },
        clearInterval() {},
        MutationObserver: function () {
            this.observe = function () {}
            this.disconnect = function () {}
        },
        XMLHttpRequest: function () {
            this.open = function () {}
            this.send = function () {}
            this.setRequestHeader = function () {}
        },
        URLSearchParams: typeof URLSearchParams !== 'undefined'
            ? URLSearchParams
            : function () {},
        atob: base64Api.atob,
        btoa: base64Api.btoa,
        fetch: async function () {
            return {
                ok: true,
                text: async () => '',
                json: async () => ({}),
            }
        },
        Image: function () {},
        Date,
        Math,
        JSON,
        RegExp,
        String,
        Number,
        Boolean,
        Array,
        Object,
        Promise,
        Error,
        parseInt,
        parseFloat,
        isNaN,
        decodeURIComponent,
        encodeURIComponent,
        decodeURI,
        encodeURI,
        __$: secret || '',
    }

    sandbox.window = sandbox
    sandbox.self = sandbox
    sandbox.globalThis = sandbox
    return sandbox
}

function loadSiteSigner(pageUrl, html) {
    const cacheKey = pageUrl
    if (signerCache[cacheKey]) return signerCache[cacheKey]

    const secretMatch = html.match(/window\.__\$\s*=\s*['"]([^'"]+)['"]/)
    const scriptMatch = html.match(/<script[^>]+src=["']([^"']*scripts-[^"']+\.js[^"']*)["']/i)
    const metaMatch = html.match(/id=["']watch-page["'][^>]+data-meta=["']([^"']+)["']/i)
    const ratingMatch = html.match(/id=["']movie-rating["'][^>]+data-id=["']([^"']+)["']/i)

    const secret = secretMatch ? secretMatch[1] : ''
    const scriptUrl = scriptMatch ? absoluteUrl(scriptMatch[1]) : ''
    const dataMeta = metaMatch ? metaMatch[1] : ''
    const ratingId = ratingMatch ? ratingMatch[1] : ''

    signerCache[cacheKey] = {
        secret,
        scriptUrl,
        dataMeta,
        ratingId,
        x: null,
    }

    return signerCache[cacheKey]
}

async function ensureSigner(pageUrl, html) {
    const signer = loadSiteSigner(pageUrl, html)
    if (signer.x || !signer.scriptUrl) return signer

    try {
        const scriptText = await fetchText(signer.scriptUrl, HEADERS)
        const sandbox = buildSignerSandbox(pageUrl, signer.dataMeta, signer.ratingId, signer.secret)
        const runner = new Function(
            'sandbox',
            'with (sandbox) { ' + scriptText + '\n; return sandbox; }'
        )
        try {
            runner(sandbox)
        } catch (e) {
            // The script throws after exposing helpers in a minimal sandbox.
        }
        if (sandbox.x) signer.x = sandbox.x
    } catch (e) {
        $print('ensureSigner error: ' + e)
    }

    return signer
}

function decodePlaybackResult(signer, cipherText) {
    if (!signer || !signer.x || typeof signer.x.q !== 'function') return ''
    try {
        return String(signer.x.q(cipherText))
    } catch (e) {
        $print('decodePlaybackResult error: ' + e)
        return ''
    }
}

function buildTokenCandidates(id, signer) {
    const raw = 'strict' + tidy(id)
    const tokens = []

    if (signer && signer.x) {
        try {
            if (typeof signer.x.W === 'function') tokens.push(String(signer.x.W(raw)))
        } catch (e) {}
        try {
            if (typeof signer.x.V === 'function') tokens.push(String(signer.x.V(raw)))
        } catch (e) {}
    }

    tokens.push(raw)
    tokens.push('')

    return [...new Set(tokens.filter(item => item !== undefined && item !== null))]
}

async function fetchAjaxWithToken(path, params, strictId, signer, refererUrl) {
    const tokenCandidates = buildTokenCandidates(strictId, signer)
    const headers = Object.assign({}, AJAX_HEADERS, {
        Referer: refererUrl || BASE + '/',
    })

    for (const token of tokenCandidates) {
        const query = Object.assign({}, params || {})
        if (token) query._ = token
        const url = BASE + path + '?' + buildQuery(query)

        try {
            const json = await fetchJson(url, headers)
            if (json && json.status === 'ok') return json
        } catch (e) {
            $print(`fetchAjaxWithToken ${path} token=${token || '<empty>'} error: ${e}`)
        }
    }

    return null
}

async function getWatchPage(url) {
    const key = absoluteUrl(url)
    if (pageCache[key]) return pageCache[key]

    const html = await fetchText(key, HEADERS)
    pageCache[key] = html
    return html
}

function parseEpisodeGroups(resultHtml, watchUrl, signer) {
    const $ = createCheerio()(resultHtml || '')
    const groups = []
    const seasons = $('.episodes').toArray()

    if (seasons.length === 0) {
        const tracks = $('a[eid]').toArray().map(node => {
            const $node = $(node)
            const eid = tidy($node.attr('eid'))
            const num = tidy($node.attr('num'))
            const title = tidy($node.attr('title') || $node.text())
            if (!eid) return null
            return {
                name: num ? `Episode ${num}` + (title ? ` ${title}` : '') : (title || 'Episode'),
                pan: '',
                ext: { url: watchUrl, eid },
            }
        }).filter(Boolean)

        if (tracks.length > 0) {
            groups.push({ title: 'Episodes', tracks })
        }
        return groups
    }

    seasons.forEach(seasonNode => {
        const $season = $(seasonNode)
        const seasonNo = tidy($season.attr('data-season'))
        const tracks = $season.find('a[eid]').toArray().map(node => {
            const $node = $(node)
            const eid = tidy($node.attr('eid'))
            const num = tidy($node.attr('num'))
            const title = tidy($node.attr('title') || $node.text())
            if (!eid) return null

            const name = num
                ? `E${num}` + (title ? ` ${title}` : '')
                : (title || 'Episode')

            return {
                name,
                pan: '',
                ext: {
                    url: watchUrl,
                    eid,
                    season: seasonNo,
                },
            }
        }).filter(Boolean)

        if (tracks.length > 0) {
            groups.push({
                title: seasonNo ? `Season ${seasonNo}` : 'Season',
                tracks,
            })
        }
    })

    return groups
}

function parseFirstServerId(resultHtml) {
    const $ = createCheerio()(resultHtml || '')
    return tidy($('.server[data-lid]').first().attr('data-lid') || '')
}

async function resolveServerId(eid, signer, refererUrl) {
    const json = await fetchAjaxWithToken(
        '/ajax/links/list',
        { eid },
        eid,
        signer,
        refererUrl
    )

    if (!json || !json.result) return ''
    return parseFirstServerId(json.result)
}

async function decodeWatchMeta(pageUrl, html, signer) {
    const $ = createCheerio()(html)
    const title = tidy($('h1.title').first().text())
    const ratingId = tidy($('#movie-rating').attr('data-id') || '')
    const metaText = $('#filmDetail .metadata.set span').toArray().map(node => tidy($(node).text()))
    const isTv = metaText.includes('TV')

    return { title, ratingId, isTv }
}

async function getConfig() {
    return jsonify(CONFIG)
}

async function getCards(ext) {
    ext = parseCardsExt(ext)
    const html = await fetchText(getPagedUrl(ext.path, ext.page), HEADERS)
    const parsed = parseCardsFromHtml(html)

    return jsonify({
        list: parsed.list,
        hasMore: parsed.hasMore,
        ext: {
            path: ext.path,
            page: ext.page + 1,
        },
    })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const watchUrl = absoluteUrl(ext.url || ext.vod_id || '')
    if (!watchUrl) return jsonify({ list: [] })

    try {
        const html = await getWatchPage(watchUrl)
        const signer = await ensureSigner(watchUrl, html)
        const meta = await decodeWatchMeta(watchUrl, html, signer)

        if (!meta.ratingId) {
            return jsonify({
                list: [{
                    title: meta.title || 'Play',
                    tracks: [{
                        name: meta.title || 'Play',
                        pan: '',
                        ext: { url: watchUrl },
                    }],
                }],
            })
        }

        if (!meta.isTv) {
            return jsonify({
                list: [{
                    title: meta.title || 'Movie',
                    tracks: [{
                        name: meta.title || 'Play',
                        pan: '',
                        ext: {
                            url: watchUrl,
                            eid: meta.ratingId,
                            ratingId: meta.ratingId,
                            movie: true,
                        },
                    }],
                }],
            })
        }

        const episodesJson = await fetchAjaxWithToken(
            '/ajax/episodes/list',
            { id: meta.ratingId },
            meta.ratingId,
            signer,
            watchUrl
        )

        if (!episodesJson || !episodesJson.result) {
            return jsonify({ list: [] })
        }

        return jsonify({
            list: parseEpisodeGroups(episodesJson.result, watchUrl, signer),
        })
    } catch (e) {
        $print('getTracks error: ' + e)
        return jsonify({ list: [] })
    }
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const watchUrl = absoluteUrl(ext.url || '')
    if (!watchUrl) {
        return jsonify({
            urls: [''],
            headers: [{ 'User-Agent': UA, Referer: BASE + '/' }],
        })
    }

    try {
        const html = await getWatchPage(watchUrl)
        const signer = await ensureSigner(watchUrl, html)
        const meta = await decodeWatchMeta(watchUrl, html, signer)

        let eid = tidy(ext.eid || ext.ratingId || meta.ratingId || '')
        let lid = tidy(ext.lid || '')

        if (!lid && eid) {
            lid = await resolveServerId(eid, signer, watchUrl)
        }

        if (!lid && meta.ratingId && !ext.eid) {
            lid = await resolveServerId(meta.ratingId, signer, watchUrl)
            if (!eid) eid = meta.ratingId
        }

        if (!lid) throw new Error('Unable to resolve server id')

        const viewJson = await fetchAjaxWithToken(
            '/ajax/links/view',
            { id: lid },
            lid,
            signer,
            watchUrl
        )

        if (!viewJson || !viewJson.result) throw new Error('Unable to fetch playback payload')

        let iframeUrl = ''
        const decoded = decodePlaybackResult(signer, viewJson.result)

        if (decoded) {
            try {
                const json = JSON.parse(decoded)
                iframeUrl = absoluteUrl(json.url || '')
            } catch (e) {
                iframeUrl = absoluteUrl(decoded)
            }
        }

        if (!iframeUrl && /^https?:\/\//i.test(viewJson.result || '')) {
            iframeUrl = absoluteUrl(viewJson.result)
        }

        if (!iframeUrl) throw new Error('Unable to decode playback url')

        return jsonify({
            urls: [iframeUrl],
            headers: [{
                'User-Agent': UA,
                'Referer': watchUrl,
                'Origin': BASE,
            }],
        })
    } catch (e) {
        $print('getPlayinfo error: ' + e)
        $utils.toastError('yFlix playback parse failed')
        return jsonify({
            urls: [''],
            headers: [{ 'User-Agent': UA, Referer: BASE + '/' }],
        })
    }
}

async function search(ext) {
    ext = parseSearchExt(ext)
    if (!ext.text) return jsonify({ list: [] })

    const path = `/filter?keyword=${encodeURIComponent(ext.text)}`
    const html = await fetchText(getPagedUrl(path, ext.page), HEADERS)
    const parsed = parseCardsFromHtml(html)

    return jsonify({
        list: parsed.list,
        hasMore: parsed.hasMore,
        ext: {
            text: ext.text,
            page: ext.page + 1,
        },
    })
}
