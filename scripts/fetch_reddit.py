import json
import re
import urllib.request
import os

# 默认备用视频列表 (防止 Reddit 拦截时生成空文件)
FALLBACK_VIDEOS = [
    "dQw4w9WgXcQ",
    "L_LUpnjgPso",
    "9bZkp7q19f0",
    "w4m6N7Zk-yM",
    "fC7oUOUEEi4"
]

REDDIT_URL = "https://www.reddit.com/r/InterdimensionalCable/hot.json?limit=100"
# Reddit 要求符合标准的 User-Agent 格式：<platform>:<app_id>:<version> (by /u/<username>)
HEADERS = {
    "User-Agent": "web:interdimensional-tv-app:v1.0 (by /u/jumpjumptiger007)"
}

# YouTube 视频 ID 正则提取
YOUTUBE_REGEX = re.compile(
    r'(?:youtube\.com/(?:watch\?v=|embed/|v/)|youtu\.be/)([a-zA-Z0-9_-]{11})'
)

def fetch_youtube_ids():
    print("正在尝试从 r/InterdimensionalCable 抓取视频数据...")
    req = urllib.request.Request(REDDIT_URL, headers=HEADERS)
    video_ids = []
    
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            posts = data.get('data', {}).get('children', [])
            
            for post in posts:
                url = post.get('data', {}).get('url', '')
                match = YOUTUBE_REGEX.search(url)
                if match:
                    video_id = match.group(1)
                    if video_id not in video_ids:
                        video_ids.append(video_id)
            
            print(f"成功抓取到 {len(video_ids)} 个有效 YouTube 视频 ID！")
    except Exception as e:
        print(f"抓取失败 (可能是 Reddit API 限制或网络波动): {e}")
    
    # 保障逻辑：如果没抓取到视频，使用备用视频列表，确保 videos.json 必定生成
    if not video_ids:
        print("未获取到新视频，启用备用视频列表以保障程序运行。")
        video_ids = FALLBACK_VIDEOS
        
    return video_ids

def save_to_json(video_ids):
    output_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), '..', 'videos.json')
    )
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(video_ids, f, indent=2)
    print(f"数据已成功写入文件: {output_path}")

if __name__ == "__main__":
    ids = fetch_youtube_ids()
    save_to_json(ids)
