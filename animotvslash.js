const host = "https://animotvslash.org";

export default {
    // 1. 基础信息
    title: "AnimoTVSlash",
    host: host,
    
    // 2. 首页分类与列表
    home: async function () {
        const html = await request(host);
        const items = html.find(".bsx"); 
        
        let list = [];
        items.forEach(item => {
            list.push({
                title: item.find("a").attr("title"),     // 标题
                cover: item.find("img").attr("src"),     // 封面图
                url: item.find("a").attr("href"),        // 详情页链接
                update: item.find(".epx").text()         // 更新集数
            });
        });
        return list;
    },

    // 3. 详情页（提取简介和选集列表）
    detail: async function (url) {
        const html = await request(url);
        
        // 提取剧情简介，代码里它的位置是 class="desc mindes"
        const desc = html.find(".desc.mindes").text();
        
        // 提取所有的集数，它们放在 class="episodelist" 里面的 <li> 标签中
        const episodeItems = html.find(".episodelist ul li a"); 
        let episodes = [];
        
        episodeItems.forEach(item => {
            episodes.push({
                // 抓取 h3 里的名字，比如 "One Piece Episode 1"
                title: item.find(".playinfo h3").text(),
                // 抓取这一集的具体链接
                url: item.attr("href")
            });
        });

        // 这个网站的集数是倒序排列的（1156集在最上面，第1集在最底下）
        // 为了方便在手机上按顺序看，我们用 reverse() 把它反转过来
        episodes.reverse();

        return {
            desc: desc,
            episodes: episodes
        };
    },

    // 4. 播放解析（找出真正的视频链接）
    play: async function (url) {
        const html = await request(url);
        let videoUrl = "";

        // 绝招：网站把真实视频地址藏在了一段 SEO 标记里，格式是 "contentUrl":"链接"
        // 我们用正则直接把链接抠出来
        const match = html.match(/"contentUrl"\s*:\s*"(.*?)"/);
        
        if (match && match[1]) {
            // 把提取出来的链接里面多余的斜杠清理掉
            videoUrl = match[1].replace(/\\\//g, '/'); 
        }

        return {
            url: videoUrl // 丢给 APP 播放器！
        };
    }
}
