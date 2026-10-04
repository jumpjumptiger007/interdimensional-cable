"""Small regression tests for catalog ingestion and failure-safe validation."""
import json
import os
import tempfile
import unittest

from scripts import fetch_reddit, validate_videos


class CatalogSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.temp_dir.name, "videos.json")

    def tearDown(self):
        self.temp_dir.cleanup()

    def write_bytes(self, value):
        with open(self.path, "wb") as output:
            output.write(value)

    def test_shorts_rejected_and_supported_url_forms_still_extract(self):
        text = " ".join([
            "https://youtube.com/shorts/AAAAAAAAAAA",
            "https://youtube.com/watch?v=BBBBBBBBBBB",
            "https://youtube.com/embed/CCCCCCCCCCC",
            "https://youtube.com/v/DDDDDDDDDDD",
            "https://youtu.be/EEEEEEEEEEE",
        ])
        self.assertEqual(
            fetch_reddit.extract_ids(text),
            ["BBBBBBBBBBB", "CCCCCCCCCCC", "DDDDDDDDDDD", "EEEEEEEEEEE"],
        )

    def test_corrupt_or_non_array_existing_catalog_is_not_treated_as_empty(self):
        for contents in (b"{not-json", b'{"videos": []}'):
            with self.subTest(contents=contents):
                self.write_bytes(contents)
                with open(self.path, "rb") as source:
                    before = source.read()
                with self.assertRaises(ValueError):
                    fetch_reddit.load_existing(self.path)
                with open(self.path, "rb") as source:
                    self.assertEqual(source.read(), before)

    def test_missing_scraper_catalog_starts_empty(self):
        self.assertEqual(fetch_reddit.load_existing(self.path), [])

    def test_validator_rejects_drop_over_twenty_percent_without_replacing_file(self):
        ids = [f"{index:011d}" for index in range(10)]
        original = json.dumps(ids).encode()
        self.write_bytes(original)
        statuses = {video_id: {"privacyStatus": "public", "embeddable": True} for video_id in ids[:7]}

        with self.assertRaisesRegex(ValueError, "over 20%"):
            validate_videos.validate_catalog(
                self.path,
                api_key="fixture-key",
                lookup_fn=lambda _ids, _key: statuses,
            )
        with open(self.path, "rb") as source:
            self.assertEqual(source.read(), original)

    def test_validator_allows_exactly_twenty_percent_drop(self):
        ids = [f"{index:011d}" for index in range(10)]
        with open(self.path, "w", encoding="utf-8") as output:
            json.dump(ids, output)
        statuses = {video_id: {"privacyStatus": "public", "embeddable": True} for video_id in ids[:8]}

        result = validate_videos.validate_catalog(
            self.path,
            api_key="fixture-key",
            lookup_fn=lambda _ids, _key: statuses,
        )
        self.assertEqual(result["valid"], 8)
        with open(self.path, encoding="utf-8") as source:
            self.assertEqual(json.load(source), ids[:8])

    def test_small_duplicate_and_malformed_cleanup_stays_under_guard(self):
        ids = [f"{index:011d}" for index in range(10)]
        original = ids + [ids[0], "bad"]
        unique, duplicates, malformed = validate_videos.unique_valid_ids(original)
        self.assertEqual(len(unique), 10)
        self.assertEqual(duplicates, 1)
        self.assertEqual(malformed, 1)
        validate_videos.enforce_drop_guard(len(original), len(unique))


if __name__ == "__main__":
    unittest.main()
