// === 4. 获取真实播放链接 (XPTV 智能嗅探版) ===
async function getPlayinfo(ext) {
    ext = argsify(ext);
    let url = ext.url;
    
    // 访问播放页面
    const { data } = await $fetch.get(url, { headers: baseHeaders });
    const $ = cheerio.load(data);
    
    let playUrl = "";
    // xptv 关键标记：1代表需要启动嗅探器，0代表直接播放
    let parseFlag = 1; 

    let servers = {};
    
    // 1. 遍历下拉菜单里的所有隐藏线路
    $('select.mirror option').each((_, item) => {
        let val = $(item).attr('value');
        let text = $(item).text().toLowerCase();
        if (val && val.length > 20) {
            try {
                // 解密 Base64 的 iframe 源码
                let decodedHtml = decodeURIComponent(escape(atob(val)));
                let $$ = cheerio.load(decodedHtml);
                let src = $$('iframe').attr('src');
                if (src) {
                    servers[text] = src; // 保存：{"sub - moon": "https://...", "sub - hydrax": "..."}
                }
            } catch(e) {}
        }
    });

    // 2. 线路优选策略（完美避开 Rumble）
    // 第一优先级：Moon (Filemoon线路，各大影视APP嗅探最稳)
    for (let key in servers) {
        if (key.includes('moon')) {
            playUrl = servers[key];
            break;
        }
    }
    
    // 第二优先级：Hydrax 线路
    if (!playUrl) {
        for (let key in servers) {
            if (key.includes('hydrax')) {
                playUrl = servers[key];
                break;
            }
        }
    }

    // 第三优先级：除了 jw-player (Rumble) 之外的其他外链
    if (!playUrl) {
        for (let key in servers) {
            if (!servers[key].includes('jw-player')) {
                playUrl = servers[key];
                break;
            }
        }
    }

    // 第四优先级：如果都没有，走兜底直链 (风险：可能会被 Rumble 拒绝)
    if (!playUrl) {
        let m3u8Match = data.match(/"contentUrl"\s*:\s*"(https?:\/\/[^"]+\.(m3u8|mp4)[^"]*)"/i);
        if (m3u8Match && m3u8Match[1]) {
            playUrl = m3u8Match[1];
            parseFlag = 0; // 已经是直链，告诉 xptv 不需要嗅探，直接播
        }
    }

    // 3. 构建 XPTV 专属的返回格式
    return jsonify({
        urls: [ playUrl ],
        parse: parseFlag, // 核心代码：启动 XPTV 嗅探
        headers: {
            'User-Agent': UA,
            // 将来源伪装成当前 iframe 的主域名
            'Referer': playUrl ? new URL(playUrl).origin + '/' : SITE
        }
    });
}
