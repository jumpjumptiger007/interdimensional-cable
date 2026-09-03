import json
import os
import re
import time
import urllib.request
import xml.etree.ElementTree as ET

# 同时支持 watch / embed / v / shorts / youtu.be 链接
YOUTUBE_REGEX = re.compile(
    r"(?:youtube\.com/(?:watch\?v=|embed/|v/|shorts/)|youtu\.be/)([a-zA-Z0-9_-]{11})"
)

RSS_URL = "https://www.reddit.com/r/InterdimensionalCable/new/.rss?limit=100"
ARCTIC_URL = "https://arctic-shift.photon-reddit.com/api/posts/search"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) InterdimensionalTV/1.0"
}


def http_get_json(url, tries=3):
    """带简单重试的 HTTP GET，返回 JSON 文本解析结果。"""
    last_err = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=25) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(1 + attempt)
    raise last_err


def http_get_text(url, tries=3):
    last_err = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=25) as resp:
                return resp.read().decode("utf-8")
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(1 + attempt)
    raise last_err


def extract_ids(text):
    return YOUTUBE_REGEX.findall(text or "")


def fetch_rss(limit=100):
    """Reddit 官方 RSS，无需鉴权、实时更新，适合每日增量。"""
    ids = []
    try:
        xml = http_get_text(RSS_URL)
        root = ET.fromstring(xml)
        ns = {"a": "http://www.w3.org/2005/Atom"}
        for entry in root.findall("a:entry", ns):
            content = entry.find("a:content", ns)
            link = entry.find("a:link", ns)
            text = (''.join(content.itertext()) if content is not None else "") + " "
            text += (link.get("href") if link is not None else "")
            ids.extend(extract_ids(text))
        print(f"  ├─ Reddit RSS 提取到 {len(ids)} 个 YouTube 链接")
    except Exception as e:  # noqa: BLE001
        print(f"  └─ Reddit RSS 请求异常（已跳过）: {e}")
    return ids


def fetch_arctic(limit=100, pages=1):
    """Arctic Shift 归档 API，支持 before 向前翻页，适合一次性补库。"""
    ids = []
    before = None
    for page in range(pages):
        url = f"{ARCTIC_URL}?subreddit=InterdimensionalCable&limit={limit}"
        if before:
            url += f"&before={before}"
        try:
            data = http_get_json(url)
            posts = data.get("data", [])
            if not posts:
                break
            before = min(p.get("created_utc", 0) for p in posts if p.get("created_utc"))
            page_ids = []
            for p in posts:
                page_ids.extend(extract_ids(p.get("url") or ""))
            ids.extend(page_ids)
            print(
                f"  ├─ Arctic Shift 第 {page + 1} 页提取到 {len(page_ids)} 个链接 "
                f"(before={before})"
            )
            time.sleep(0.4)
        except Exception as e:  # noqa: BLE001
            print(f"  └─ Arctic Shift 第 {page + 1} 页请求异常（已跳过）: {e}")
            break
    return ids


def load_existing(file_path):
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
        except Exception:  # noqa: BLE001
            pass
    return []


def main():
    output_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "videos.json")
    )

    existing = load_existing(output_path)
    print(f"📂 当前本地库已有 {len(existing)} 个视频频道")

    new_ids = []
    new_ids.extend(fetch_rss())

    # 日常运行保持 1 页即可；一次性补库时把 BACKFILL_PAGES 调大（例如 12）
    backfill_pages = int(os.environ.get("BACKFILL_PAGES", "1"))
    if backfill_pages > 0:
        new_ids.extend(fetch_arctic(limit=100, pages=backfill_pages))

    combined = list(existing)
    added = 0
    for vid in new_ids:
        if vid not in combined:
            combined.append(vid)
            added += 1

    print(f"🎉 本次新增 {added} 个，频道总数：{len(combined)} 个")

    if not combined:
        raise Exception("❌ 严重错误：未获取到任何有效视频 ID！")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(combined, f, indent=2)
    print(f"✅ 已成功更新写入: {output_path}")


if __name__ == "__main__":
    main()
