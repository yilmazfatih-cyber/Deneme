"""Nazik HTTP getirici: robots.txt saygısı, ana makine başına hız sınırı, önbellek + koşullu istek
(ETag / If-Modified-Since), üstel geri çekilme (429, 5xx, ağ hatası; Retry-After'a uyar),
kullanıcı aracısı (User-Agent) ayarı.

robots.txt kuralı (RFC 9309): dosya 2xx ise okunur ve uyulur; 4xx ise her şeye izin var sayılır;
5xx ya da ağ hatasıysa HİÇBİR şeye izin verilmez. Crawl-delay varsa hız sınırına eklenir.
Saat, uyku ve aktarım katmanı (``Transport``) dışarıdan verilebilir; testler gerçek ağ ve gerçek
bekleme olmadan çalışır (``tests/test_hat.py``).
Kullanıcı aracısına kendi iletişim bilginizi yazın (``VERIHAVUZU_KULLANICI_ARACISI``).
Genişletme: kimlik doğrulamalı bir kaynak için ``get(..., extra_headers={"Authorization": …})``
kullanın; belirteci koda değil ortam değişkenine koyun ve günlüğe yazmayın.
"""

from __future__ import annotations

import os
import random
import ssl
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Protocol
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

from verihavuzu.hat.http_cache import CacheEntry, HttpCache

DEFAULT_USER_AGENT = (
    "verihavuzu/0.1 (+kendi iletisim adresinizi VERIHAVUZU_KULLANICI_ARACISI ile yazin)"
)
RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})


@dataclass
class Response:
    url: str
    status: int
    headers: dict[str, str]
    body: bytes
    from_cache: bool = False

    def text(self, encoding: str = "utf-8") -> str:
        return self.body.decode(encoding)


class FetchError(RuntimeError):
    """Getirme kalıcı olarak başarısız oldu (ileti Türkçedir ve ne yapılacağını söyler)."""


class RobotsDisallowedError(FetchError):
    """robots.txt bu adrese izin vermiyor."""


class Transport(Protocol):
    def send(self, url: str, headers: dict[str, str], timeout: float) -> Response: ...


class UrllibTransport:
    """Standart kitaplıkla GET. HTTP hata kodları istisna değil ``Response`` olarak döner;
    ağ hatası ``OSError`` olarak yükselir (getirici yeniden dener)."""

    def __init__(self) -> None:
        self.context = ssl.create_default_context()

    def send(self, url: str, headers: dict[str, str], timeout: float) -> Response:
        request = urllib.request.Request(url, headers=headers, method="GET")  # noqa: S310
        try:
            with urllib.request.urlopen(request, timeout=timeout, context=self.context) as reply:  # noqa: S310
                return Response(url, reply.status, _lower(dict(reply.headers)), reply.read())
        except urllib.error.HTTPError as error:
            return Response(url, error.code, _lower(dict(error.headers or {})), error.read() or b"")


def _lower(headers: dict[str, str]) -> dict[str, str]:
    return {key.lower(): value for key, value in headers.items()}  # tr-ok: HTTP adları ASCII


@dataclass
class FetchConfig:
    user_agent: str = field(
        default_factory=lambda: os.environ.get("VERIHAVUZU_KULLANICI_ARACISI", DEFAULT_USER_AGENT)
    )
    min_interval: float = 1.0  # aynı ana makineye iki istek arası en az saniye
    max_retries: int = 4
    backoff_base: float = 1.0
    backoff_max: float = 60.0
    timeout: float = 30.0
    respect_robots: bool = True
    cache_dir: Path | None = None


