"""HTTP/1.1 istemcisi: yönlendirme izleme, yeniden deneme, çerezler, zaman aşımı, akışla okuma.

    with Client() as istemci:
        yanit = istemci.get("https://ornek.test/api", headers={"Accept": "application/json"})
        veri = yanit.json()
İstek akışı:
    adres → [yeniden deneme: havuzdan bağlantı → istek yaz → başlık oku] → yönlendirme mi?
    → evet: Location'ı çöz, yöntemi ayarla (303 → GET), köken değiştiyse Authorization'ı at → tekrar
Yeniden deneme yalnız güvenli/eş-güçlü (idempotent) yöntemlerde: bağlantı hatası ya da 502/503/504.
Bekleme `sleep` parametresiyle verilir (testte sahte, gerçekte `time.sleep`); Retry-After ≤ 30 sn.
Genişletme: yeni bir istek başlığı varsayılanı için `_build_request`'e; yeni bir yeniden deneme
koşulu için `Retry`'a alan ekleyip `_send_with_retries`'e dal ekleyin.
"""

from __future__ import annotations

import json as jsonlib
import ssl
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlencode

from http_istemci.cookies import CookieJar
from http_istemci.errors import (
    ConnectError,
    InsecureRedirectError,
    RemoteDisconnectedError,
    RequestTimeoutError,
    TooManyRedirectsError,
)
from http_istemci.pool import ConnectionPool
from http_istemci.response import Response
from http_istemci.url import Url, parse_url, resolve_reference
from http_sunucu.headers import Headers

REDIRECTS = (301, 302, 303, 307, 308)
SENSITIVE = ("authorization", "proxy-authorization", "cookie")


@dataclass(frozen=True)
class Retry:
    total: int = 2
    backoff: float = 0.2  # saniye; her denemede iki katına çıkar
    statuses: frozenset[int] = field(default_factory=lambda: frozenset({502, 503, 504}))
    methods: frozenset[str] = field(
        default_factory=lambda: frozenset({"GET", "HEAD", "OPTIONS", "PUT", "DELETE"})
    )


