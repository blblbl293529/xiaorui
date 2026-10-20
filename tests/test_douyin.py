import json
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from douyin_source import DouyinClient, DouyinError
from daily_service import DailyService, fetch_channel
from publish_daily import restore_history, save_history, build_site

ENV = {"DOUYIN_CLIENT_KEY": "test-key", "DOUYIN_CLIENT_SECRET": "private-test-secret",
       "DOUYIN_DEVICE_ID": "123"}


class DouyinTests(unittest.TestCase):
    def test_config_and_concurrent_token_reuse(self):
        calls = []
        def transport(path, **kwargs):
            calls.append((path, kwargs))
            if path.startswith("/oauth/"):
                return {"data": {"error_code": 0, "access_token": "private-test-token", "expires_in": 7200}}
            self.assertIn("sort_type=2", path)
            self.assertIn("publish_time=7", path)
            self.assertNotIn("private-test", path)
            self.assertEqual(kwargs["token"], "private-test-token")
            return {"err_no": 0, "data": {"data": {"video_list": []}}}
        client = DouyinClient(transport)
        with patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(client.search("test"))
            self.assertEqual(calls, [])
        with patch.dict(os.environ, {"DOUYIN_CLIENT_KEY": "test"}, clear=True):
            with self.assertRaises(DouyinError): client.search("test")
            self.assertEqual(calls, [])
        with patch.dict(os.environ, ENV, clear=True), ThreadPoolExecutor(max_workers=4) as pool:
            self.assertEqual(list(pool.map(client.search, ["a", "b", "c", "d"])), [[], [], [], []])
        self.assertEqual(sum(path.startswith("/oauth/") for path, _ in calls), 1)

    def test_token_expiry_retry_and_permission_failure(self):
        tokens, searches = [], []
        def transport(path, **kwargs):
            if path.startswith("/oauth/"):
                tokens.append(len(tokens) + 1)
                return {"data": {"error_code": 0, "access_token": "token" + str(tokens[-1]), "expires_in": 7200}}
            searches.append(kwargs["token"])
            return {"err_no": 28001008 if len(searches) == 1 else 28001018,
                    "err_msg": "PRIVATE SERVER DETAIL"}
        with patch.dict(os.environ, ENV, clear=True):
            with self.assertRaises(DouyinError) as caught: DouyinClient(transport).search("test")
        self.assertEqual(searches, ["token1", "token2"])
        self.assertEqual(caught.exception.platform_code, 28001018)
        self.assertNotIn("PRIVATE", str(caught.exception))

    def test_auto_recommendations_dedup_cloud_restart_and_safe_export(self):
        clock = datetime(2026, 10, 20, 8, tzinfo=timezone.utc)
        # Duplicate result returned across all categories; only one may select it.
        rows = [{"item_id": "123456789", "title": "跟练", "create_time": int(clock.timestamp()) - 60,
                 "nickname": "作者", "link": "https://evil.example/redirect",
                 "cover": "javascript:bad", "high_quality_text": "PRIVATE FULL BODY"},
                {"item_id": "../bad", "title": "invalid", "create_time": 0}]
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            with patch("daily_service.douyin_client.search", return_value=rows), \
                    patch("daily_service.photos", return_value=[]), patch("daily_service.articles", return_value=[]):
                service = DailyService(first, clock=lambda: clock)
                payload = service.get()
                item = payload["sections"]["legs"]["item"]
                self.assertEqual(item["url"], "https://www.douyin.com/video/123456789")
                self.assertEqual(item["imageUrl"], "")
                self.assertEqual(payload["sections"]["legs"]["mode"], "automatic")
                self.assertEqual(payload["sections"]["glutes"]["status"], "empty")
                cloud = DailyService(second, clock=lambda: clock + timedelta(days=1))
                restore_history(cloud, save_history(service))
                self.assertTrue(all(cloud.get()["sections"][c]["status"] == "empty"
                                    for c in ("legs", "glutes", "stretch", "video")))
                output = Path(first) / "site"
                build_site(output, payload)
                exported = (output / "daily.json").read_text(encoding="utf-8")
                self.assertNotIn("PRIVATE", exported)
                self.assertFalse((output / "douyin_source.py").exists())

    def test_error_never_restores_legacy_video_and_logs_only_safe_code(self):
        with tempfile.TemporaryDirectory() as directory:
            service = DailyService(directory)
            restore_history(service, {"selections": [{
                "channel": "legs", "day": "2026-10-20",
                "item": {"url": "https://www.bilibili.com/video/BV123456", "title": "old"},
            }]})
            with patch("daily_service.douyin_client.search", side_effect=DouyinError("secret-must-not-be-logged", 28001018)), \
                    patch("daily_service.photos", return_value=[]), patch("daily_service.articles", return_value=[]):
                section = service.get()["sections"]["legs"]
            self.assertEqual(section["status"], "error")
            self.assertEqual(section["mode"], "automatic")
            self.assertIsNone(section["item"])
            log = (Path(directory) / "errors.jsonl").read_text()
            self.assertNotIn("secret-must-not-be-logged", log)
            self.assertEqual(json.loads(log.splitlines()[0])["platformCode"], 28001018)


if __name__ == "__main__":
    unittest.main()
