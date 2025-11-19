const cheerio = createCheerio()
const CryptoJS = createCryptoJS()

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
const headers = {
    'Referer': 'https://feikuai.tv/',
    'Origin': 'https://feikuai.tv',
    'User-Agent': UA,
}

const appConfig = {
    ver: 1,
    title: "飞快TV_兔",
    site: "https://feikuai.tv",
    tabs: [{
        name: '热播推荐',
        ext: {
            url:"https://feikuai.tv/label/new.html#tab=3",
            index:2
        },
    }, {
        name: '新片上线',
        ext: {
            url:"https://feikuai.tv/label/new.html#tab=2",
            index:1
        },
    }, {
        name: '今日更新',
        ext: {
            url:"https://feikuai.tv/label/new.html#tab=1",
            index:0
        },
    }, {
        name: '电影',
        ext: {
            url:'https://feikuai.tv/vodshow/1--------{page}---.html'
        },
    }, {
        name: '剧集',
        ext: {
            url:'https://feikuai.tv/vodshow/2--------{page}---.html'
        },
    }, {
        name: '综艺',
        ext: {
            url:'https://feikuai.tv/vodshow/3--------{page}---.html'
        },
    }, {
        name: '动漫',
        ext: {
            url:'https://feikuai.tv/vodshow/4--------{page}---.html'
        },
    }
    ]
}

async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {


    ext = argsify(ext);
    let cards = [];
    let url = ext.url
    let page = ext.page || 1;
    if(ext.index!=undefined && page>1){return}


    url=url.replace("{page}",page)

    const { data } = await $fetch.get(url, {
        headers
    })

    const $ = cheerio.load(data)
    if(ext.index==1 ||ext.index==2){
        $("div.module-main").eq(ext.index).find('div.module-card-item.module-item').each((_, each) => {
            const $each = $(each);
            // 详情页链接
            const detailHref = $each.find('a.module-card-item-poster').attr('href') || '';
            cards.push({
                vod_id: detailHref,
                vod_name: $each.find('.module-card-item-title strong').text().trim(),
                vod_pic: appConfig.site + ($each.find('.module-item-pic img').attr('data-original') || ''),
                vod_remarks: $each.find('.module-item-note').text().trim(),
                ext: {
                    url: appConfig.site + detailHref
                }
            });
        });
    }else{
        $('a.module-poster-item').each((_, each) => {
            const $each = $(each);
            const href = $each.attr('href') || '';
            const title = $each.attr('title') || '';
            cards.push({
                vod_id: href,
                vod_name: title || $each.find('.module-poster-item-title').text().trim(),
                vod_pic: appConfig.site + ($each.find('img.lazy').attr('data-original') || ''),
                vod_remarks: $each.find('.module-item-note').text().trim(),
                ext: {
                    url: appConfig.site + href
                }
            });
        });

    }
    return jsonify({
        list: cards,
    });
}

async function getTracks(ext) {
    ext = argsify(ext)
    let groups = []
    let url = ext.url

    const { data } = await $fetch.get(url, {
        headers
    })

    const $ = cheerio.load(data)
    let gn = []
    $('div.module-tab-items-box >.module-tab-item').not('[onclick]').each((_, each) => {
        gn.push($(each).children(":first").text().trim())
    })

    $('div.module-list.tab-list').not(".module-downlist").each((i, each) => {
        let group = {
            title: gn[i],
            tracks: [],
        }
        $(each).find('a.module-play-list-link').each((_, item) => {
            group.tracks.push({
                name: $(item).text(),
                pan: '',
                ext: {
                    url: appConfig.site + $(item).attr('href')
                }
            })
        })
        groups.push(group)
    })
    let group = {
        title: "网盘",
        tracks: [],
    }
    $("div.module-list>.tab-content").each((i, each) => {
        let str=$(each).find("h4").text()
        const result = str.indexOf('@') !== -1 ? str.slice(0, str.indexOf('@')) : str;
        group.tracks.push({
            name: result,
            pan: $(each).find("p").text()
        })
    })
    groups.push(group)
    return jsonify({ list: groups })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    let url = ext.url
    const { data } = await $fetch.get(url, {
        headers
    })
    const obj = JSON.parse(data.match(/player_aaaa=(.+?)<\/script>/)[1])
    let m3u;
    var player_data = obj;
    if (player_data.encrypt == '1') {
        m3u = unescape(player_data.url);
    } else if (player_data.encrypt == '2') {
        m3u = unescape(base64decode(player_data.url));
    }
    return jsonify({ 'urls': [m3u] })
}
async function search(ext) {
    ext = argsify(ext)
    let cards = [];

    let text = encodeURIComponent(ext.text)
    let page = ext.page || 1
    const url = `https://feikuai.tv/label/search_ajax.html?wd=${text}&by=time&order=desc&page=${page}`
    const { data } = await $fetch.get(url, {
        headers
    })
    const $ = cheerio.load(data)
    $('div.module-card-item.module-item').each((_, each) => {
        const $each = $(each);
        // 详情页链接
        const detailHref = $each.find('a.module-card-item-poster').attr('href') || '';
        cards.push({
            vod_id: detailHref,
            vod_name: $each.find('.module-card-item-title strong').text().trim(),
            vod_pic: appConfig.site + ($each.find('.module-item-pic img').attr('data-original') || ''),
            vod_remarks: $each.find('.module-item-note').text().trim(),
            ext: {
                url: appConfig.site + detailHref
            }
        });
    });

    return jsonify({
        list: cards,
    })
}

function base64decode(str) {
    var base64DecodeChars = new Array(-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,62,-1,-1,-1,63,52,53,54,55,56,57,58,59,60,61,-1,-1,-1,-1,-1,-1,-1,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,-1,-1,-1,-1,-1,-1,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,-1,-1,-1,-1,-1);
    var c1, c2, c3, c4;
    var i, len, out;
    len = str.length;
    i = 0;
    out = "";
    while (i < len) {
        do {
            c1 = base64DecodeChars[str.charCodeAt(i++) & 0xff]
        } while (i < len && c1 == -1);
        if (c1 == -1)
            break;
        do {
            c2 = base64DecodeChars[str.charCodeAt(i++) & 0xff]
        } while (i < len && c2 == -1);
        if (c2 == -1)
            break;
        out += String.fromCharCode((c1 << 2) | ((c2 & 0x30) >> 4));
        do {
            c3 = str.charCodeAt(i++) & 0xff;
            if (c3 == 61)
                return out;
            c3 = base64DecodeChars[c3]
        } while (i < len && c3 == -1);
        if (c3 == -1)
            break;
        out += String.fromCharCode(((c2 & 0XF) << 4) | ((c3 & 0x3C) >> 2));
        do {
            c4 = str.charCodeAt(i++) & 0xff;
            if (c4 == 61)
                return out;
            c4 = base64DecodeChars[c4]
        } while (i < len && c4 == -1);
        if (c4 == -1)
            break;
        out += String.fromCharCode(((c3 & 0x03) << 6) | c4)
    }
    return out
}
