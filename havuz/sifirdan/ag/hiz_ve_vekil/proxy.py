"""Ters vekil: istemci → [hız sınırı → arka uç seç → ilet → (gerekirse başka arka uca) yeniden dene]
→ yanıt.

    vekil = ReverseProxy([Backend("127.0.0.1", 9001), Backend("127.0.0.1", 9002)],
    strategy=LeastConnections())
    HttpServer(vekil, port=8456)
Başlıklar:
    X-Forwarded-For: istemcinin sahte değerine GÜVENİLMEZ, gerçek bağlantı adresi yazılır. Yalnız
    istek
        `trusted_proxies`'teki bir adresten (önünüzdeki başka bir vekilden) geliyorsa var olan
        değere eklenir.
        Arka uç bu başlığa ancak vekilin arkasında, dışarıya kapalıysa güvenebilir.
    X-Request-Id: geçerli biçimdeyse korunur, değilse üretilir; yanıta da yazılır (günlükleri
    eşlemek için).
Yeniden deneme yalnız güvenli yöntemlerde, başka bir arka uçta, bütçe izin verdikçe; zaman aşımında
yapılmaz.
Genişletme: istek/yanıt üzerinde yeni bir kural (ör. yol bazlı yönlendirme) `__call__` içinde, arka
uç seçiminden önce eklenir; her kural için `tests/hiz_ve_vekil/test_vekil.py`'ye test.
"""

from __future__ import annotations

import math
import re
import secrets
import time
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field

from hiz_ve_vekil.balancer import Backend, RoundRobin, Strategy
from hiz_ve_vekil.forward import BackendError, UpstreamResponse, forward, strip_hop_by_hop
from hiz_ve_vekil.policies import RateLimiter, RetryBudget
from http_sunucu import Headers, Request, Response

_REQUEST_ID_RE = re.compile(r"[A-Za-z0-9._\-]{1,64}")
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "PUT", "DELETE"})


@dataclass(frozen=True)
class ProxyConfig:
    connect_timeout: float = 2.0
    response_timeout: float = 10.0
    max_attempts: int = 3
    max_body: int = 10 * 1024 * 1024
    trusted_proxies: frozenset[str] = field(default_factory=frozenset)


def forwarded_headers(request: Request, request_id: str, trusted: frozenset[str]) -> Headers:
    client_ip = request.client[0] if request.client else ""
    headers = strip_hop_by_hop(request.headers)
    previous = request.headers.get("x-forwarded-for")
    from_trusted = client_ip in trusted
    for name in ("x-forwarded-for", "x-forwarded-proto", "x-forwarded-host", "x-request-id"):
        headers.remove(name)
    headers.add(
        "X-Forwarded-For", f"{previous}, {client_ip}" if previous and from_trusted else client_ip
    )
    proto = request.headers.get("x-forwarded-proto") if from_trusted else None
    headers.add("X-Forwarded-Proto", proto or request.scheme)
    headers.add("X-Forwarded-Host", request.host)
    headers.add("X-Request-Id", request_id)
    return headers


class ReverseProxy:
    def __init__(
        self,
        backends: list[Backend],
        *,
        strategy: Strategy | None = None,
        limiter: RateLimiter | None = None,
        budget: RetryBudget | None = None,
        config: ProxyConfig | None = None,
        clock: Callable[[], float] = time.monotonic,
        new_request_id: Callable[[], str] = lambda: secrets.token_hex(8),
    ) -> None:
        self.backends = backends
        self.strategy = strategy or RoundRobin()
        self.limiter = limiter
        self.budget = budget or RetryBudget(clock=clock)
        self.config = config or ProxyConfig()
        self.new_request_id = new_request_id

    def _error(self, status: int, request_id: str, retry_after: float | None = None) -> Response:
        response = Response.error(status)
        response.headers.add("X-Request-Id", request_id)
        if retry_after is not None:
            response.headers.add("Retry-After", str(max(1, math.ceil(retry_after))))
        return response

    async def __call__(self, request: Request) -> Response:
        incoming = request.headers.get("x-request-id") or ""
        request_id = incoming if _REQUEST_ID_RE.fullmatch(incoming) else self.new_request_id()
        client_ip = request.client[0] if request.client else ""
        if self.limiter is not None:
            allowed, wait = self.limiter.allow(client_ip)
            if not allowed:
                return self._error(429, request_id, wait)
        body = await request.read(self.config.max_body)
        headers = forwarded_headers(request, request_id, self.config.trusted_proxies)
        self.budget.record_request()
        tried: set[int] = set()
        timed_out = False
        for attempt in range(self.config.max_attempts):
            if attempt:
                if request.method not in SAFE_METHODS or not self.budget.can_retry():
                    break
                self.budget.record_retry()
            candidates = [
                b
                for b in self.backends
                if b.healthy and id(b) not in tried and b.breaker.available()
            ]
            backend = self.strategy.choose(candidates, client_ip)
            if backend is None:
                break
            tried.add(id(backend))
            upstream = await self._try(backend, request, headers, body)
            if isinstance(upstream, BackendError):
                timed_out = timed_out or upstream.timeout
                if not upstream.retryable:
                    break
                continue
            last = attempt + 1 >= self.config.max_attempts
            if upstream.status in (502, 503, 504) and request.method in SAFE_METHODS and not last:
                backend.breaker.failure()
                backend.active -= 1
                await upstream.aclose()
                continue
            return self._relay(backend, upstream, request_id)
        if not tried:
            return self._error(
                503, request_id, 1.0
            )  # hiç uygun arka uç yok (hepsi hasta/açık devre)
        return self._error(504 if timed_out else 502, request_id)

    async def _try(
        self, backend: Backend, request: Request, headers: Headers, body: bytes
    ) -> UpstreamResponse | BackendError:
        backend.breaker.begin()
        backend.active += 1
        try:
            return await forward(
                backend.host,
                backend.port,
                request.method,
                request.target,
                headers,
                body,
                connect_timeout=self.config.connect_timeout,
                response_timeout=self.config.response_timeout,
            )
        except BackendError as err:
            backend.active -= 1
            backend.breaker.failure()
            return err

    def _relay(self, backend: Backend, upstream: UpstreamResponse, request_id: str) -> Response:
        if upstream.status >= 500:
            backend.breaker.failure()
        else:
            backend.breaker.success()
        headers = strip_hop_by_hop(upstream.headers)
        headers.set("X-Request-Id", request_id)
        headers.add("Via", "1.1 sifirdan-vekil")

        async def stream() -> AsyncIterator[bytes]:
            try:
                async for chunk in upstream.body:
                    yield chunk
            finally:
                backend.active -= 1
                await upstream.aclose()

        return Response(upstream.status, headers, stream())
