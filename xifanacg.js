const cheerio = createCheerio()

const headers = {
    'Origin': 'https://dm.xifanacg.com',
    'User-Agent': "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

}

const appConfig = {
    ver: 1,
    title: "稀饭动漫_兔",
    site: "https://dm.xifanacg.com",
    tabs: [{
        name: '连载新番',
        ext: {
            dmtype: 1,
        },
    }
        ,{
            name: '完结旧番',
            ext: {
                dmtype: 2
            },
        }
        ,{
            name: '剧场版',
            ext: {
                dmtype: 3
            },
        }
        ,{
            name: '美漫',
            ext: {
                dmtype: 21
            },
        }
    ]
}


async function checkBrowser() {
    const { data } = await $fetch.get(appConfig.site, {
        headers
    });
    if (data.toString().includes("Checking your browser")) {
        $utils.openSafari(appConfig.site, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36");
    }
}

async function getConfig() {

    return jsonify(appConfig)
}

async function getCards(ext) {
    checkBrowser()

    ext = argsify(ext)
    let cards = []
    let page = ext.page || 1
    let dmtype=ext.dmtype
    let url="https://dm.xifanacg.com/index.php/ds_api/vod"
    const body = `type=${dmtype}&level=0&by=time&page=${page}`;

    const { data } = await $fetch.post(url, body, {
        headers: headers,
    });
    argsify(data).list.forEach((e) => {
        cards.push({
            vod_id: e.vod_id.toString(),
            vod_name: e.vod_name,
            vod_pic: e.vod_pic,
            vod_remarks: e.vod_remarks,
            ext: {
                url: appConfig.site+e.url,
            },
        })
    })
    return jsonify({
        list: cards,
    });
}

async function getTracks(ext) {
    checkBrowser()

    ext = argsify(ext)
    let groups = []
    let url = ext.url
    const { data } = await $fetch.get(url, {
        headers
    })

    const $ = cheerio.load(data)
    let gn = []
    $("div.anthology-tab>div>a").each((_, each) => {
        gn.push($(each).clone().find('.badge').remove().end().text().trim())
    })

    $("div.anthology-list>div").each((i, each) => {
        let group = {
            title: gn[i],
            tracks: [],
        }
        $(each).find(".anthology-list-play>li").each((_, item) => {
            group.tracks.push({
                name: $(item).children(":first").text(),
                pan: '',
                ext: {
                    url: appConfig.site + $(item).children(":first").attr("href")
                }
            })
        })
        groups.push(group)
    })

    return jsonify({ list: groups })
}

async function getPlayinfo(ext) {
    checkBrowser()

    ext = argsify(ext)
    let url = ext.url
    const { data } = await $fetch.get(url, {
        headers
    })
    const obj = JSON.parse(data.match(/player_aaaa=(.+?)<\/script>/)[1])

    return jsonify({ 'urls': [obj.url] })
}
async function search(ext) {
    checkBrowser()

    ext = argsify(ext)
    let cards = [];

    let text = encodeURIComponent(ext.text)
    let page = ext.page || 1


    let url = appConfig.site + `/search/wd/${text}/page/${page}.html`
    const { data } = await $fetch.get(url, {
        headers
    })

    const $ = cheerio.load(data)
    $(".vod-detail").each((_, each) => {

        cards.push({
            vod_id: $(each).find(".detail-get-box").attr("data-id").toString(),
            vod_name: $(each).find(".slide-info-title").text(),
            vod_pic: $(each).find(".detail-pic>img").attr("src"),
            vod_remarks: $(each).find(".slide-info").children(":first").text(),
            ext: {
                url: appConfig.site + $(each).find(".detail-info").children(":first").attr("href"),
            },
        })
    })

    return jsonify({
        list: cards,
    })
}
