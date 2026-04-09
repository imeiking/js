const cheerio = createCheerio();

// === 1. 基础全局配置 ===
let $config = argsify($config_str);
const SITE = $config.site || "https://animotvslash.org";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// 严格对标第一段代码的基础请求头，绝不乱改 Referer
const baseHeaders = {
    'Referer': SITE + '/',
    'Origin': SITE,
    'User-Agent': UA
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
        url = url.includes('?') ? url.replace('?', '/page/' + page + '/?') : url.replace(/\/$/, '') + '/page/' + page + '/';
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

// === 4. 获取剧集列表 ===
async function getTracks(ext) {
    const { url } = argsify(ext);
    const { data } = await $fetch.get(url, { headers: baseHeaders });
    const $ = cheerio.load(data);

    let group = { title: '在线播放', tracks: [] };
    const listItems = $('.eplister ul li a, .episodelist ul li a');
    
    if (listItems.length > 0) {
        listItems.each((_, item) => {
            let name = $(item).find('.epl-num, h3').first().text().trim() || $(item).text().trim();
            // 精简名称
            name = name.replace(/Jujutsu Kaisen: The Culling Game Part 1/gi, "").trim();
            
            let link = $(item).attr('href');
            if (link) {
                group.tracks.push({
                    name: name || '播放',
                    ext: { url: link.startsWith('http') ? link : SITE + link }
                });
            }
        });
        
        try {
            if (group.tracks.length > 1) {
                let firstNum = parseInt(group.tracks[0].name.replace(/[^\d]/g, "") || "0");
                let lastNum = parseInt(group.tracks[group.tracks.length - 1].name.replace(/[^\d]/g, "") || "0");
                if (firstNum > lastNum) {
                    group.tracks.reverse();
                }
            }
        } catch(e) {}
    } else {
        group.tracks.push({ name: '播放本集', ext: { url: url } });
    }

    return jsonify({ list: [group] });
}

// === 5. 获取播放链接 (回归初心，严格对标) ===
async function getPlayinfo(ext) {
    ext = argsify(ext);
    const { data } = await $fetch.get(ext.url, { headers: baseHeaders });
    const $ = cheerio.load(data);
    
    let playUrl = "";

    // 1. 优先提取 JSON-LD 中的原生 Rumble 直链
    let m3u8Match = data.match(/"contentUrl"\s*:\s*"(https?:\/\/[^"]+\.(m3u8|mp4)[^"]*)"/i);
    if (m3u8Match) {
        playUrl = m3u8Match[1];
    } 
    // 2. 如果没找到，从下拉菜单的 JW Player 配置里挖直链
    else {
        let options = $('select.mirror option').toArray();
        for (let item of options) {
            let val = $(item).attr('value');
            if (val && val.length > 20) {
                try {
                    let decoded = typeof atob === 'function' ? decodeURIComponent(escape(atob(val))) : unescape(base64decode(val));
                    if (decoded.includes('jw-player')) {
                        let base64Param = decoded.split('/jw-player/')[1].split('"')[0];
                        let jwConfig = JSON.parse(typeof atob === 'function' ? decodeURIComponent(escape(atob(base64Param))) : unescape(base64decode(base64Param)));
                        if (jwConfig.url) {
                            playUrl = jwConfig.url;
                            break;
                        }
                    }
                } catch(e) {}
            }
        }
    }

    // 严格对标第一段代码的返回格式：Headers 传对象，不乱用数组，不乱改 Referer
    return jsonify({
        'urls': [ playUrl ],
        'headers': baseHeaders
    });
}

// === 6. 搜索功能 ===
async function search(ext) {
    ext = argsify(ext);
    let text = encodeURIComponent(ext.text);
    let page = ext.page || 1;
    let url = SITE + `/page/${page}/?s=${text}`;
    if (page === 1) url = SITE + `/?s=${text}`;
    
    const { data } = await $fetch.get(url, { headers: baseHeaders });
    const $ = cheerio.load(data);
    let cards = [];

    $('article.bs').each((_, each) => {
        let path = $(each).find('a').attr('href');
        if (path) {
            cards.push({
                vod_id: path,
                vod_name: $(each).find('.tt h2').text().trim(),
                vod_pic: $(each).find('img').attr('src'),
                ext: { url: path.startsWith('http') ? path : SITE + path }
            });
        }
    });
    return jsonify({ list: cards });
}
