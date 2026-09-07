"""Prune duplicate, unavailable, private, and non-embeddable YouTube IDs."""
import json
import os
import re
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "videos.json")
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")

def lookup(ids, api_key):
    found = {}
    for start in range(0, len(ids), 50):
        query = urllib.parse.urlencode({"part": "status", "id": ",".join(ids[start:start + 50]), "key": api_key})
        with urllib.request.urlopen(f"https://www.googleapis.com/youtube/v3/videos?{query}", timeout=30) as response:
            for item in json.loads(response.read().decode("utf-8")).get("items", []):
                found[item["id"]] = item.get("status", {})
    return found

def main():
    with open(PATH, encoding="utf-8") as source: original = json.load(source)
    if not isinstance(original, list): raise ValueError("videos.json must contain a JSON array")
    unique, seen, malformed = [], set(), 0
    for item in original:
        if not isinstance(item, str) or not VIDEO_ID.fullmatch(item): malformed += 1
        elif item not in seen: unique.append(item); seen.add(item)
    duplicates = len(original) - len(unique) - malformed
    api_key = os.environ.get("YOUTUBE_API_KEY"); unavailable = non_embeddable = 0; cleaned = unique
    if api_key:
        statuses = lookup(unique, api_key); cleaned = []
        for video_id in unique:
            status = statuses.get(video_id)
            if not status or status.get("privacyStatus") != "public": unavailable += 1
            elif status.get("embeddable") is not True: non_embeddable += 1
            else: cleaned.append(video_id)
    else: print("YOUTUBE_API_KEY is not configured; skipping availability and embeddability checks.")
    with open(PATH, "w", encoding="utf-8") as output: json.dump(cleaned, output, indent=2); output.write("\n")
    print(f"Loaded: {len(original)}\nValid: {len(cleaned)}\nRemoved unavailable: {unavailable}\nRemoved non-embeddable: {non_embeddable}\nRemoved duplicates: {duplicates + malformed}\nSaved: {len(cleaned)}")

if __name__ == "__main__":
    try: main()
    except Exception as error:
        print(f"Video validation could not complete: {error}", file=sys.stderr)
        raise
