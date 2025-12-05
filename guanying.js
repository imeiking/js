
//自定义配置格式{"cookie":"","only":""}
//only是过滤网盘用的，内容为域名的截取，如driver.uc.com，就可以填uc，用英文逗号,分割
//去观影网页登录账号后，F12打开控制台后随便访问一个页面，在网络标签下你访问的网页，复制标头里的cookie即可
const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)'

let $config = argsify($config_str)
const appConfig = {
    ver: 1,
    title: '观影网｜PAN',
    site: $config?.site||"https://www.gying.net/",
    tabs: [
        {
            name: '热门电影',
            ext: {
                id: 'hits/mv/day',
            },
        },
        {
            name: '热门剧集',
            ext: {
                id: 'hits/tv/day',
            },
        },
        {
            name: '热门动漫',
            ext: {
                id: 'hits/ac/day',
            },
        },
        {
            name: '电影',
            ext: {
                id: 'mv?page=',
            },
        },
        {
            name: '剧集',
            ext: {
                id: 'tv?page=',
            },
        },
        {
            name: '动漫',
            ext: {
                id: 'ac?page=',
            },
        }

    ],
}
async function getConfig() {
    if($config.cookie=="" || $config.cookie == undefined){
        $utils.toastError('cookie未配置！')
        return
    }
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, id } = ext
    let url;
    if(ext.id.includes("hits")){
        if(page>1){return}
        url=`${appConfig.site}${id}`
    }else{
        url=`${appConfig.site}${id}${page}`
    }
    //$utils.toastError(url);
    const { data } = await $fetch.get(url, {
        headers: {
            "User-Agent": UA,
            "Cookie":$config.cookie
        },
    });
    const $ = cheerio.load(data)

    const t1 = $('p.error').text()
    if ($('p.error').length > 0) {
        $utils.openSafari(appConfig.site, UA);
    }


    const scriptContent = $('script').filter((_, script) => {
        return $(script).html().includes('_obj.header');
    }).html();

    const jsonStart = scriptContent.indexOf('{');
    const jsonEnd = scriptContent.lastIndexOf('}') + 1;
    const jsonString = scriptContent.slice(jsonStart, jsonEnd);

    const inlistMatch = jsonString.match(/_obj\.inlist=({.*});/);
    if (!inlistMatch) {
        $utils.toastError("未找到 _obj.inlist 数据");
    } else {

        const inlistData = JSON.parse(inlistMatch[1]);

        inlistData["i"].forEach((item,index)=>{

            cards.push({
                vod_id: item,
                vod_name: inlistData["t"][index],
                vod_pic: `https://s.tutu.pm/img/${inlistData["ty"]}/${item}.webp`,
                vod_remarks: inlistData["g"][index],
                ext: {
                    url: `${appConfig.site}res/downurl/${inlistData["ty"]}/${item}`,
                },
            })
        })
    }
    return jsonify({
        list: cards,
    })
}

async function getTracks(ext) {

    ext = argsify(ext)
    let tracks = []
    let url = ext.url

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            "Cookie":$config.cookie
        },
    })
    const respstr =parseJsonIfString(data)
    //清洗的结果
    if(respstr.hasOwnProperty('panlist')){
        const patterns = {
            resolution: /(4K|4k|1080P|1080p)/,
            hdr: /(HDR)/,
            codec: /(高码|极致高码)/,
            lang: /(国语中字|中英|双语字幕|内嵌简中|内嵌中字)/,
            disk: /(原盘)/,
        };

        respstr.panlist.url.forEach((item, index) => {

            const keys = ($config.only ? $config.only.toLowerCase() : "").split(",").filter(Boolean);
            if (keys.length) {
                const match = item.match(/^(https?:\/\/)?([^\/:]+)/i);
                if (!match) {
                    return false;
                }
                const domain = match[2].toLowerCase();
                const hit = keys.find(k => domain.includes(k));
                if(!hit){
                    return;
                }
            }

            const str = respstr.panlist.name[index];
            let tags = [];

            for (const key in patterns) {
                const m = str.match(patterns[key]);
                if (m) tags.push(m[0]);
            }
            let title = tags.length ? tags.join('/') : '未知规格';

            tracks.push({
                name:title+`（${(index+1).toString()}）`,
                pan: item,
                ext: {
                    url: '',
                },
            })
        });
        const hostCount = {};
        const order = ["quark.cn", "alipan.com", "uc.cn", "189.cn", "115cdn"];
        tracks = tracks.sort((a, b) => {
            const ma = a.pan.match(/^https?:\/\/([^\/?#]+)/i);
            const mb = b.pan.match(/^https?:\/\/([^\/?#]+)/i);
            const ha = ma ? ma[1].toLowerCase() : "";
            const hb = mb ? mb[1].toLowerCase() : "";

            let ia = 999;
            for (let i = 0; i < order.length; i++) {
                if (ha.indexOf(order[i]) !== -1) { ia = i; break; }
            }

            let ib = 999;
            for (let i = 0; i < order.length; i++) {
                if (hb.indexOf(order[i]) !== -1) { ib = i; break; }
            }

            return ia - ib;
        }).filter(item => {
            const m = item.pan.match(/^https?:\/\/([^\/?#]+)/i);
            const host = m ? m[1].toLowerCase() : "";

            hostCount[host] = (hostCount[host] || 0) + 1;

            return hostCount[host] <= 5;
        });


//${respstr.panlist.tname[respstr.panlist.type[index]]}

    }else if(respstr.hasOwnProperty('file')){

        $utils.toastError('网盘验证掉签请前往主站完成验证数字')
    }else{

        $utils.toastError('没有网盘资源');

    }

    return jsonify({
        list: [
            {
                title: '默认分组',
                tracks,
            },
        ],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url

    return jsonify({ urls: [ext.url] })
}
async function search(ext) {
    ext = argsify(ext)
    let text = encodeURIComponent(ext.text)
    let page = ext.page || 1
    let url = `${appConfig.site}/s/1---${page}/${text}`

    const { data } = await $fetch.get(url, {
        headers: {
            "User-Agent": UA,
            "Cookie":$config.cookie
        },
    })

    let cards = [];
    const result=JSON.parse(data.match(/_obj\.search\s*=\s*(\{[\s\S]*?\});/)[1]);
    result.l.title.forEach((item, index) => {
        cards.push({
            vod_id: result.l.i[index],
            vod_name: item,
            vod_pic: `https://s.tutu.pm/img/${result.l.d[index]}/${result.l.i[index]}/256.webp`,
            vod_remarks: "豆瓣 "+result.l.pf.db.s[index],
            ext: {
                url: `${appConfig.site}/res/downurl/${result.l.d[index]}/${result.l.i[index]}`,
            },
        });
    })
    return jsonify({
        list: cards,
    })
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
