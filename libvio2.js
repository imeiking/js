
const cheerio = createCheerio()

let $config = argsify($config_str)
const SITE = $config.site || "https://www.libvio.in"
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
const headers = {
    'Referer': `${SITE}/`,
    'Origin': `${SITE}`,
    'User-Agent': UA,
}

const appConfig = {
    ver: 1,
    title: "LIBVIO",
    site: SITE,
    tabs: [{
        name: '首页',
        ext: {
            url: '/',
            hasMore: false
        },
    }, {
        name: '电影',
        ext: {
            url: '/type/1-1.html'
        },
    }, {
        name: '剧集',
        ext: {
            url: '/type/2-1.html',
        },
    }, {
        name: '动漫',
        ext: {
            url: '/type/4-1.html',
        },
    }, {
        name: '日韩剧',
        ext: {
            url: '/type/15-1.html'
        },
    }, {
        name: '欧美剧',
        ext: {
            url: '/type/16-1.html'
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
    let hasMore = ext.hasMore || true

    if (!hasMore && page > 1) {
        return jsonify({
            list: cards,
        })
    }

    url = appConfig.site + url.replace('1.html', `${page}.html`)

    const { data } = await $fetch.get(url, {
        headers
    })

    const $ = cheerio.load(data)
    let vods = new Set()
    $('a.stui-vodlist__thumb').each((_, each) => {
        const path = $(each).attr('href')
        if (path.startsWith('/detail/') && !vods.has(path)) {
            vods.add(path)
            cards.push({
                vod_id: path,
                vod_name: $(each).attr('title'),
                vod_pic: $(each).attr('data-original'),
                vod_remarks: $(each).find('.text-right').text(),
                ext: {
                    url: appConfig.site + path,
                },
            })
        }
    })

    return jsonify({
        list: cards,
    })
}

async function getTracks(ext) {
    const { url } = argsify(ext)
    let groups = []

    const { data } = await $fetch.get(url, {
        headers
    })
    const $ = cheerio.load(data)

    const panels = $('div.playlist-panel').toArray();

    for (const panel of panels) {

        const $panel = $(panel);
        const title = $panel.find('.panel-head h3').text().trim();

        if (title.includes("猜你喜欢")) continue;

        let group = { title, tracks: [] };

        // 播放列表
        if (!title.includes('下载')) {

            $panel.find('.stui-content__playlist li').each((_, item) => {

                const a = $(item).find('a');

                group.tracks.push({
                    name: a.text().trim(),
                    pan: '',
                    ext: {
                        url: appConfig.site + a.attr('href')
                    }
                });

            });

        }
        // 网盘下载
        else {

            $panel.find('.netdisk-list a').each((_, item) => {

                const a = $(item);

                group.tracks.push({
                    name: a.find('.netdisk-name').text().trim(),
                    pan: a.attr('href')
                });

            });
        }
        groups.push(group);
    }

    return jsonify({ list: groups })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    let url=ext.url
    const { data } = await $fetch.get(url, {
        headers
    })
    let player=""
    let player_data = JSON.parse(data.match(/var player_.*?=(.*?)</)[1])
    if (player_data.encrypt == '1') {
        player = unescape(player_data.url);
    } else if (player_data.encrypt == '2') {
        player = unescape(base64decode(player_data.url));
    }else{
        player=player_data.url
    }
    return jsonify({
        urls: [ player ],
        headers: [ headers ],
    })

}
async function search(ext) {
    ext = argsify(ext)
    let cards = [];

    let text = encodeURIComponent(ext.text)
    let page = ext.page || 1
    if (page > 1) {
        return jsonify({
            list: cards,
        })
    }


    const url = appConfig.site + `/search/-------------.html?wd=${text}&submit=`
    const { data } = await $fetch.get(url, {
        headers
    })

    const $ = cheerio.load(data)
    $('a.stui-vodlist__thumb').each((_, each) => {
        const path = $(each).attr('href')
        if (path.startsWith('/detail/')) {
            cards.push({
                vod_id: path,
                vod_name: $(each).attr('title'),
                vod_pic: $(each).attr('data-original'),
                vod_remarks: $(each).find('.text-right').text(),
                ext: {
                    url: appConfig.site + path,
                },
            })
        }
    })

    return jsonify({
        list: cards,
    })
}
