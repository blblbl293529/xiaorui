"""Serve the app and daily-content API. No third-party Python dependencies."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import threading
from urllib.parse import urlsplit

from daily_service import DailyService

ROOT = Path(__file__).resolve().parent
PUBLIC = {"index.html", "app.js", "style.css", "daily-content.js", "daily-content.css",
          "sw.js", "manifest.webmanifest", "icon-1024.png", "icon-180.png"}


def make_handler(service):
    class Handler(BaseHTTPRequestHandler):
        def json_response(self, payload, status=200):
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def daily(self, refresh=False):
            try:
                self.json_response(service.get(refresh=refresh))
            except Exception as error:
                service.report_error("service", error)
                self.json_response({"error": "内容服务暂时不可用，请稍后重试"}, 503)

        def do_GET(self):
            path = urlsplit(self.path).path
            if path == "/api/daily":
                return self.daily()
            if path == "/api/health":
                return self.json_response({"status": "ok"})
            name = "index.html" if path == "/" else path.lstrip("/")
            if name not in PUBLIC or not (ROOT / name).is_file():
                return self.json_response({"error": "not found"}, 404)
            content = (ROOT / name).read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(name)[0] or "application/octet-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        def do_POST(self):
            if urlsplit(self.path).path != "/api/daily/refresh":
                return self.json_response({"error": "not found"}, 404)
            # Reject cross-site triggering; no arbitrary upstream proxy or user URLs.
            origin = self.headers.get("Origin")
            if origin and urlsplit(origin).netloc != self.headers.get("Host"):
                return self.json_response({"error": "origin denied"}, 403)
            return self.daily(refresh=True)

    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8765, type=int)
    args = parser.parse_args()
    service = DailyService(ROOT / ".local")
    stop = threading.Event()

    def refresh_loop():
        while not stop.is_set():
            try:
                service.get()
            except Exception as error:
                service.report_error("scheduler", error)
            stop.wait(900)

    threading.Thread(target=refresh_loop, daemon=True).start()
    server = ThreadingHTTPServer((args.host, args.port), make_handler(service))
    print(f"Xiaorui: http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        server.server_close()


if __name__ == "__main__":
    main()
