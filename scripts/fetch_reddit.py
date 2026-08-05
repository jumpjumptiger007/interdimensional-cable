import json
import re
import urllib.request
import os

# Reddit API 请求地址 (获取热榜前 100 帖子)
REDDIT_URL = "https://www.reddit.com/r/InterdimensionalCable/hot.json?limit=100"
# GitHub Actions 运行环境需要伪装 User-Agent，否则 Reddit 会返回 429 反爬拦截
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) InterdimensionalCableBot/1.0"
}

# YouTube 视频 ID 提取正则
YOUTUBE_REGEX = re.compile(
    r'(?:youtube\.com/(?:watch\?v=|embed/|v/)|youtu\.be/)([a-zA-Z0-9_-]{11})'
)

def fetch_youtube_ids():
    print("正在从 r/InterdimensionalCable 抓取视频数据...")
    req = urllib.request.Request(REDDIT_URL, headers=HEADERS)
    
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            
            video_ids = []
            posts = data.get('data', {}).get('children', [])
            
            for post in posts:
                url = post.get('data', {}).get('url', '')
                match = YOUTUBE_REGEX.search(url)
                if match:
                    video_id = match.group(1)
                    if video_id not in video_ids:
                        video_ids.append(video_id)
            
            print(f"成功抓取到 {len(video_ids)} 个有效 YouTube 视频 ID！")
            return video_ids
            
    except Exception as e:
        print(f"抓取失败: {e}")
        return []

def save_to_json(video_ids):
    if not video_ids:
        print("未抓取到有效视频，跳过写入。")
        return
    
    # 写入项目根目录下的 videos.json
    output_path = os.path.join(os.path.dirname(__file__), '..', 'videos.json')
    output_path = os.path.abspath(output_path)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(video_ids, f, indent=2)
        
    print(f"数据已成功写入文件: {output_path}")

if __name__ == "__main__":
    ids = fetch_youtube_ids()
    save_to_json(ids)