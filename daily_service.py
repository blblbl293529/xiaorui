"""Daily public-source content, persistent history, and honest failure states."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sqlite3
import threading
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

SHANGHAI = timezone(timedelta(hours=8))
CHANNELS = ("legs", "glutes", "stretch", "video", "photo", "article")
QUERIES = {
    "legs": "腿部塑形 跟练",
    "glutes": "提臀 跟练",
    "stretch": "拉伸 跟练",
    "video": "自然 人文 纪录片",
}
MAX_AGES = {"legs": 30, "glutes": 30, "stretch": 30, "video": 14, "photo": 8, "article": 7}


def now():
    return datetime.now(timezone.utc)


def day(value):
    return value.astimezone(SHANGHAI).date().isoformat()


class TextOnly(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.ignored = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.ignored += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.ignored = max(0, self.ignored - 1)

    def handle_data(self, value):
        if not self.ignored:
            self.parts.append(value)


def plain(value, limit=200):
    parser = TextOnly()
    parser.feed(str(value or ""))
    return re.sub(r"\s+", " ", unescape(" ".join(parser.parts))).strip()[:limit]


def https_url(value):
    if not isinstance(value, str):
        return ""
    if value.startswith("//"):
        value = "https:" + value
    try:
        parsed = urllib.parse.urlsplit(value)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            return ""
        return urllib.parse.urlunsplit(parsed._replace(fragment=""))
    except ValueError:
        return ""


def timestamp(value):
    try:
        if isinstance(value, (float, int)):
            return datetime.fromtimestamp(value, timezone.utc)
        try:
            result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            result = parsedate_to_datetime(value)
        return result if result.tzinfo else result.replace(tzinfo=SHANGHAI)
    except (ValueError, TypeError, AttributeError, OverflowError):
        return None


def canonical_id(item):
    """Content identity, independent of a card or tracking query."""
    url = https_url(item.get("url"))
    parsed = urllib.parse.urlsplit(url)
    match = re.search(r"/video/(BV[A-Za-z0-9]+|av\d+)", parsed.path)
    if parsed.hostname in ("www.bilibili.com", "bilibili.com") and match:
        return "bilibili:" + match.group(1)
    if item.get("source") == "必应每日壁纸":
        return str(item.get("id") or "")
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc.lower(), parsed.path.rstrip("/"), "", ""))


def request_bytes(url, limit=4_000_000):
    request = urllib.request.Request(url, headers={
        "User-Agent": "XiaoruiDaily/1.0 (personal RSS reader)",
        "Accept": "application/json, application/rss+xml, application/xml, text/xml",
    })
    with urllib.request.urlopen(request, timeout=10) as response:
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError("source-too-large")
        return data


def photos():
    data = json.loads(request_bytes(
        "https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=zh-CN"))
    if not isinstance(data.get("images"), list):
        raise ValueError("bing-invalid-response")
    items = []
    for row in data["images"]:
        try:
            published = (datetime.strptime(row["fullstartdate"], "%Y%m%d%H%M").replace(tzinfo=timezone.utc)
                         if row.get("fullstartdate")
                         else datetime.strptime(row["startdate"], "%Y%m%d").replace(tzinfo=SHANGHAI))
        except (KeyError, ValueError):
            continue
        image = urllib.parse.urljoin("https://cn.bing.com", row.get("url", ""))
        identity = urllib.parse.parse_qs(urllib.parse.urlsplit(image).query).get("id", [image])[0]
        # Resolution/market variants of the same photograph share an identity.
        identity = re.sub(r"_[A-Z]{2}-[A-Z]{2}\d+.*$", "", identity)
        items.append({
            "id": "bing:" + identity, "title": plain(row.get("title") or row.get("copyright")),
            "url": https_url(row.get("copyrightlink")) or "https://cn.bing.com/",
            "imageUrl": https_url(image), "source": "必应每日壁纸",
            "publishedAt": published.isoformat(), "description": plain(row.get("copyright"), 300),
        })
    return items


def articles():
    raw = request_bytes("https://sspai.com/feed")
    # No entity expansion or DTDs from external feeds.
    if b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
        raise ValueError("unsupported-feed-dtd")
    root = ET.fromstring(raw)
    items = []
    for row in root.findall("./channel/item"):
        url = https_url(row.findtext("link", ""))
        published = timestamp(row.findtext("pubDate"))
        if not url or not published:
            continue
        items.append({
            "id": url, "title": plain(row.findtext("title")), "url": url,
            "source": "少数派", "publishedAt": published.isoformat(),
            # Title and source link only: no copying a full copyrighted article.
            "description": "来自少数派的最新文章，点击前往来源阅读全文。",
        })
    if not items:
        raise ValueError("empty-or-invalid-article-feed")
    return items


def fetch_channel(channel):
    if channel == "photo":
        return photos()
    if channel == "article":
        return articles()
    if channel in ("legs", "glutes", "stretch", "video"):
        # Search links are not daily recommendations. No unauthorised video fetch.
        return None
    raise ValueError("unknown-content-channel")


class DailyService:
    def __init__(self, directory, fetcher=fetch_channel, clock=now):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.database = self.directory / "daily.sqlite3"
        self.fetcher, self.clock = fetcher, clock
        self.lock = threading.Lock()
        self.snapshot = None
        self.checked_at = None
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS seen(id TEXT PRIMARY KEY, first_day TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS selections(
                    channel TEXT NOT NULL, day TEXT NOT NULL, item TEXT NOT NULL,
                    PRIMARY KEY(channel, day));
            """)

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.database)
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def report_error(self, channel, error):
        event = {"at": self.clock().isoformat(), "component": "daily-content", "channel": channel,
                 "error": type(error).__name__, "status": getattr(error, "code", None)}
        with (self.directory / "errors.jsonl").open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(event) + "\n")

    def get(self, refresh=False):
        with self.lock:
            current = self.clock()
            today = day(current)
            if self.snapshot and self.snapshot["date"] == today:
                failed = any(v["status"] != "fresh" and v.get("mode") != "external_search"
                             for v in self.snapshot["sections"].values())
                ttl = 900 if failed else 14400
                # Browser retries cannot hammer providers; allow explicit refresh once per minute.
                if (current - self.checked_at).total_seconds() < (60 if refresh else ttl):
                    return self.snapshot
            results = {}
            with ThreadPoolExecutor(max_workers=6) as pool:
                futures = {channel: pool.submit(self.fetcher, channel) for channel in CHANNELS}
                for channel, future in futures.items():
                    try:
                        results[channel] = (future.result(), None)
                    except Exception as error:
                        self.report_error(channel, error)
                        results[channel] = ([], error)
            sections = {}
            with self.connect() as db:
                for channel in CHANNELS:
                    candidates, error = results[channel]
                    if candidates is None and error is None:
                        sections[channel] = {
                            "status": "empty", "item": None, "selectedDate": None,
                            "mode": "external_search", "source": "抖音",
                            "searchUrl": "https://www.douyin.com/search/" + urllib.parse.quote(QUERIES[channel], safe=""),
                            "message": "抖音搜索入口，暂未接入自动每日视频推荐。",
                        }
                        continue
                    previous = db.execute(
                        "SELECT day,item FROM selections WHERE channel=? ORDER BY day DESC LIMIT 1",
                        (channel,)).fetchone()
                    if error:
                        sections[channel] = {
                            "status": "stale" if previous else "error",
                            "item": json.loads(previous[1]) if previous else None,
                            "selectedDate": previous[0] if previous else None,
                            "message": "来源暂时无法访问，显示上次内容。" if previous else "来源暂时无法访问，尚未取得新内容。",
                        }
                        continue
                    valid = []
                    for candidate in candidates:
                        if not isinstance(candidate, dict):
                            continue
                        published = timestamp(candidate.get("publishedAt"))
                        url = https_url(candidate.get("url"))
                        identity = canonical_id(candidate)
                        if (not published or not url or not identity or not candidate.get("title")
                                or published > current or current - published > timedelta(days=MAX_AGES[channel])):
                            continue
                        candidate = dict(candidate, id=identity, url=url,
                                         imageUrl=https_url(candidate.get("imageUrl")),
                                         title=plain(candidate["title"]),
                                         description=plain(candidate.get("description"), 300),
                                         source=plain(candidate.get("source"), 100))
                        valid.append((published, identity, candidate))
                    valid.sort(key=lambda row: (row[0], row[1]), reverse=True)
                    selected = None
                    for _, identity, candidate in valid:
                        seen = db.execute("SELECT first_day FROM seen WHERE id=?", (identity,)).fetchone()
                        same_day_choice = (previous and previous[0] == today
                                           and json.loads(previous[1]).get("id") == identity)
                        already_chosen = any(v.get("item", {}).get("id") == identity
                                             for v in sections.values() if v.get("item"))
                        if not already_chosen and (not seen or same_day_choice):
                            selected = candidate
                            break
                    if selected:
                        db.execute("INSERT OR IGNORE INTO seen VALUES(?,?)", (selected["id"], today))
                        db.execute("INSERT OR REPLACE INTO selections VALUES(?,?,?)",
                                   (channel, today, json.dumps(selected, ensure_ascii=False)))
                        sections[channel] = {"status": "fresh", "item": selected, "selectedDate": today,
                                             "message": "从当前可获取的内容中按发布时间选取，已排除往日推荐。"}
                    else:
                        sections[channel] = {"status": "empty", "item": None, "selectedDate": None,
                                             "message": "暂时没有未推荐过的新内容，稍后更新，不循环旧内容。"}
            self.snapshot = {"date": today, "refreshedAt": current.isoformat(), "sections": sections}
            self.checked_at = current
            return self.snapshot
