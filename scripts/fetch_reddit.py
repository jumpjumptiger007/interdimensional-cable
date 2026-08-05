import json
import re
import urllib.request
import os

# YouTube 视频 ID 提取正则
YOUTUBE_REGEX = re.compile(
    r'(?:youtube\.com/(?:watch\?v=|embed/|v/)|youtu\.be/)([a-zA-Z0-9_-]{11})'
)

# PullPush 是专门的 Reddit 数据开放接口，无 403 封锁，一次抓取 100 条
PULLPUSH_URL = "https://api.pullpush.io/reddit/search/submission/?subreddit=InterdimensionalCable&size=100"

def fetch_from_pullpush():
    print("🚀 正在通过 PullPush API 批量抓取 100 条 Reddit 真实视频...")
    ids = []
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) InterdimensionalTV/1.0"
    }
    
    try:
        req = urllib.request.Request(PULLPUSH_URL, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            posts = data.get('data', [])
            
            for p in posts:
                url = p.get('url', '')
                match = YOUTUBE_REGEX.search(url)
                if match:
                    v_id = match.group(1)
                    if v_id not in ids:
                        ids.append(v_id)
            print(f"  ├─ 成功从 PullPush 提取到 {len(ids)} 个 YouTube 视频！")
    except Exception as e:
        print(f"  └─ PullPush 请求异常: {e}")
        
    return ids

def load_existing_videos(file_path):
    """读取本地已有的 videos.json 列表，实现增量合并"""
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
        except Exception:
            pass
    return []

def main():
    output_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), '..', 'videos.json')
    )
    
    # 1. 读取本地现有数据 (保障历史视频不丢失)
    existing_ids = load_existing_videos(output_path)
    print(f"📂 当前本地库已有 {len(existing_ids)} 个视频频道")

    # 2. 从开放 API 抓取新视频
    new_ids = fetch_from_pullpush()

    # 3. 新旧数据合并去重 (频道池只增不减)
    combined_ids = list(existing_ids)
    for v_id in new_ids:
        if v_id not in combined_ids:
            combined_ids.append(v_id)

    print(f"🎉 增量合并完成，当前频道总数：{len(combined_ids)} 个！")

    if not combined_ids:
        raise Exception("❌ 严重错误：未获取到任何有效视频 ID！")

    # 4. 写入 json 文件
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(combined_ids, f, indent=2)
    print(f"✅ 已成功更新写入: {output_path}")

if __name__ == "__main__":
    main()