class Fetcher:
    def __init__(
        self,
        config: FetchConfig | None = None,
        transport: Transport | None = None,
        *,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
        seed: int = 0,
    ) -> None:
        self.config = config or FetchConfig()
        self.transport = transport or UrllibTransport()
        self.clock, self.sleep, self.now = clock, sleep, now
        self.random = random.Random(seed)
        self.cache = HttpCache(self.config.cache_dir) if self.config.cache_dir else None
        self.robots: dict[str, RobotFileParser] = {}
        self.last_request: dict[str, float] = {}
        self.requests_sent = 0

    # --- robots.txt -------------------------------------------------------------------------
    def _robots_for(self, url: str) -> RobotFileParser:
        parts = urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        if origin not in self.robots:
            parser = RobotFileParser(origin + "/robots.txt")
            reply: Response | None = None
            try:
                reply = self._send_with_retry(origin + "/robots.txt", {})
            except FetchError:
                reply = None  # ağ ya da sunucu hatası: RFC 9309'a göre hiçbir şeye izin yok
            status = reply.status if reply is not None else 503
            if reply is not None and 200 <= status < 300:
                parser.parse(reply.body.decode("utf-8", "replace").splitlines())
            elif 400 <= status < 500:
                parser.allow_all = True  # type: ignore[attr-defined]
            else:
                parser.disallow_all = True  # type: ignore[attr-defined]
            parser.modified()
            self.robots[origin] = parser
        return self.robots[origin]

    def allowed(self, url: str) -> bool:
        return self._robots_for(url).can_fetch(self.config.user_agent, url)

    # --- hız sınırı ve yeniden deneme ------------------------------------------------------------
    def _wait_turn(self, url: str) -> None:
        host = urlsplit(url).netloc
        interval = self.config.min_interval
        parser = self.robots.get(f"{urlsplit(url).scheme}://{host}")
        delay = parser.crawl_delay(self.config.user_agent) if parser else None
        if delay:
            interval = max(interval, float(delay))
        last = self.last_request.get(host)
        if last is not None:
            remaining = last + interval - self.clock()
            if remaining > 0:
                self.sleep(remaining)
        self.last_request[host] = self.clock()

    def _retry_after(self, reply: Response) -> float | None:
        value = reply.headers.get("retry-after")
        if value is None:
            return None
        if value.strip().isdigit():
            return float(value)
        try:
            return max(0.0, (parsedate_to_datetime(value) - self.now()).total_seconds())
        except (TypeError, ValueError):
            return None

    def _send_with_retry(self, url: str, extra: dict[str, str]) -> Response:
        headers = {"User-Agent": self.config.user_agent, **extra}
        problem = ""
        for attempt in range(self.config.max_retries + 1):
            self._wait_turn(url)
            try:
                self.requests_sent += 1
                reply = self.transport.send(url, headers, self.config.timeout)
            except OSError as error:
                reply, problem = None, f"ağ hatası: {error}"
            if reply is not None and reply.status not in RETRY_STATUSES:
                return reply
            if reply is not None:
                problem = f"HTTP {reply.status}"
            if attempt == self.config.max_retries:
                break
            delay = min(self.config.backoff_max, self.config.backoff_base * 2**attempt)
            delay *= 0.5 + self.random.random() / 2  # titreşim: hepimiz aynı anda dönmeyelim
            hinted = self._retry_after(reply) if reply is not None else None
            self.sleep(min(self.config.backoff_max, max(delay, hinted or 0.0)))
        raise FetchError(
            f"{url} alınamadı ({problem}); {self.config.max_retries} kez yeniden denendi. "
            "Bağlantınızı ve adresi denetleyip daha sonra yeniden çalıştırın."
        )

    # --- ana giriş ---------------------------------------------------------------------------
    def get(
        self, url: str, *, max_age: float | None = None, extra_headers: dict[str, str] | None = None
    ) -> Response:
        """Adresi getirir. ``max_age`` saniyeden genç önbellek kaydı varsa istek atmaz."""
        if self.config.respect_robots and not self.allowed(url):
            raise RobotsDisallowedError(f"robots.txt bu adrese izin vermiyor: {url}")
        cached = self.cache.get(url) if self.cache else None
        if cached is not None and max_age is not None and cached.age_seconds(self.now()) < max_age:
            return Response(
                url, cached.status, {"content-type": cached.content_type or ""}, cached.body, True
            )
        headers = dict(extra_headers or {})
        if cached is not None:
            if cached.etag:
                headers["If-None-Match"] = cached.etag
            if cached.last_modified:
                headers["If-Modified-Since"] = cached.last_modified
        reply = self._send_with_retry(url, headers)
        stamp = self.now().isoformat()
        if reply.status == 304 and cached is not None and self.cache is not None:
            self.cache.touch(url, stamp)
            return Response(url, cached.status, reply.headers, cached.body, True)
        if reply.status == 200 and self.cache is not None:
            self.cache.put(
                CacheEntry(
                    url,
                    200,
                    reply.headers.get("etag"),
                    reply.headers.get("last-modified"),
                    reply.headers.get("content-type"),
                    stamp,
                    reply.body,
                )
            )
        return reply
