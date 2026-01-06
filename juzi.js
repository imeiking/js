const CryptoJS = createCryptoJS();

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let appConfig = {
    ver: 20260106,
    title: '橘子动漫',
    site: 'https://www.mgnacg.com',
    tabs: [
        {
            id: '1',
            name: '动漫',
            ext: {
                type: '1'
            }
        },
        {
            id: '2',
            name: '剧场版',
            ext: {
                type: '2'
            }
        },
        {
            id: '4',
            name: 'BD动漫',
            ext: {
                type: '4'
            }
        },
        {
            id: '6',
            name: '当季新番',
            ext: {
                type: '6'
            }
        }
    ],
};

async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext);
    let cards = [];
    let page = ext.page || 1;
    let type = ext.type || '1';
    
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        const url = 'https://www.mgnacg.com/index.php/api/vod';
        
        // 生成签名key
        const key = generateKey(timestamp);
        
        const { data } = await $fetch.post(url, 
            `type=${type}&class=&area=&lang=&version=&state=&letter=&page=${page}&time=${timestamp}&key=${key}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'User-Agent': UA,
                    'Referer': 'https://www.mgnacg.com/',
                    'Origin': 'https://www.mgnacg.com',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            }
        );

        const result = argsify(data);
        
        if (result.code === 1 && result.list) {
            result.list.forEach((item) => {
                cards.push({
                    vod_id: item.vod_id,
                    vod_name: item.vod_name,
                    vod_pic: item.vod_pic,
                    vod_remarks: item.vod_serial || item.vod_remarks || '',
                    ext: {
                        id: item.vod_id
                    }
                });
            });
        }

        return jsonify({
            list: cards,
        })
    } catch (error) {
        $print('getCards error:', error);
        return jsonify({ list: [] })
    }
}

async function getTracks(ext) {
    ext = argsify(ext);
    let tracks = [];
    let id = ext.id;
    
    try {
        const url = `https://www.mgnacg.com/media/${id}/`;
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': 'https://www.mgnacg.com/'
            }
        });

        // 提取剧集列表 - 匹配播放链接
        const episodeRegex = /<a[^>]+href="\/play\/(\d+)\/([^\/]+)\/"[^>]*>([^<]+)<\/a>/g;
        
        let match;
        let index = 0;
        while ((match = episodeRegex.exec(data)) !== null) {
            tracks.push({
                name: match[3].trim(),
                pan: '',
                ext: {
                    id: match[1],
                    play_id: match[2],
                    index: index++
                }
            });
        }

        return jsonify({
            list: [
                {
                    title: '播放列表',
                    tracks,
                }
            ],
        })
    } catch (error) {
        $print('getTracks error:', error);
        return jsonify({ list: [] })
    }
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let playUrl = '';
    
    try {
        const url = `https://www.mgnacg.com/play/${ext.id}/${ext.play_id}/`;
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': 'https://www.mgnacg.com/'
            }
        });

        // 方式1: 从player配置中提取 (最常见)
        const urlMatch1 = data.match(/player_.*?=\s*\{[^}]*url:\s*["']([^"']+)["']/);
        if (urlMatch1) {
            playUrl = urlMatch1[1];
        }

        // 方式2: 从MacPlayer配置中提取
        if (!playUrl) {
            const urlMatch2 = data.match(/MacPlayer\([^)]*url:\s*["']([^"']+)["']/);
            if (urlMatch2) {
                playUrl = urlMatch2[1];
            }
        }

        // 方式3: 直接匹配url变量
        if (!playUrl) {
            const urlMatch3 = data.match(/var\s+url\s*=\s*["']([^"']+)["']/);
            if (urlMatch3) {
                playUrl = urlMatch3[1];
            }
        }

        // 方式4: 从iframe中提取
        if (!playUrl) {
            const iframeMatch = data.match(/<iframe[^>]+src=["']([^"']+)["']/);
            if (iframeMatch) {
                playUrl = iframeMatch[1];
            }
        }

        if (!playUrl) {
            throw new Error('无法提取播放地址');
        }

        // 处理相对路径
        if (playUrl.startsWith('//')) {
            playUrl = 'https:' + playUrl;
        } else if (playUrl.startsWith('/')) {
            playUrl = 'https://www.mgnacg.com' + playUrl;
        }

        return jsonify({ urls: [playUrl] })
    } catch (error) {
        $print('getPlayinfo error:', error);
        return jsonify({ urls: [] })
    }
}

async function search(ext) {
    ext = argsify(ext);
    let cards = [];
    const text = ext.text;
    const page = ext.page || 1;
    
    if (page > 1) {
        return jsonify({ list: [] })
    }
    
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        const url = 'https://www.mgnacg.com/index.php/api/vod';
        
        // 生成签名key
        const key = generateKey(timestamp);
        
        const { data } = await $fetch.post(url,
            `wd=${encodeURIComponent(text)}&page=${page}&time=${timestamp}&key=${key}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'User-Agent': UA,
                    'Referer': 'https://www.mgnacg.com/',
                    'Origin': 'https://www.mgnacg.com',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            }
        );

        const result = argsify(data);
        
        if (result.code === 1 && result.list) {
            result.list.forEach((item) => {
                cards.push({
                    vod_id: item.vod_id,
                    vod_name: item.vod_name,
                    vod_pic: item.vod_pic,
                    vod_remarks: item.vod_serial || item.vod_remarks || '',
                    ext: {
                        id: item.vod_id
                    }
                });
            });
        }

        return jsonify({
            list: cards,
        })
    } catch (error) {
        $print('search error:', error);
        return jsonify({ list: [] })
    }
}

// 生成API签名key (根据实际情况可能需要调整算法)
function generateKey(timestamp) {
    // 这是一个简单的MD5签名示例，实际算法可能不同
    // 可能需要根据网站实际的签名规则调整
    const secret = 'mgnacg'; // 这个密钥需要通过抓包或分析js确定
    const str = `${timestamp}${secret}`;
    return CryptoJS.MD5(str).toString();
}
