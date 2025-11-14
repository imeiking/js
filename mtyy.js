const cheerio = createCheerio()

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
const headers = {
    'Referer': 'https://www.mtyy5.com/',
    'Origin': 'https://www.mtyy5.com',
    'User-Agent': UA,
}

const appConfig = {
    ver: 1,
    title: "麦田影院（无搜索）_兔",
    site: "https://www.mtyy5.com",
    tabs: [{
        name: '电影',
        ext: {
            url: 'https://www.mtyy5.com/vodshow/1--------{page}---.html'
        },
    }, {
        name: '电视剧',
        ext: {
            url: 'https://www.mtyy5.com/vodshow/2--------{page}---.html'
        },
    }, {
        name: '动漫',
        ext: {
            url: 'https://www.mtyy5.com/vodshow/4--------{page}---.html'
        },
    }, {
        name: '综艺',
        ext: {
            url: 'https://www.mtyy5.com/vodshow/3--------{page}---.html'
        },
    }, {
        name: '短剧',
        ext: {
            url: 'https://www.mtyy5.com/vodshow/26--------{page}---.html'
        },
    }, {
        name: '少儿',
        ext: {
            url: 'https://www.mtyy5.com/vodshow/25--------{page}---.html'
        },
    }]
}

async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let url = ext.url
    let page = ext.page || 1
    url = url.replace('{page}', page)

    const { data } = await $fetch.get(url, {
        headers
    })

    const $ = cheerio.load(data)
    $('div.public-list-box').each((_, each) => {
        cards.push({
            vod_id: $(each).find("a.public-list-exp").attr("href"),
            vod_name: $(each).find("a.public-list-exp").attr("title"),
            vod_pic: $(each).find("a.public-list-exp>img").attr("src"),
            vod_remarks: $(each).find('div.public-list-prb').text(),
            ext: {
                url: appConfig.site + $(each).find("a.public-list-exp").attr("href"),
            },
        })
    })

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
    $('a.swiper-slide').each((_, each) => {
        gn.push($(each).text().replace(/[0-9]/g, ''))
    })

    $('div.anthology-list-box').each((i, each) => {
        let group = {
            title: gn[i],
            tracks: [],
        }
        $(each).find('ul.anthology-list-play > li').each((_, item) => {
            group.tracks.push({
                name: $(item).text(),
                pan: '',
                ext: {
                    url: appConfig.site + $(item).children(":first").attr('href')
                }
            })
        })
        groups.push(group)
    })

    return jsonify({ list: groups })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    let url = ext.url
    const { data } = await $fetch.get(url, {
        headers
    })
    const obj = JSON.parse(data.match(/player_data=(.+?)<\/script>/)[1])
    if(obj.url.startsWith("http")){
        return jsonify({ 'urls': [obj.url] })
    }else{
        let res = await $fetch.get(appConfig.site+`/static/player/art.php?get_signed_url=1&url=${decodeURIComponent(obj.url)}`, {
            headers
        })

        res = await $fetch.get(appConfig.site+`/static/player/art.php${decodeURIComponent(parseJsonIfString(res.data).signed_url)}`, {
            headers
        })
        return jsonify({ 'urls': [parseJsonIfString(res.data).jmurl] })
    }

}
async function search(ext) {
    return
}
function parseJsonIfString(input) {
    if (typeof input === 'string') {
        try {
            return JSON.parse(input);  // 尝试将字符串解析为 JSON
        } catch (e) {
            console.error("Invalid JSON string", e);
            return null;  // 如果解析失败，返回 null 或其他错误处理
        }
    }
    return input;  // 如果输入是对象，直接返回
}

