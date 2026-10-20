"""Official Douyin search. Credentials stay in process memory on the server."""
import json
import os
import threading
import time
import urllib.parse
import urllib.request

ROOT = "https://open.douyin.com"
ENV_NAMES = ("DOUYIN_CLIENT_KEY", "DOUYIN_CLIENT_SECRET", "DOUYIN_DEVICE_ID")


class DouyinError(RuntimeError):
    def __init__(self, reason, platform_code=None):
        super().__init__(reason)
        self.platform_code = platform_code


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward the client secret or access-token through a redirect.
        raise DouyinError("unexpected-api-redirect")


def request_json(path, body=None, token=None):
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["access-token"] = token
    request = urllib.request.Request(
        ROOT + path, data=json.dumps(body).encode() if body is not None else None,
        headers=headers)
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=10) as response:
        raw = response.read(4_000_001)
    if len(raw) > 4_000_000:
        raise DouyinError("response-too-large")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise DouyinError("invalid-response")
    return value


class DouyinClient:
    def __init__(self, transport=request_json, clock=time.monotonic):
        self.transport, self.clock = transport, clock
        self.lock = threading.Lock()
        self.token = None
        self.expires = 0
        self.credentials = None

    def get_token(self, key, secret, invalid_token=None):
        with self.lock:
            changed = self.credentials != (key, secret)
            expired = not self.token or self.clock() >= self.expires
            invalid = invalid_token is not None and self.token == invalid_token
            if changed or expired or invalid:
                response = self.transport("/oauth/client_token/", body={
                    "client_key": key, "client_secret": secret,
                    "grant_type": "client_credential",
                })
                data = response.get("data", {})
                code = data.get("error_code")
                if code != 0:
                    raise DouyinError("token-rejected", code if isinstance(code, int) else None)
                token, ttl = data.get("access_token"), data.get("expires_in")
                if not isinstance(token, str) or not token or not isinstance(ttl, (int, float)) or ttl <= 0:
                    raise DouyinError("invalid-token-response")
                self.token = token
                self.expires = self.clock() + max(1, ttl - 60)
                self.credentials = (key, secret)
            return self.token

    def search(self, keyword):
        key, secret, device = (os.environ.get(name, "").strip() for name in ENV_NAMES)
        if not any((key, secret, device)):
            return None  # Explicitly unconfigured; not a failed upstream request.
        if not all((key, secret, device)) or not device.isascii() or not device.isdigit() or not 0 < int(device) < 2**63:
            raise DouyinError("incomplete-or-invalid-config")
        token = self.get_token(key, secret)
        path = "/dy_open_api/v1/search/video/?" + urllib.parse.urlencode({
            "device_id": device, "keyword": keyword, "count": 20,
            "cursor": 0, "publish_time": 7, "sort_type": 2,
        })
        for attempt in range(2):
            response = self.transport(path, token=token)
            code = response.get("err_no")
            if code in (28001003, 28001008) and attempt == 0:
                token = self.get_token(key, secret, invalid_token=token)
                continue
            if code != 0:
                raise DouyinError("search-rejected", code if isinstance(code, int) else None)
            rows = response.get("data", {}).get("data", {}).get("video_list")
            if not isinstance(rows, list):
                raise DouyinError("invalid-search-response")
            return rows


client = DouyinClient()
