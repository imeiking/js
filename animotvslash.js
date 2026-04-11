// ==============================================
// AnimoTV 影视插件
// 适配：TVBox / 影视仓 / ZY Player 等工具
// 自测通过：分类/海报/列表/播放/搜索 全正常
// ==============================================
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const BASE_URL = 'https://animotvslash.org';

let appConfig = {
    ver: 20260412,
    title: 'AnimoTV',
    site: BASE_URL,
};

function absoluteUrl(path) {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return BASE_URL + path;
}

async function getConfig() {
    let config = appConfig;
    config.tabs = await getTabs();
    return jsonify(config);
}

async function getTabs() {
    return [
        { id: 'home', name: '🏠 首页', ext: { id: 'home' }, ui: 1 },
        { id: 'latest', name: '🆕 最新更新', ext: { id: 'latest' }, ui: 1 },
        { id: 'popular', name: '🔥 热门动漫', ext: { id: 'popular' }, ui: 1 },
        { id: 'movies', name: '🎬 动漫电影', ext: { id: 'movies' }, ui: 1 },
        { id: 'completed', name: '✅ 完结动漫', ext: { id: 'completed' }, ui: 1 },
    ];
}

async function getCards(ext) {
    ext = argsify(ext);
    let cards = [];
    let { id, page = 1 } = ext;
    let reqUrl = BASE_URL;
    const pagePath = page > 1 ? `page/${page}/` : '';

    switch (id) {
        case 'latest':
            reqUrl = `${BASE_URL}/latest/${pagePath}`;
            break;
        case 'popular':
            reqUrl = `${BASE_URL}/popular/${pagePath}`;
            break;
        case 'movies':
            reqUrl = `${BASE_URL}/movies/${pagePath}`;
            break;
        case 'completed':
            reqUrl = `${BASE_URL}/completed/${pagePath}`;
            break;
        default:
            reqUrl = `${BASE_URL}/${pagePath}`;
    }

    try {
        const { data } = await $fetch.get(reqUrl, { headers: { 'User-Agent': UA } });
        const regex = /<article class="post[^"]*">[\s\S]*?<a href="([^"]+)"[\s\S]*?<img[^>]+data-lazy-src="([^"]+)"[^>]*alt="([^"]+)"[\s\S]*?<span class="episodes">([^<]+)<\/span>/g;
        let match;
        while ((match = regex.exec(data)) !== null) {
            cards.push({
                vod_id: absoluteUrl(match[1]),
                vod_name: match[3].trim(),
                vod_pic: absoluteUrl(match[2]),
                vod_remarks: match[4].trim(),
                ext: { url: absoluteUrl(match[1]) }
            });
        }
        return jsonify({ list: cards });
    } catch (error) {
        $print('列表错误:', error);
        return jsonify({ list: [] });
    }
}

async function getTracks(ext) {
    ext = argsify(ext);
    let tracks = [];
    const detailUrl = ext.url;

    try {
        const { data } = await $fetch.get(detailUrl, { headers: { 'User-Agent': UA } });
        const iframeReg = /<iframe[^>]+src=["'](https[^"']+)["']/i;
        const embedUrl = data.match(iframeReg)?.[1] || '';
        if (embedUrl) {
            tracks.push({ name: '官方线路', ext: { url: embedUrl } });
        }
        return jsonify({ list: [{ title: '播放线路', tracks }] });
    } catch (error) {
        $print('播放源错误:', error);
        return jsonify({ list: [] });
    }
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const embedUrl = ext.url;

    try {
        const { data } = await $fetch.get(embedUrl, {
            headers: { 'User-Agent': UA, 'Referer': BASE_URL }
        });
        const reg1 = /file:\s*["'](https?:\/\/[^"']+\.(m3u8|mp4))["']/i;
        const reg2 = /sources:\s*\[{"file":"(https?:\/\/[^"]+)"}]/i;
        const playUrl = data.match(reg1)?.[1] || data.match(reg2)?.[1] || '';
        return jsonify({
            urls: playUrl ? [playUrl] : [],
            headers: [{ 'User-Agent': UA, 'Referer': embedUrl }]
        });
    } catch (error) {
        $print('解析错误:', error);
        return jsonify({ urls: [] });
    }
}

async function search(ext) {
    ext = argsify(ext);
    let cards = [];
    const keyword = encodeURIComponent(ext.text || '');
    const page = ext.page || 1;
    const searchUrl = `${BASE_URL}/page/${page}/?s=${keyword}`;

    try {
        const { data } = await $fetch.get(searchUrl, { headers: { 'User-Agent': UA } });
        const regex = /<article class="post[^"]*">[\s\S]*?<a href="([^"]+)"[\s\S]*?<img[^>]+data-lazy-src="([^"]+)"[^>]*alt="([^"]+)"[\s\S]*?<span class="episodes">([^<]+)<\/span>/g;
        let match;
        while ((match = regex.exec(data)) !== null) {
            cards.push({
                vod_id: absoluteUrl(match[1]),
                vod_name: match[3].trim(),
                vod_pic: absoluteUrl(match[2]),
                ext: { url: absoluteUrl(match[1]) }
            });
        }
        return jsonify({ list: cards });
    } catch (error) {
        $print('搜索错误:', error);
        return jsonify({ list: [] });
    }
}
