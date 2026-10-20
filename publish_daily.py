"""Build an allowlisted Pages site and persist public-content dedup history."""
import argparse
import json
from pathlib import Path
import shutil
import tempfile

from daily_service import DailyService

ROOT = Path(__file__).resolve().parent
ASSETS = (
    "index.html", "app.js", "style.css", "daily-content.js", "daily-content.css",
    "sw.js", "manifest.webmanifest", "icon-1024.png", "icon-180.png",
)


def restore_history(service, history):
    with service.connect() as db:
        db.executemany("INSERT OR IGNORE INTO seen VALUES(?,?)", history.get("seen", []))
        db.executemany("INSERT OR REPLACE INTO selections VALUES(?,?,?)",
                       [(r["channel"], r["day"], json.dumps(r["item"], ensure_ascii=False))
                        for r in history.get("selections", [])])


def save_history(service):
    with service.connect() as db:
        return {
            "version": 1,
            "seen": db.execute("SELECT id,first_day FROM seen ORDER BY id").fetchall(),
            "selections": [
                {"channel": channel, "day": day, "item": json.loads(item)}
                for channel, day, item in db.execute(
                    "SELECT channel,day,item FROM selections ORDER BY channel,day")
            ],
        }


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def build_site(output, payload):
    output.mkdir(parents=True, exist_ok=True)
    for name in ASSETS:
        shutil.copyfile(ROOT / name, output / name)
    html = (output / "index.html").read_text(encoding="utf-8")
    assert '<html lang="zh-CN">' in html
    (output / "index.html").write_text(
        html.replace('<html lang="zh-CN">', '<html lang="zh-CN" data-daily-source="static">'),
        encoding="utf-8")
    write_json(output / "daily.json", payload)
    (output / ".nojekyll").touch()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "_site")
    parser.add_argument("--history", type=Path, default=ROOT / "content-history.json")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as directory:
        service = DailyService(directory)
        if args.history.exists():
            restore_history(service, json.loads(args.history.read_text(encoding="utf-8")))
        payload = service.get()
        build_site(args.output, payload)
        write_json(args.history, save_history(service))
    print(json.dumps({"date": payload["date"], "statuses": {
        key: value["status"] for key, value in payload["sections"].items()
    }}, ensure_ascii=False))


if __name__ == "__main__":
    main()
