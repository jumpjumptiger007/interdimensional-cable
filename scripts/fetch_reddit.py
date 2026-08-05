import json
import re
import urllib.request
import urllib.parse
import os

# 1. 抓取多个 Reddit 动态源（热门、月度最火、年度最火、历史最火）
REDDIT_SOURCES = [
    "https://www.reddit.com/r/InterdimensionalCable/hot.rss",
    "https://www.reddit.com/r/InterdimensionalCable/top.rss?t=month",
    "https://www.reddit.com/r/InterdimensionalCable/top.rss?t=year",
    "https://www.reddit.com/r/InterdimensionalCable/top.rss?t=all"
]

# 2. 使用支持返回完整 XML 的 Raw 中继代理，突破 10 条限制
RAW_PROXIES = [
    "https://api.allorigins.win/raw?url=",
    "https://corsproxy.io/?"
]

# YouTube 视频 ID 提取正则
YOUTUBE_REGEX = re.compile(
    r'(?:youtube\.com/(?:watch\?v=|embed/|v/)|youtu\.be/)([a-zA-Z0-9_-]{11})'
)

def fetch_all_reddit_videos():
    print("🚀 开始跨多个 Reddit 热门榜单批量抓取视频...")
    video_ids = []
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    for source_url in REDDIT_SOURCES:
        fetched_count = 0
        for proxy in RAW_PROXIES:
            try:
                # 拼接代理请求
                full_url = proxy + urllib.parse.quote(source_url)
                req = urllib.request.Request(full_url, headers=headers)
                
                with urllib.request.urlopen(req, timeout=12) as response:
                    raw_xml = response.read().decode('utf-8', errors='ignore')
                    matches = YOUTUBE_REGEX.findall(raw_xml)
                    
                    for v_id in matches:
                        if v_id not in video_ids:
                            video_ids.append(v_id)
                            fetched_count += 1
                            
                if fetched_count > 0:
                    print(f"  ├─ 成功从 {source_url.split('/')[-1]} 提取到 {fetched_count} 个新视频")
                    break # 当前数据源成功抓取，切换下一个榜单
            except Exception as e:
                continue

    if not video_ids:
        raise Exception("❌ 抓取失败：未能在 Reddit 获取到任何真实视频！")

    print(f"🎉 汇总完成！共计获取到 {len(video_ids)} 个不重复的真实 Reddit 视频 ID！")
    return video_ids

def save_to_json(video_ids):
    output_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), '..', 'videos.json')
    )
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(video_ids, f, indent=2)
    print(f"✅ 已写入 {output_path}")

if __name__ == "__main__":
    ids = fetch_all_reddit_videos()
    save_to_json(ids)
