"""Read workout links and their displayed player lengths from public Douyin cards."""
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

BASE = "https://jingxuan.douyin.com/m/video/"
# (related-video listing, verified video id, title, displayed runtime in seconds)
SOURCES = {
    "office": ("7477605578223799591", "7474610097071656204", "工位练习：坐姿核心动作", 61),
    "glutes": ("7546565261248761146", "7703948619674663921", "四个臀部训练动作", 60),
    "stretch": ("7610312440060744174", "7698512160896694601", "Tabata 拉伸跟练", 327),
}
TOPICS = {"office": r"办公室|工位|办公椅|工间操|班间操", "glutes": r"练臀|提臀|臀部|臀桥|蜜桃臀|翘臀", "stretch": r"拉伸|伸展"}
TIME = re.compile(r"([0-9]{1,2}):([0-5][0-9])")

class Cards(HTMLParser):
    def __init__(self):
        super().__init__()
        self.key = None
        self.parts = {}

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            url = urlsplit(urljoin(BASE, dict(attrs).get("href") or ""))
            match = re.fullmatch(r"/(?:m/)?video/([0-9]{19})/?", url.path)
            self.key = match[1] if match and url.hostname in ("www.douyin.com", "jingxuan.douyin.com") else None

    def handle_endtag(self, tag):
        if tag == "a":
            self.key = None

    def handle_data(self, value):
        if self.key and value.strip():
            self.parts.setdefault(self.key, []).append(value.strip())


def workouts(channel, fetch):
    listing, fixed, title, seconds = SOURCES[channel]
    cards = Cards()
    try:
        cards.feed(fetch(BASE + listing).decode("utf-8"))
    except (OSError, UnicodeError, ValueError):
        pass
    values = {fixed: (title, seconds)}
    for key, parts in cards.parts.items():
        times = {int(m[1])*60 + int(m[2]) for part in parts if (m := TIME.fullmatch(part))}
        titles = [part for part in parts if re.search(TOPICS[channel], part)]
        if len(times) == 1 and titles and 0 < min(times) <= 600:
            values[key] = (titles[0][:120], min(times))
    return [{"url": "https://www.douyin.com/video/" + key, "title": title, "source": "抖音",
             "durationSeconds": sec, "duration": f"{sec//60}:{sec%60:02d}", "workoutTopic": channel,
             "publishedAt": datetime.fromtimestamp(int(key) >> 32, timezone.utc).isoformat(),
             "description": ("精选跟练 · 收录作品，非今日新发布" if key == fixed else "来源：抖音精选"), "imageUrl": ""}
            for key, (title, sec) in values.items()]
