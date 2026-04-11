const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let appConfig = {
    ver: 20260412,
    title: 'AnimoTV Final Pro',
    site: 'https://animotvslash.org',
};

/**
 * 获取插件基础配置
 */
async function getConfig() {
    let config = appConfig;
    config.tabs = await getTabs();
    return jsonify(config);
}

/**
 * 获取分类列表
 */
async function getTabs() {
    return [
        { id: '/animes/', name: '全部动画', ui: 1 },
        { id: '/type/tv-series/', name: '连载番剧', ui: 1 },
        { id: '/type/movies/', name: '剧场版', ui: 1 },
        { id: '/genre/action/', name: '动作', ui: 1 },
        { id: '/genre/adventure/', name: '冒险', ui: 1 },
    ];
}

/**
 * 获取视频列表（含海报修复逻辑）
 */
async function getCards(ext) {
    ext = argsify(ext);
    let { id, page = 1 } = ext;
    const url = page === 1 ? `${appConfig.site}${id}` : `${appConfig.site}${id}page/${page}/`;

    try {
        const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } });
        let cards = [];
        
        // 精准匹配海报容器块
        const regex = /<div class="poster">([\s\S]*?)<\/div>/g;
        let match;
        while ((match = regex.exec(data)) !== null) {
            const block = match[1];
            
            const href = block.match(/href="([^"]+)"/)?.[1];
            const name = block.match(/alt="([^"]+)"/)?.[1];
            // 解决懒加载，按优先级获取图片地址
            let pic = block.match(/data-lazy-src="([^"]+)"/)?.[1] || 
                      block.match(/data-src="([^"]+)"/)?.[1] || 
                      block.match(/src="([^"]+)"/)?.[1];

            if (href && name && pic && !pic.includes('blank.gif')) {
                cards.push({
                    vod_id: href,
                    vod_name: name,
                    vod_pic: pic,
                    vod_remarks: 'Update',
                    ext: { url: href },
                });
            }
        }
        return jsonify({ list: cards });
    } catch (e) {
        $print(e);
        return jsonify({ list: [] });
    }
}

/**
 * 获取选集列表
 */
async function getTracks(ext) {
    ext = argsify(ext);
    const { data } = await $fetch.get(ext.url, { headers: { 'User-Agent': UA } });
    let tracks = [];

    // 1. 尝试识别连载剧集列表
    const epListMatch = data.match(/<ul class="episodios">([\s\S]*?)<\/ul>/);
    
    if (epListMatch) {
        const epRegex = /<a href="([^"]+)">(\d+)<\/a>/g;
        let epMatch;
        while ((epMatch = epRegex.exec(epListMatch[1])) !== null) {
            tracks.push({
                name: '第 ' + epMatch[2] + ' 集',
                ext: { url: epMatch[1] },
            });
        }
    } 
    
    // 2. 如果没有选集列表或者是单集页面，直接抓取 iframe
    if (tracks.length === 0) {
        const iframeMatch = data.match(/<iframe[^>]*src="([^"]+)"/i);
        if (iframeMatch) {
            let pUrl = iframeMatch[1].startsWith('//') ? 'https:' + iframeMatch[1] : iframeMatch[1];
            tracks.push({ name: '正片', ext: { url: pUrl } });
        }
    }

    // reverse() 确保集数从第1集开始正序排列
    return jsonify({ 
        list: [{ title: '资源列表', tracks: tracks.reverse() }] 
    });
}

/**
 * 获取最终播放地址（含二次网页解析逻辑）
 */
async function getPlayinfo(ext) {
    ext = argsify(ext);
    let playUrl = ext.url;

    // 如果拿到的是中间页链接，则深入解析出真正的 iframe 地址
    if (playUrl.includes('animotvslash.org')) {
        try {
            const { data } = await $fetch.get(playUrl, { headers: { 'User-Agent': UA } });
            const iframeMatch = data.match(/<iframe[^>]*src="([^"]+)"/i);
            if (iframeMatch) {
                playUrl = iframeMatch[1].startsWith('//') ? 'https:' + iframeMatch[1] : iframeMatch[1];
            }
        } catch (e) { $print(e); }
    }

    return jsonify({
        urls: [playUrl],
        headers: [{ 
            'User-Agent': UA, 
            'Referer': 'https://animotvslash.org/',
            'Origin': 'https://animotvslash.org'
        }]
    });
}

/**
 * 搜索功能
 */
async function search(ext) {
    ext = argsify(ext);
    const url = `${appConfig.site}/?s=${encodeURIComponent(ext.text)}`;
    const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } });

    let cards = [];
    const regex = /<div class="result-item">([\s\S]*?)<\/div>/g;
    let match;
    while ((match = regex.exec(data)) !== null) {
        const block = match[1];
        const href = block.match(/href="([^"]+)"/)?.[1];
        const name = block.match(/alt="([^"]+)"/)?.[1];
        const pic = block.match(/src="([^"]+)"/)?.[1];

        if (href && name) {
            cards.push({
                vod_id: href,
                vod_name: name,
                vod_pic: pic,
                ext: { url: href },
            });
        }
    }
    return jsonify({ list: cards });
}
