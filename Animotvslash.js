/**
 * Animotvslash 最终终极修正版
 * 核心修复：
 * 1. 选集逻辑：支持多线路分离，防止不同线路集数混淆。
 * 2. 播放解析：优化 JSON 提取正则，增加嵌套对象容错。
 * 3. 链接处理：增加 BASE_URL 的动态兼容性。
 */

globalThis.updateInfo = {
    version: "2.2.0",
    date: "2026-04-09"
};

const cheerio = require('cheerio');
const CryptoJS = require('crypto-js');

const BASE_URL = "https://animotvslash.org";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const CATEGORY_MAP = {
    "1": "update", "2": "ribendongman", "3": "guochandongman", 
    "4": "omeidongman", "5": "diayingpian"
};

// ==================== 核心逻辑层 ====================

async function getConfig() {
    return jsonify({
        code: 200,
        msg: "success",
        data: {
            name: "Animotvslash",
            version: "2.2.0",
            tabs: [
                { id: "1", name: "最近更新" },
                { id: "2", name: "日本动漫" },
                { id: "3", name: "国产动漫" },
                { id: "4", name: "欧美动漫" },
                { id: "5", name: "动漫电影" }
            ]
        }
    });
}

async function getCards(ext) {
    let params = ext.split("##");
    let tabId = params[0];
    let page = params[1] || 1;
    
    let url = BASE_URL;
    let catSlug = CATEGORY_MAP[tabId] || "update";
    
    if (catSlug === "update") {
        url = page > 1 ? `${BASE_URL}/${catSlug}/page/${page}` : `${BASE_URL}/${catSlug}`;
    } else {
        url = page > 1 ? `${BASE_URL}/category/${catSlug}/page/${page}` : `${BASE_URL}/category/${catSlug}`;
    }

    try {
        let html = await $fetch.get(url, { headers: { "User-Agent": UA } });
        let $ = cheerio.load(html);
        let videos = [];

        $('.thumb, .video-item, .module-item').each((i, elem) => {
            let $elem = $(elem);
            let $link = $elem.find('a').first();
            let $img = $elem.find('img').first();
            
            let title = $link.attr('title') || $img.attr('alt') || "无标题";
            let href = $link.attr('href');
            let imgRaw = $img.attr('data-original') || $img.attr('data-src') || $img.attr('src');
            let pic = fixImageUrl(imgRaw);
            let remarks = $elem.find('.note, .caption, .text-right').text().trim();

            if (href) {
                videos.push({
                    vod_id: href,
                    vod_name: title,
                    vod_pic: pic,
                    vod_remarks: remarks
                });
            }
        });

        return jsonify({
            code: 200,
            msg: "success",
            data: { list: videos, page: parseInt(page), pagecount: 999, total: 9999 }
        });

    } catch (e) {
        return jsonify({ code: 500, msg: e.toString() });
    }
}

/**
 * 获取选集列表 - 终极修正版
 * 修复：支持多线路分离
 */
async function getTracks(ext) {
    try {
        let html = await $fetch.get(ext, { headers: { "User-Agent": UA } });
        let $ = cheerio.load(html);
        let tracks = [];
        
        // 1. 查找所有可能的线路容器
        // 常见的多线路结构：.play-source, .source-item, .module-tab-item
        let $sources = $('.play-source, .source-item, .module-tab-item, .playlist');
        
        // 如果找不到明确的线路容器，退化为查找所有列表
        if ($sources.length === 0) {
            $sources = $('.playlist, .episode-list');
        }

        $sources.each((i, source) => {
            let $source = $(source);
            let sourceName = $source.find('.title, .label').text().trim() || `线路 ${i + 1}`;
            let episodes = [];
            
            // 在当前线路容器内查找集数
            $source.find('a').each((j, el) => {
                let name = $(el).text().trim();
                let link = $(el).attr('href');
                if (name && link) {
                    episodes.push(name + "$" + link);
                }
            });

            // 只有当该线路有集数时才添加
            if (episodes.length > 0) {
                tracks.push({
                    name: sourceName,
                    list: episodes.join("#")
                });
            }
        });

        // 兜底：如果上述逻辑未提取到数据，尝试 AJAX
        if (tracks.length === 0) {
            let vodId = $('.video-info, .detail-info, .module-info').attr('data-id');
            if (vodId) {
                let ajaxUrl = `${BASE_URL}/index.php/ajax/sid/1/id/${vodId}.html`;
                let ajaxHtml = await $fetch.get(ajaxUrl, { headers: { "User-Agent": UA } });
                let $$ = cheerio.load(ajaxHtml);
                let episodes = [];
                $$.find('a').each((i, el) => {
                    let name = $$(el).text().trim();
                    let link = $$(el).attr('href');
                    if(name && link) episodes.push(name + "$" + link);
                });
                if (episodes.length > 0) {
                    tracks.push({ name: "默认线路", list: episodes.join("#") });
                }
            }
        }

        if (tracks.length === 0) {
             return jsonify({ code: 500, msg: "未找到选集列表" });
        }

        return jsonify({
            code: 200,
            msg: "success",
            data: { list: tracks }
        });

    } catch (e) {
        return jsonify({ code: 500, msg: e.toString() });
    }
}