class Client:
    def __init__(
        self,
        *,
        timeout: float = 10.0,
        max_redirects: int = 10,
        retry: Retry | None = None,
        cookie_jar: CookieJar | None = None,
        ssl_context: ssl.SSLContext | None = None,
        max_per_origin: int = 4,
        max_body: int = 100 * 1024 * 1024,
        max_decompressed: int = 100 * 1024 * 1024,
        allow_downgrade: bool = False,
        user_agent: str = "sifirdan-istemci/0.1",
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.pool = ConnectionPool(max_per_origin, timeout, ssl_context)
        self.max_redirects = max_redirects
        self.retry = retry or Retry()
        self.cookies = cookie_jar if cookie_jar is not None else CookieJar()
        self.max_body = max_body
        self.max_decompressed = max_decompressed
        self.allow_downgrade = allow_downgrade
        self.user_agent = user_agent
        self.sleep = sleep

    def __enter__(self) -> Client:
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()

    def close(self) -> None:
        self.pool.close()

    def get(self, url: str, **kwargs: Any) -> Response:
        return self.request("GET", url, **kwargs)

    def post(self, url: str, **kwargs: Any) -> Response:
        return self.request("POST", url, **kwargs)

    def head(self, url: str, **kwargs: Any) -> Response:
        return self.request("HEAD", url, **kwargs)

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str] | None = None,
        body: bytes | None = None,
        json: Any = None,
        data: Mapping[str, str] | None = None,
        stream: bool = False,
    ) -> Response:
        """İsteği gönderir. `stream=False` ise gövde okunup bağlantı havuza döner."""
        extra = Headers(list((headers or {}).items()))
        if json is not None:
            body = jsonlib.dumps(json, ensure_ascii=False).encode("utf-8")
            extra.setdefault("Content-Type", "application/json")
        elif data is not None:
            body = urlencode(data).encode("ascii")
            extra.setdefault("Content-Type", "application/x-www-form-urlencoded")
        target = parse_url(url)
        history: list[Response] = []
        method = method.upper()
        for _ in range(self.max_redirects + 1):
            response = self._send_with_retries(method, target, extra, body)
            location = response.headers.get("location")
            if response.status not in REDIRECTS or location is None:
                response.history = history
                if not stream:
                    response.read()
                return response
            next_url = parse_url(resolve_reference(str(target), location))
            if target.scheme == "https" and next_url.scheme == "http" and not self.allow_downgrade:
                response.close()
                raise InsecureRedirectError(f"https → http yönlendirmesi engellendi: {next_url}")
            response.close()  # gövdeyi okumadan kapat (bağlantı yeniden kullanılmaz; güvenli)
            history.append(response)
            if response.status == 303 or (response.status in (301, 302) and method == "POST"):
                method = "GET" if method != "HEAD" else "HEAD"
                body = None
                for name in ("content-type", "content-length", "transfer-encoding"):
                    extra.remove(name)
            if next_url.origin != target.origin:
                for name in SENSITIVE:  # kimlik bilgisi başka bir sunucuya taşınmaz
                    extra.remove(name)
            target = next_url
        raise TooManyRedirectsError(f"{self.max_redirects} yönlendirmeden sonra durduruldu.")

    def _build_request(self, method: str, url: Url, extra: Headers, body: bytes | None) -> bytes:
        headers = Headers([("Host", url.host_header), ("User-Agent", self.user_agent)])
        headers.add("Accept-Encoding", "gzip, deflate")
        cookie = self.cookies.cookie_header(url)
        if cookie and "cookie" not in extra:
            headers.add("Cookie", cookie)
        for name, value in extra:
            headers.set(name, value)
        if body is not None:
            headers.set("Content-Length", str(len(body)))
        lines = [f"{method} {url.target} HTTP/1.1", *(f"{n}: {v}" for n, v in headers)]
        return ("\r\n".join(lines) + "\r\n\r\n").encode("latin-1") + (body or b"")

    def _send_once(self, method: str, url: Url, extra: Headers, body: bytes | None) -> Response:
        payload = self._build_request(method, url, extra, body)
        conn = self.pool.get(url)
        while True:
            try:
                conn.send(payload)
                version, status, reason, headers = conn.read_head()
                break
            except RemoteDisconnectedError:
                conn.close()
                if not conn.reused:
                    raise
                # Havuzdaki bağlantıyı sunucu tam o anda kapatmış (yanıtın tek baytı bile gelmedi):
                # istek işlenmemiştir; tarayıcılar gibi taze bir bağlantıyla bir kez daha denenir.
                conn = self.pool.new(url)
            except BaseException:
                conn.close()
                raise
        for value in headers.get_all("set-cookie"):
            self.cookies.set_from_header(url, value)
        return Response(
            method,
            url,
            version,
            status,
            reason,
            headers,
            conn,
            self.pool.put,
            self.max_body,
            self.max_decompressed,
        )

    def _send_with_retries(
        self, method: str, url: Url, extra: Headers, body: bytes | None
    ) -> Response:
        attempt = 0
        while True:
            idempotent = method in self.retry.methods
            try:
                response = self._send_once(method, url, extra, body)
            except (ConnectError, RequestTimeoutError, RemoteDisconnectedError):
                if not idempotent or attempt >= self.retry.total:
                    raise
                self.sleep(self.retry.backoff * 2**attempt)
                attempt += 1
                continue
            if response.status in self.retry.statuses and idempotent and attempt < self.retry.total:
                delay = self._retry_after(response)  # 0 geçerli bir değerdir: `or` kullanılmaz
                if delay is None:
                    delay = self.retry.backoff * 2**attempt
                response.close()
                self.sleep(delay)
                attempt += 1
                continue
            return response

    @staticmethod
    def _retry_after(response: Response) -> float | None:
        value = (response.headers.get("retry-after") or "").strip()
        if value.isascii() and value.isdigit():
            return min(float(value), 30.0)
        return None
