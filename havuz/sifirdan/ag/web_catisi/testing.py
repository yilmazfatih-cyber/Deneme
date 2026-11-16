"""Test istemcisi: ağ olmadan `App.handle`'ı çağırır; çerezleri tarayıcı gibi saklar.

    client = TestClient(app)
    sayfa = client.get("/kayit")
    client.post("/kayit", data={"ad": "ayse", "_csrf": extract_csrf(sayfa.text)})
Genişletme: yeni bir kısayol (ör. `put`) için `request`'i çağıran bir yöntem ekleyin.
"""

from __future__ import annotations

import json as jsonlib
import re
from typing import Any
from urllib.parse import unquote, urlencode, urlsplit

from http_sunucu.headers import Headers
from web_catisi.app import App
from web_catisi.request import Request

_CSRF_RE = re.compile(r'name="_csrf" value="([^"]+)"')


def extract_csrf(html: str) -> str:
    match = _CSRF_RE.search(html)
    if match is None:
        raise AssertionError("Sayfada _csrf alanı yok; formda {csrf_alani} kullanılmalı.")
    return match.group(1)


def encode_multipart(
    fields: dict[str, str],
    files: dict[str, tuple[str, bytes, str]],
    boundary: str = "sifirdan-sinir-1",
) -> tuple[bytes, str]:
    """Form alanları + dosyalar (ad → (dosya adı, içerik, tür)) → (gövde, Content-Type)."""
    parts: list[bytes] = []
    for name, value in fields.items():
        head = f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
        parts.append(head.encode() + value.encode("utf-8"))
    for name, (filename, data, kind) in files.items():
        head = f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
        parts.append((head + f"Content-Type: {kind}\r\n\r\n").encode() + data)
    delimiter = f"--{boundary}".encode()
    body = b"".join(delimiter + b"\r\n" + part + b"\r\n" for part in parts) + delimiter + b"--\r\n"
    return body, f"multipart/form-data; boundary={boundary}"


class TestResponse:
    __test__ = False  # pytest bunu test sınıfı sanmasın

    def __init__(self, status: int, headers: Headers, body: bytes) -> None:
        self.status, self.headers, self.body = status, headers, body

    @property
    def text(self) -> str:
        return self.body.decode("utf-8")

    @property
    def location(self) -> str | None:
        return self.headers.get("location")

    def json(self) -> Any:
        return jsonlib.loads(self.body)


class TestClient:
    __test__ = False

    def __init__(self, app: App, base_url: str = "http://test.yerel") -> None:
        parts = urlsplit(base_url)
        self.app, self.scheme, self.host = app, parts.scheme, parts.netloc
        self.cookies: dict[str, str] = {}

    def request(
        self,
        method: str,
        path: str,
        *,
        data: dict[str, str] | None = None,
        json: Any = None,
        files: dict[str, tuple[str, bytes, str]] | None = None,
        headers: dict[str, str] | None = None,
        follow_redirects: bool = False,
    ) -> TestResponse:
        target, _, query = path.partition("?")
        request_headers = Headers([("Host", self.host)])
        body = b""
        if json is not None:
            body = jsonlib.dumps(json).encode()
            request_headers.add("Content-Type", "application/json")
        elif files:
            body, kind = encode_multipart(data or {}, files)
            request_headers.add("Content-Type", kind)
        elif data is not None:
            body = urlencode(data).encode("ascii")
            request_headers.add("Content-Type", "application/x-www-form-urlencoded")
        if self.cookies:
            request_headers.add("Cookie", "; ".join(f"{k}={v}" for k, v in self.cookies.items()))
        for name, value in (headers or {}).items():
            request_headers.set(name, value)
        request = Request(
            method.upper(), unquote(target), query, request_headers, body, "127.0.0.1", self.scheme
        )
        response = self.app.handle(request)
        self._store_cookies(response.headers)
        result = TestResponse(response.status, response.headers, response.body)
        if follow_redirects and result.status in (301, 302, 303, 307, 308) and result.location:
            return self.request("GET", result.location, follow_redirects=True)
        return result

    def get(self, path: str, **kwargs: Any) -> TestResponse:
        return self.request("GET", path, **kwargs)

    def post(self, path: str, **kwargs: Any) -> TestResponse:
        return self.request("POST", path, **kwargs)

    def _store_cookies(self, headers: Headers) -> None:
        for header in headers.get_all("set-cookie"):
            pair, *attributes = header.split(";")
            name, _, value = pair.strip().partition("=")
            if any(a.strip().lower() == "max-age=0" for a in attributes):
                self.cookies.pop(name, None)
            else:
                self.cookies[name] = value
