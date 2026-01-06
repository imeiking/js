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
                category: '1'
            }
        },
        {
            id: '2',
            name: '剧场版',
            ext: {
                category: '2'
            }
        },
        {
            id: '4',
            name: 'BD动漫',
            ext: {
                category: '4'
            }
        },
        {
            id: '6',
            name: '当季新番',
            ext: {
                category: '6'
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
    let category = ext.category || '1';
    
    try {
        const url = `https://www.mgnacg.com/category/${category}-----------/${page}/`;
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': 'https://www.mgnacg.com/'
            }
        });

        // 解析HTML提取动漫列表
        const listRegex = /<a[^>]+href="\/media\/(\d+)\/"[^>]*title="([^"]+)"[^>]*>[\s\S]*?<img[^>]+data-original="([^"]+)"[\s\S]*?<span[^>]*class="tag[^"]*">([^<]*)<\/span>/g;
        
        let match;
        while ((match = listRegex.exec(data)) !== null) {
            cards.push({
                vod_id: match[1],
                vod_name: match[2],
                vod_pic: match[3],
                vod_remarks: match[4].trim(),
                ext: {
                    id: match[1]
                }
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

        // 提取剧集列表
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

        // 提取播放地址 - 多种可能的格式
        // 方式1: 从player配置中提取
        const urlMatch1 = data.match(/url:\s*["']([^"']+)["']/);
        if (urlMatch1) {
            playUrl = urlMatch1[1];
        }

        // 方式2: 从iframe中提取
        if (!playUrl) {
            const iframeMatch = data.match(/<iframe[^>]+src=["']([^"']+)["']/);
            if (iframeMatch) {
                playUrl = iframeMatch[1];
            }
        }

        // 方式3: 从video标签中提取
        if (!playUrl) {
            const videoMatch = data.match(/<video[^>]+src=["']([^"']+)["']/);
            if (videoMatch) {
                playUrl = videoMatch[1];
            }
        }

        // 方式4: 从JavaScript变量中提取
        if (!playUrl) {
            const jsMatch = data.match(/var\s+url\s*=\s*["']([^"']+)["']/);
            if (jsMatch) {
                playUrl = jsMatch[1];
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
    const text = encodeURIComponent(ext.text);
    const page = ext.page || 1;
    
    if (page > 1) {
        return jsonify({ list: [] })
    }
    
    try {
        const url = `https://www.mgnacg.com/search/${text}-------------/`;
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': 'https://www.mgnacg.com/'
            }
        });

        // 解析搜索结果
        const listRegex = /<a[^>]+href="\/media\/(\d+)\/"[^>]*title="([^"]+)"[^>]*>[\s\S]*?<img[^>]+data-original="([^"]+)"[\s\S]*?<span[^>]*class="tag[^"]*">([^<]*)<\/span>/g;
        
        let match;
        while ((match = listRegex.exec(data)) !== null) {
            cards.push({
                vod_id: match[1],
                vod_name: match[2],
                vod_pic: match[3],
                vod_remarks: match[4].trim(),
                ext: {
                    id: match[1]
                }
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
