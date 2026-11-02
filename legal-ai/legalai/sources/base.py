"""Kaynak adaptörü protokolü.

Her kaynak iki iş yapar:
  1. `discover(since, until, query)` — hangi belgeler var? (hafif `DocRef` listesi)
  2. `fetch(ref)` — tek bir belgeyi indir, temizle, `Document` üret.

Adaptörler ağ erişimini yalnızca `self.http` üzerinden yapar; böylece testlerde `respx` ile
sahte yanıt verilebilir ve hız sınırı tek yerden yönetilir.
"""

from __future__ import annotations

import asyncio
import logging
import random
from collections.abc import AsyncIterator
from datetime import date
from typing import ClassVar

import httpx

from legalai.models import DocRef, Document, SourceId

log = logging.getLogger(__name__)

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36 legalai/0.1 (+https://github.com/yilmazfatih-cyber/deneme)"
    ),
    "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.5",
}


class SourceError(RuntimeError):
    """Kaynaktan beklenen yapı gelmedi (site değişti, engel, boş yanıt)."""


class RateLimiter:
    """Basit eşzamanlılık + aralık sınırlayıcı. Resmî sitelere nazik davranır."""

    def __init__(self, min_interval: float = 1.0, concurrency: int = 2) -> None:
        self.min_interval = min_interval
        self._sem = asyncio.Semaphore(concurrency)
        self._lock = asyncio.Lock()
        self._last = 0.0

    async def __aenter__(self) -> None:
        await self._sem.acquire()
        async with self._lock:
            loop = asyncio.get_event_loop()
            wait = self._last + self.min_interval - loop.time()
            if wait > 0:
                await asyncio.sleep(wait + random.uniform(0, 0.25))
            self._last = loop.time()

    async def __aexit__(self, *exc: object) -> None:
        self._sem.release()


class BaseSource:
    """Alt sınıflar `source_id`, `discover` ve `fetch` tanımlar."""

    source_id: ClassVar[SourceId]
    display_name: ClassVar[str] = ""
    base_url: ClassVar[str] = ""
    min_interval: ClassVar[float] = 1.0
    concurrency: ClassVar[int] = 2

    def __init__(self, http: httpx.AsyncClient | None = None) -> None:
        self._own_http = http is None
        self.http = http or httpx.AsyncClient(
            headers=DEFAULT_HEADERS, timeout=httpx.Timeout(60.0, connect=20.0), follow_redirects=True
        )
        self.limiter = RateLimiter(self.min_interval, self.concurrency)

    async def aclose(self) -> None:
        if self._own_http:
            await self.http.aclose()

    # ---- alt sınıfların uygulayacağı arayüz -------------------------------------------

    def discover(
        self,
        since: date | None = None,
        until: date | None = None,
        query: str | None = None,
        limit: int | None = None,
    ) -> AsyncIterator[DocRef]:
        """Belirtilen aralıkta/sorguda belgeleri listeler. Tembel (async generator) olmalı."""
        raise NotImplementedError

    async def fetch(self, ref: DocRef) -> Document:
        """Tek belgeyi indirir ve temizlenmiş `Document` döndürür."""
        raise NotImplementedError

    # ---- yardımcılar ----------------------------------------------------------------------

    async def get(self, url: str, **kw: object) -> httpx.Response:
        return await self._request("GET", url, **kw)

    async def post(self, url: str, **kw: object) -> httpx.Response:
        return await self._request("POST", url, **kw)

    async def _request(self, method: str, url: str, retries: int = 3, **kw: object) -> httpx.Response:
        last: Exception | None = None
        for attempt in range(retries):
            async with self.limiter:
                try:
                    resp = await self.http.request(method, url, **kw)  # type: ignore[arg-type]
                    if resp.status_code in (429, 500, 502, 503, 504):
                        raise httpx.HTTPStatusError(
                            f"{resp.status_code} from {url}", request=resp.request, response=resp
                        )
                    resp.raise_for_status()
                    return resp
                except (httpx.TransportError, httpx.HTTPStatusError) as exc:
                    last = exc
                    backoff = 2**attempt + random.uniform(0, 1)
                    log.warning("%s %s başarısız (%s), %.1fs sonra tekrar", method, url, exc, backoff)
                    await asyncio.sleep(backoff)
        raise SourceError(f"{method} {url} {retries} denemede alınamadı: {last}")
