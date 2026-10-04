"""Prune duplicate, unavailable, private, and non-embeddable YouTube IDs."""
import json
import os
import re
import stat
import sys
import tempfile
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "videos.json")
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
MAX_CATALOG_DROP = 0.20


def lookup(ids, api_key):
    found = {}
    for start in range(0, len(ids), 50):
        query = urllib.parse.urlencode({"part": "status", "id": ",".join(ids[start:start + 50]), "key": api_key})
        with urllib.request.urlopen(f"https://www.googleapis.com/youtube/v3/videos?{query}", timeout=30) as response:
            for item in json.loads(response.read().decode("utf-8")).get("items", []):
                found[item["id"]] = item.get("status", {})
    return found


def load_catalog(path):
    with open(path, encoding="utf-8") as source:
        original = json.load(source)
    if not isinstance(original, list):
        raise ValueError("videos.json must contain a JSON array")
    return original


def unique_valid_ids(original):
    unique, seen, malformed = [], set(), 0
    for item in original:
        if not isinstance(item, str) or not VIDEO_ID.fullmatch(item):
            malformed += 1
        elif item not in seen:
            unique.append(item)
            seen.add(item)
    duplicates = len(original) - len(unique) - malformed
    return unique, duplicates, malformed


def enforce_drop_guard(original_count, cleaned_count, max_drop=MAX_CATALOG_DROP):
    if original_count and (original_count - cleaned_count) / original_count > max_drop:
        raise ValueError(
            f"Refusing catalog update: would remove {original_count - cleaned_count} of "
            f"{original_count} IDs (over {max_drop:.0%})."
        )


def write_catalog_atomic(path, data):
    directory = os.path.dirname(path) or "."
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=directory, delete=False) as output:
            temporary_path = output.name
            json.dump(data, output, indent=2)
            output.write("\n")
        mode = stat.S_IMODE(os.stat(path).st_mode) if os.path.exists(path) else 0o644
        os.chmod(temporary_path, mode)
        os.replace(temporary_path, path)
    except Exception:
        if temporary_path and os.path.exists(temporary_path):
            os.unlink(temporary_path)
        raise


def validate_catalog(path=PATH, api_key=None, lookup_fn=lookup):
    original = load_catalog(path)
    unique, duplicates, malformed = unique_valid_ids(original)
    unavailable = non_embeddable = 0
    cleaned = unique
    if api_key:
        statuses = lookup_fn(unique, api_key)
        cleaned = []
        for video_id in unique:
            status = statuses.get(video_id)
            if not status or status.get("privacyStatus") != "public":
                unavailable += 1
            elif status.get("embeddable") is not True:
                non_embeddable += 1
            else:
                cleaned.append(video_id)
    else:
        print("YOUTUBE_API_KEY is not configured; skipping availability and embeddability checks.")

    enforce_drop_guard(len(original), len(cleaned))
    write_catalog_atomic(path, cleaned)
    return {
        "loaded": len(original),
        "valid": len(cleaned),
        "unavailable": unavailable,
        "non_embeddable": non_embeddable,
        "duplicates": duplicates + malformed,
    }


def main():
    result = validate_catalog(api_key=os.environ.get("YOUTUBE_API_KEY"))
    print(
        f"Loaded: {result['loaded']}\nValid: {result['valid']}\n"
        f"Removed unavailable: {result['unavailable']}\n"
        f"Removed non-embeddable: {result['non_embeddable']}\n"
        f"Removed duplicates: {result['duplicates']}\nSaved: {result['valid']}"
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Video validation could not complete: {error}", file=sys.stderr)
        raise
