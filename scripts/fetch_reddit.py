import json
import re
import urllib.request
import os

# 扩充后的经典跨次元电视风格视频兜底库 (20+ 个)
FALLBACK_VIDEOS = [
    "dQw4w9WgXcQ", "L_LUpnjgPso", "9bZkp7q19f0", "w4m6N7Zk-yM", "fC7oUOUEEi4",
    "ZZ5LpwO-An4", "jNQXAC9IVRw", "CSemARaqGgE", "Ba8Fv-38m2o", "ub82Xb1C8os",
    "eh7lp9umG2I", "s8MDNFaGfT4", "N9qYF9DZPdw", "tVlcKp3bWH8", "LKY5KV24B28",
    "5X5V_F9d-Q8", "X2WH8mHJnhM", "kZwhNFOn4ik", "k85mVFHxcGY", "2gMjJNGg9Z8"
]

# 改用 RSS 源 (Reddit 对 RSS 请求非常友好，几乎不封锁云端 IP)
REDDIT_RSS_URL = "https://www.reddit.com/r/InterdimensionalCable/hot.rss"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

# YouTube 视频 ID 正则提取
YOUTUBE_REGEX = re.compile(
    r'(?:youtube\.com/(?:watch\?v=|embed/|v/)|youtu\.be/)([a-zA-Z0-9_-]{11})'
)

def fetch_youtube_ids():
    print("正在尝试从 Reddit RSS 源抓取视频数据...")
    video_ids = []
    
    try:
        req = urllib.request.Request(REDDIT_RSS_URL, headers=HEADERS)
        with urllib.request.urlopen(req) as response:
            content = response.read().decode('utf-8', errors='ignore')
            matches = YOUTUBE_REGEX.findall(content)
            for v_id in matches:
                if v_id not in video_ids:
                    video_ids.append(v_id)
        print(f"成功从 RSS 抓取到 {len(video_ids)} 个最新热门视频！")
    except Exception as e:
        print(f"RSS 抓取遭遇波动: {e}")

    # 将抓取到的新视频与基础兜底库合并，确保频道库足够庞大
    for fb_id in FALLBACK_VIDEOS:
        if fb_id not in video_ids:
            video_ids.append(fb_id)

    print(f"频道数据构建完成，共计 {len(video_ids)} 个频道！")
    return video_ids

def save_to_json(video_ids):
    output_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), '..', 'videos.json')
    )
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(video_ids, f, indent=2)
    print(f"数据已写入文件: {output_path}")

if __name__ == "__main__":
    ids = fetch_youtube_ids()
    save_to_json(ids)
