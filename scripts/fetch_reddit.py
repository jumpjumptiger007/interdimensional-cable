import json
import re
import urllib.request
import os

# 使用 RSS2JSON 中继服务，绕过 GitHub Actions (AWS IP) 被 Reddit 封锁 403 的问题
PROXY_URLS = [
    "https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.reddit.com%2Fr%2FInterdimensionalCable%2Fhot.rss%3Flimit%3D100",
    "https://feed2json.org/convert?url=https%3A%2F%2Fwww.reddit.com%2Fr%2FInterdimensionalCable%2Fhot.rss"
]

# YouTube 视频 ID 提取正则
YOUTUBE_REGEX = re.compile(
    r'(?:youtube\.com/(?:watch\?v=|embed/|v/)|youtu\.be/)([a-zA-Z0-9_-]{11})'
)

def fetch_real_reddit_videos():
    print("🚀 开始通过中继节点抓取 r/InterdimensionalCable 真实视频...")
    video_ids = []
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    for proxy_url in PROXY_URLS:
        try:
            print(f"正在尝试请求中继: {proxy_url[:45]}...")
            req = urllib.request.Request(proxy_url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as response:
                raw_data = response.read().decode('utf-8')
                
                # 正则匹配抓取到的所有真实 YouTube ID
                matches = YOUTUBE_REGEX.findall(raw_data)
                for v_id in matches:
                    if v_id not in video_ids:
                        video_ids.append(v_id)
                        
                if video_ids:
                    print(f"🎉 成功从 r/InterdimensionalCable 抓取到 {len(video_ids)} 个真实热门视频 ID！")
                    break
        except Exception as e:
            print(f"⚠️ 当前中继节点异常: {e}，尝试下一个...")

    if not video_ids:
        raise Exception("❌ 抓取失败：未能在 Reddit 获取到任何真实视频！")

    return video_ids

def save_to_json(video_ids):
    output_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), '..', 'videos.json')
    )
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(video_ids, f, indent=2)
    print(f"✅ 成功将 {len(video_ids)} 个真实 Reddit 视频写入 videos.json！")

if __name__ == "__main__":
    ids = fetch_real_reddit_videos()
    save_to_json(ids)
