const cheerio = createCheerio();

// === 1. 基础配置 ===
let $config = argsify($config_str);
const SITE = $config.site || "https://animotvslash.org";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const baseHeaders = {
    'User-Agent': UA,
    'Referer': `${SITE}/`
};

// === 2. 获取分类菜单 ===
async function getConfig() {
    const appConfig = {
        ver: 1,
        title: "AnimoTV",
        site: SITE,
        tabs: [
            { name: 'TV动画', ext: { url: '/anime/?type=tv' } },
            { name: '剧场版', ext: { url: '/anime/?type=movie' } },
            { name: '最新更新', ext: { url: '/anime/?status=&type=&order=update' } }
        ]
    };
    return jsonify(appConfig);
}

// === 3. 获取视频列表 ===
async function getCards(ext) {
    ext = argsify(ext);
    let cards = [];
    let page = ext.page || 1;
    let url = SITE + ext.url;
    
    if (page > 1) {
        url = url.includes('?') ? url.replace('?', `/page/${page}/?`) : url.replace(/\/$/, '') + `/page/${page}/`;
    }

    const { data } = await $fetch.get(url, { headers: baseHeaders });
    const $ = cheerio.load(data);

    $('article.bs').each((_, each) => {
        const path = $(each).find('a').attr('href');
        if (path) {
            cards.push({
                vod_id: path,
                vod_name: $(each).find('.tt h2').text().trim(),
                vod_pic: $(each).find('img').attr('src'),
                vod_remarks: $(each).find('.epx').text().trim(),
                ext: { url: path.startsWith('http') ? path : SITE + path }
            });
        }
    });

    return jsonify({ list: cards });
}

// === 4. 获取剧集列表 (修复显示问题) ===
async function getTracks(ext) {
    const { url } = argsify(ext);
    const { data } = await $fetch.get(url, { headers: baseHeaders });
    const $ = cheerio.load(data);

    let group = { title: '在线播放', tracks: [] };

    // 尝试寻找所有可能的剧集列表容器
    const listItems = $('.eplister ul li a, .episodelist ul li a');
    
    if (listItems.length > 0) {
        listItems.each((_, item) => {
            // 提取剧集名称逻辑：优先找标题，找不到就取节点文字
            let name = $(item).find('.epl-num, h3').first().text().trim() || $(item).text().trim();
            
            // 清理多余文字，保持简洁
            name = name.replace(/Jujutsu Kaisen: The Culling Game Part 1/gi, "").trim();
            
            let link = $(item).attr('href');
            if (link) {
                group.tracks.push({
                    name: name || '播放',
                    ext: { url: link.startsWith('http') ? link : SITE + link }
                });
            }
        });
        
        // 简单的倒序检查：如果第一集的数字比最后一集大，说明是倒序排列，需要反转
        if (group.tracks.length > 1) {
            const firstNum = group.tracks[0].name.match(/\d+/);
            const lastNum = group.tracks[group.tracks.length - 1].name.match(/\d+/);
            if (firstNum && lastNum && parseInt(firstNum[0]) > parseInt(lastNum[0])) {
                group.tracks.reverse();
            }
        }
    } else {
        // 兜底：如果没找到列表，则提供当前页面作为单集
        group.tracks.push({ name: '播放本集', ext: { url: url } });
    }

    return jsonify({ list: [group] });
}

// === 5. 获取播放链接 (针对 XPTV 优化) ===
async function getPlayinfo(ext) {
    ext = argsify(ext);
    const { data } = await $fetch.get(ext.url, { headers: baseHeaders });
    const $ = cheerio.load(data);
    
    let playUrl = "";
    let parseMode = 1; // 默认开启 XPTV 嗅探模式

    // 优先提取 Moon (Filemoon) 线路，因为它在 XPTV 中嗅探最快最准
    $('select.mirror option').each((_, item) => {
        let val = $(item).attr('value');
        let label = $(item).text().toLowerCase();
        if (val && val.length > 20 && label.includes('moon')) {
            try {
                let decoded = decodeURIComponent(escape(atob(val)));
                let match = decoded.match(/src="([^"]+)"/);
                if (match) playUrl = match[1];
            } catch(e) {}
        }
    });

    // 如果没找到 Moon，则寻找 Rumble 直链 (m3u8)
    if (!playUrl) {
        let m3u8Match = data.match(/"contentUrl"\s*:\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/i);
        if (m3u8Match) {
            playUrl = m3u8Match[1];
            parseMode = 0; // m3u8 是直链，不需要嗅探
        }
    }

    // 最终兜底：解密第一个可用的线路
    if (!playUrl) {
        const firstOption = $('select.mirror option').toArray().find(o => $(o).attr('value')?.length > 20);
        if (firstOption) {
            let decoded = decodeURIComponent(escape(atob($(firstOption).attr('value'))));
            let match = decoded.match(/src="([^"]+)"/);
            if (match) playUrl = match[1];
        }
    }

    return jsonify({
        urls: [ playUrl ],
        parse: parseMode,
        headers: {
            'User-Agent': UA,
            'Referer': playUrl ? new URL(playUrl).origin + '/' : SITE
        }
    });
}

// === 6. 搜索功能 ===
async function search(ext) {
    ext = argsify(ext);
    const url = SITE + `/?s=${encodeURIComponent(ext.text)}`;
    const { data } = await $fetch.get(url, { headers: baseHeaders });
    const $ = cheerio.load(data);
    let cards = [];

    $('article.bs').each((_, each) => {
        cards.push({
            vod_id: $(each).find('a').attr('href'),
            vod_name: $(each).find('.tt h2').text().trim(),
            vod_pic: $(each).find('img').attr('src'),
            ext: { url: $(each).find('a').attr('href') }
        });
    });
    return jsonify({ list: cards });
}