/**
 * 获取播放地址 - 终极修正版
 * 修复：增强 JSON 提取能力
 */
async function getPlayinfo(ext) {
    try {
        let html = await $fetch.get(ext, { headers: { "User-Agent": UA } });
        let $ = cheerio.load(html);
        let playUrl = "";

        // 策略1: 查找 script 中的 JSON 变量
        let scripts = $('script');
        for (let i = 0; i < scripts.length; i++) {
            let scriptText = $(scripts[i]).html();
            if (scriptText) {
                // 匹配 player_aaaa, player_data, cmsPlayer 等
                // 使用更宽松的正则，防止 JSON 内部包含换行符导致匹配失败
                let jsonMatch = scriptText.match(/(player_aaaa|player_data|cmsPlayer)\s*=\s*({[\s\S]*?});/);
                if (jsonMatch) {
                    try {
                        let playerData = JSON.parse(jsonMatch[2]);
                        // 兼容不同的字段名
                        playUrl = playerData.url || playerData.playUrl || playerData.src;
                        if (playUrl) break;
                    } catch (e) {
                        // 忽略解析错误
                    }
                }
            }
        }

        // 策略2: 查找 iframe
        if (!playUrl) {
            let iframe = $('iframe').attr('src');
            if (iframe && iframe.includes('http')) playUrl = iframe;
        }

        if (!playUrl) {
            return jsonify({ code: 500, msg: "无法解析播放地址" });
        }

        // 判断是否需要解析
        if (playUrl.includes('.m3u8') || playUrl.includes('.mp4')) {
            return jsonify({
                code: 200,
                msg: "success",
                data: { parse: 0, playUrl: playUrl, header: { "User-Agent": UA } }
            });
        }

        return jsonify({
            code: 200,
            msg: "success",
            data: { parse: 1, playUrl: playUrl, header: { "User-Agent": UA } }
        });

    } catch (e) {
        return jsonify({ code: 500, msg: e.toString() });
    }
}

async function search(ext) {
    let keyword = encodeURIComponent(ext);
    let url = `${BASE_URL}/?s=${keyword}`;

    try {
        let html = await $fetch.get(url, { headers: { "User-Agent": UA } });
        let $ = cheerio.load(html);
        let videos = [];

        $('.thumb, .video-item').each((i, elem) => {
            let $elem = $(elem);
            let title = $elem.find('a').attr('title');
            let href = $elem.find('a').attr('href');
            let imgRaw = $elem.find('img').attr('data-original') || $elem.find('img').attr('src');
            
            if (title && href) {
                videos.push({
                    vod_id: href,
                    vod_name: title,
                    vod_pic: fixImageUrl(imgRaw),
                    vod_remarks: ""
                });
            }
        });

        return jsonify({ code: 200, msg: "success", data: { list: videos } });
    } catch (e) {
        return jsonify({ code: 500, msg: e.toString() });
    }
}

// ==================== 辅助工具 ====================

function fixImageUrl(img) {
    if (!img) return "";
    if (img.startsWith('//')) return 'https:' + img;
    if (img.startsWith('/')) return BASE_URL + img;
    return img;
}

globalThis.getConfig = getConfig;
globalThis.getCards = getCards;
globalThis.getTracks = getTracks;
globalThis.getPlayinfo = getPlayinfo;
globalThis.search = search;
