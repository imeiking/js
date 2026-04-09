// === 5. 获取播放链接 (修复版) ===
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
                    // === 修复开始：增强 Base64 解码 ===
                    // 先处理 URL-Safe Base64 字符，替换回标准字符
                    let fixedVal = val.replace(/-/g, '+').replace(/_/g, '/');
                    
                    // 优先使用环境内置的 base64decode，否则尝试 atob
                    let decoded = "";
                    if (typeof base64decode === 'function') {
                        decoded = base64decode(fixedVal);
                    } else if (typeof atob === 'function') {
                        decoded = decodeURIComponent(escape(atob(fixedVal)));
                    } else {
                        continue; // 无法解码，跳过
                    }
                    // === 修复结束 ===

                    if (decoded.includes('jw-player')) {
                        let base64Param = decoded.split('/jw-player/')[1].split('"')[0];
                        
                        // 同样处理内层的 Base64 参数
                        let fixedParam = base64Param.replace(/-/g, '+').replace(/_/g, '/');
                        let jwConfigStr = "";
                        if (typeof base64decode === 'function') {
                            jwConfigStr = base64decode(fixedParam);
                        } else if (typeof atob === 'function') {
                            jwConfigStr = decodeURIComponent(escape(atob(fixedParam)));
                        }

                        let jwConfig = JSON.parse(jwConfigStr);
                        if (jwConfig.url) {
                            playUrl = jwConfig.url;
                            break;
                        }
                    }
                } catch(e) {
                    // 建议在调试时打印错误：log(e);
                    continue; // 解码失败则尝试下一个选项
                }
            }
        }
    }

    // === 修复开始：标准化返回格式 ===
    // 必须使用单数 'url' 传递字符串，使用 'header' 传递对象，并指定 parse: 0
    return jsonify({
        'parse': 0,
        'url': playUrl,
        'header': baseHeaders
    });
    // === 修复结束 ===
}
