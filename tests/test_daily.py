import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from daily_service import DailyService, CHANNELS, canonical_id, day, photos, articles, fetch_channel
from server import make_handler
from publish_daily import restore_history, save_history, build_site, ASSETS


class DailyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.clock = datetime(2026, 10, 20, 8, tzinfo=timezone.utc)
        self.fail = False
        self.rows = {}
        self.calls = 0
        for channel in CHANNELS:
            self.rows[channel] = [self.item(channel)]
        self.service = DailyService(self.temp.name, self.fetch, lambda: self.clock)

    def tearDown(self):
        self.temp.cleanup()

    def item(self, name, published=None):
        return {"id": name, "title": name, "url": "https://example.org/" + name,
                "source": "test", "publishedAt": (published or self.clock - timedelta(hours=1)).isoformat()}

    def fetch(self, channel):
        self.calls += 1
        if self.fail:
            raise urllib.error.HTTPError("https://example.org", 412, "restricted", {}, None)
        return self.rows[channel]

    def test_daily_dedup_survives_restart_and_exhaustion(self):
        first = self.service.get()
        self.assertEqual(first["sections"]["article"]["status"], "fresh")
        self.clock += timedelta(minutes=2)
        again = self.service.get(refresh=True)
        self.assertEqual(first["sections"]["article"]["item"], again["sections"]["article"]["item"])
        self.clock += timedelta(days=1)
        self.service = DailyService(self.temp.name, self.fetch, lambda: self.clock)
        second = self.service.get()
        self.assertTrue(all(v["status"] == "empty" for v in second["sections"].values()))
        self.rows["article"].append(self.item("new-article"))
        self.clock += timedelta(minutes=16)
        self.assertEqual(self.service.get()["sections"]["article"]["item"]["title"], "new-article")

    def test_pages_history_survives_fresh_cloud_runner(self):
        self.service.get()
        history = json.loads(json.dumps(save_history(self.service)))
        self.clock += timedelta(days=1)
        with tempfile.TemporaryDirectory() as directory:
            cloud = DailyService(directory, self.fetch, lambda: self.clock)
            restore_history(cloud, history)
            self.assertTrue(all(v["status"] == "empty" for v in cloud.get()["sections"].values()))
            self.fail = True
            self.clock += timedelta(minutes=16)
            stale = cloud.get()["sections"]["legs"]
            self.assertEqual(stale["status"], "stale")
            self.assertEqual(stale["selectedDate"], "2026-10-20")

    def test_pages_output_contains_only_public_assets(self):
        payload = self.service.get()
        output = Path(self.temp.name) / "site"
        build_site(output, payload)
        self.assertEqual({p.name for p in output.iterdir()}, set(ASSETS) | {"daily.json", ".nojekyll"})
        self.assertIn('data-daily-source="static"', (output / "index.html").read_text(encoding="utf-8"))
        self.assertEqual(json.loads((output / "daily.json").read_text(encoding="utf-8")), payload)

    def test_douyin_entries_do_not_fetch_or_reuse_old_videos(self):
        self.service.get()
        history = save_history(self.service)
        with tempfile.TemporaryDirectory() as directory:
            service = DailyService(directory, clock=lambda: self.clock)
            restore_history(service, history)
            with patch.dict(os.environ, {}, clear=True), patch("daily_service.photos", return_value=[]), patch("daily_service.articles", return_value=[]), patch("daily_service.request_bytes") as network:
                payload = service.get()
                for channel in ("legs", "glutes", "stretch", "video"):
                    section = payload["sections"][channel]
                    self.assertEqual(section["mode"], "external_search")
                    self.assertEqual(section["source"], "抖音")
                    self.assertIsNone(section["item"])
                    self.assertIsNone(section["selectedDate"])
                    self.assertTrue(section["searchUrl"].startswith("https://www.douyin.com/search/"))
                    self.assertIsNone(fetch_channel(channel))
                network.assert_not_called()
            self.assertFalse((Path(directory) / "errors.jsonl").exists())

    def test_source_error_preserves_original_date_and_logs_status(self):
        first = self.service.get()
        self.fail = True
        self.clock += timedelta(days=1)
        second = self.service.get()
        item = second["sections"]["legs"]
        self.assertEqual(item["status"], "stale")
        self.assertEqual(item["selectedDate"], first["date"])
        events = [json.loads(x) for x in (Path(self.temp.name) / "errors.jsonl").read_text().splitlines()]
        self.assertEqual(events[0]["status"], 412)

    def test_newest_unseen_and_invalid_candidates(self):
        self.rows["article"] = [
            self.item("old", self.clock - timedelta(days=6)),
            self.item("future", self.clock + timedelta(seconds=1)),
            dict(self.item("invalid"), publishedAt="no-date"),
            dict(self.item("unsafe"), url="javascript:alert(1)"),
            self.item("new", self.clock - timedelta(minutes=1)),
            self.item("too-old", self.clock - timedelta(days=8)),
        ]
        self.assertEqual(self.service.get()["sections"]["article"]["item"]["title"], "new")

    def test_cross_category_dedup_and_tracking_queries(self):
        same = self.item("video")
        same["url"] = "https://www.bilibili.com/video/BV1234567890?spm=foo"
        self.rows["legs"] = [same]
        self.rows["glutes"] = [dict(same, url=same["url"].replace("foo", "bar"))]
        result = self.service.get()
        self.assertEqual(result["sections"]["legs"]["status"], "fresh")
        self.assertEqual(result["sections"]["glutes"]["status"], "empty")
        self.assertEqual(canonical_id(same), "bilibili:BV1234567890")

    def test_cache_and_manual_refresh_rate_limit(self):
        self.service.get()
        self.assertEqual(self.calls, 6)
        self.service.get(refresh=True)
        self.assertEqual(self.calls, 6)
        self.clock += timedelta(seconds=61)
        self.service.get(refresh=True)
        self.assertEqual(self.calls, 12)

    def test_shanghai_midnight(self):
        self.assertEqual(day(datetime(2026, 10, 20, 16, tzinfo=timezone.utc)), "2026-10-21")
        self.service.get()
        self.clock = datetime(2026, 10, 20, 16, tzinfo=timezone.utc)
        self.assertEqual(self.service.get()["date"], "2026-10-21")

    def test_bing_source_date_and_identity(self):
        source = {"images": [{"startdate": "20261019", "fullstartdate": "202610191600",
                              "title": "美图", "url": "/th?id=OHR.BrownSloth_ZH-CN123_1920x1080.jpg",
                              "copyright": "摄影者", "copyrightlink": "https://cn.bing.com/search?q=test"}]}
        with patch("daily_service.request_bytes", return_value=json.dumps(source).encode()):
            result = photos()[0]
        self.assertEqual(day(datetime.fromisoformat(result["publishedAt"])), "2026-10-20")
        self.assertEqual(result["id"], "bing:OHR.BrownSloth")

    def test_article_feed_no_fulltext_and_no_unsafe_url(self):
        raw = b"""<rss><channel><item><title>News</title><link>https://sspai.com/post/123</link>
        <pubDate>Tue, 20 Oct 2026 07:00:00 GMT</pubDate><description>PRIVATE FULL BODY</description>
        </item><item><title>bad</title><link>javascript:bad</link>
        <pubDate>Tue, 20 Oct 2026 07:00:00 GMT</pubDate></item></channel></rss>"""
        with patch("daily_service.request_bytes", return_value=raw):
            result = articles()
        self.assertEqual(len(result), 1)
        self.assertNotIn("PRIVATE FULL BODY", result[0]["description"])

    def test_http_does_not_expose_private_files(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(self.service))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = "http://127.0.0.1:" + str(server.server_port)
        try:
            with urllib.request.urlopen(base + "/api/daily") as response:
                self.assertEqual(response.headers["Cache-Control"], "no-store")
                self.assertIn("sections", json.load(response))
            for path in ("/.git/config", "/.local/daily.sqlite3", "/../server.py", "/daily_service.py"):
                with self.assertRaises(urllib.error.HTTPError) as caught:
                    urllib.request.urlopen(base + path)
                self.assertEqual(caught.exception.code, 404)
            request = urllib.request.Request(base + "/api/daily/refresh", data=b"",
                                              headers={"Origin": "https://evil.example"})
            with self.assertRaises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(request)
            self.assertEqual(caught.exception.code, 403)
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
