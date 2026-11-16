"""Ters vekil bütünleşme testleri: sahte arka uçlar (sağlıklı, çöken, yavaş, 503) ve stdlib
http.client.
"""

from __future__ import annotations

import asyncio
import http.client
import json
from collections.abc import AsyncIterator, Iterator
from typing import Any

import pytest

from destek import HOST, BackgroundLoop
from hiz_ve_vekil import (
    Backend,
    CircuitBreaker,
    HealthChecker,
    LeastConnections,
    ProxyConfig,
    RateLimiter,
    ReverseProxy,
    RoundRobin,
)
from http_sunucu import Headers, HttpServer, Request, Response


def named_backend(name: str) -> Any:
    async def handler(request: Request) -> Response:
        if request.path == "/yavas":
            await asyncio.sleep(1)
        if request.path == "/akis":

            async def parts() -> AsyncIterator[bytes]:
                for word in ("akan ", "veri"):
                    yield word.encode()

            return Response(200, Headers(), parts())
        body = await request.read()
        seen = {k.lower(): v for k, v in request.headers}
        return Response.json({"arka": name, "govde": body.decode(), "basliklar": seen})

    return handler


async def unavailable(request: Request) -> Response:
    return Response.error(503)


class Crashing:
    """Bağlantıyı kabul edip hemen kapatan arka uç; kaç kez bağlanıldığını sayar."""

    def __init__(self) -> None:
        self.connections = 0
        self.server: asyncio.Server | None = None

    async def start(self) -> int:
        async def on_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
            self.connections += 1
            writer.close()

        self.server = await asyncio.start_server(on_client, HOST, 0)
        return int(self.server.sockets[0].getsockname()[1])

    async def close(self) -> None:
        assert self.server is not None
        self.server.close()
        await self.server.wait_closed()


class Rig:
    """Arka uçları ve vekili başlatıp test sonunda kapatan yardımcı."""

    def __init__(self, loop_thread: BackgroundLoop) -> None:
        self.loop = loop_thread
        self.servers: list[HttpServer] = []
        self.crashers: list[Crashing] = []

    def backend(self, handler: Any) -> Backend:
        server = HttpServer(handler)
        self.loop.run(server.start())
        self.servers.append(server)
        return Backend(HOST, server.port)

    def crashing(self) -> tuple[Backend, Crashing]:
        crasher = Crashing()
        port = self.loop.run(crasher.start())
        self.crashers.append(crasher)
        return Backend(HOST, port), crasher

    def proxy(self, proxy: ReverseProxy) -> int:
        server = HttpServer(proxy)
        self.loop.run(server.start())
        self.servers.append(server)
        return server.port

    def close(self) -> None:
        for server in self.servers:
            self.loop.run(server.close(grace=1))
        for crasher in self.crashers:
            self.loop.run(crasher.close())


@pytest.fixture
def rig(loop_thread: BackgroundLoop) -> Iterator[Rig]:
    setup = Rig(loop_thread)
    yield setup
    setup.close()


def call(
    port: int,
    method: str = "GET",
    path: str = "/",
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
) -> tuple[int, dict[str, str], bytes]:
    conn = http.client.HTTPConnection(HOST, port, timeout=10)
    try:
        conn.request(method, path, body=body, headers=headers or {})
        response = conn.getresponse()
        return response.status, dict(response.getheaders()), response.read()
    finally:
        conn.close()


def test_sirali_dengeleme_ve_akis(rig: Rig) -> None:
    backends = [rig.backend(named_backend("bir")), rig.backend(named_backend("iki"))]
    port = rig.proxy(ReverseProxy(backends, strategy=RoundRobin()))
    names = [json.loads(call(port)[2])["arka"] for _ in range(4)]
    assert names == ["bir", "iki", "bir", "iki"]
    status, headers, body = call(port, path="/akis")
    assert (status, body) == (200, b"akan veri")
    assert headers["Via"] == "1.1 sifirdan-vekil"


def test_coken_arka_uc_atlanir_post_yeniden_denenmez(rig: Rig) -> None:
    broken, crasher = rig.crashing()
    healthy = rig.backend(named_backend("sağlam"))
    port = rig.proxy(ReverseProxy([broken, healthy], strategy=RoundRobin()))
    status, _, body = call(port)
    assert status == 200 and json.loads(body)["arka"] == "sağlam"  # GET başka arka uçta denendi
    # Sıralı sayaç 2'de: POST çökene düşer ve BAŞKA arka uçta denenmez (iki kez sipariş olmasın).
    assert call(port, "POST", body=b"siparis")[0] == 502
    assert crasher.connections == 2


def test_devre_kesici_coken_arka_uca_yuklenmeyi_keser(rig: Rig) -> None:
    broken, crasher = rig.crashing()
    healthy = rig.backend(named_backend("sağlam"))
    broken.breaker = CircuitBreaker(failure_threshold=2, reset_timeout=60)
    port = rig.proxy(ReverseProxy([broken, healthy], strategy=RoundRobin()))
    for _ in range(10):
        assert call(port)[0] == 200
    assert crasher.connections == 2  # eşikten sonra devre açıldı, bir daha denenmedi
    assert broken.breaker.state == "acik"


def test_yavas_arka_uc_504(rig: Rig) -> None:
    slow = rig.backend(named_backend("yavaş"))
    port = rig.proxy(ReverseProxy([slow], config=ProxyConfig(response_timeout=0.2)))
    status, headers, _ = call(port, path="/yavas")
    assert status == 504 and "X-Request-Id" in headers


def test_503_baska_arka_ucta_denenir_hepsi_hastaysa_503(rig: Rig) -> None:
    busy = rig.backend(unavailable)
    fine = rig.backend(named_backend("sağlam"))
    port = rig.proxy(ReverseProxy([busy, fine], strategy=RoundRobin()))
    assert all(call(port)[0] == 200 for _ in range(4))
    fine.healthy = busy.healthy = False
    status, headers, _ = call(port)
    assert status == 503 and headers["Retry-After"] == "1"


def test_hiz_siniri_429(rig: Rig) -> None:
    backend = rig.backend(named_backend("bir"))
    port = rig.proxy(ReverseProxy([backend], limiter=RateLimiter(rate=0.01, capacity=2)))
    statuses = [call(port)[0] for _ in range(4)]
    assert statuses == [200, 200, 429, 429]
    _, headers, _ = call(port)
    assert int(headers["Retry-After"]) >= 1


def test_basliklar_xff_istek_kimligi_hop_by_hop(rig: Rig) -> None:
    backend = rig.backend(named_backend("bir"))
    port = rig.proxy(ReverseProxy([backend], new_request_id=lambda: "kimlik-1"))
    spoof = {
        "X-Forwarded-For": "6.6.6.6",
        "X-Forwarded-Proto": "https",
        "Connection": "X-Yetki",
        "X-Yetki": "yonetici",
        "Keep-Alive": "timeout=9",
    }
    _status, headers, body = call(port, headers=spoof)
    seen = json.loads(body)["basliklar"]
    assert seen["x-forwarded-for"] == "127.0.0.1"  # sahte değer silindi
    assert seen["x-forwarded-proto"] == "http"
    assert seen["x-request-id"] == headers["X-Request-Id"] == "kimlik-1"
    assert "x-yetki" not in seen and "keep-alive" not in seen
    _, kept, _ = call(port, headers={"X-Request-Id": "istemci-izi_42"})
    assert kept["X-Request-Id"] == "istemci-izi_42"
    _, replaced, _ = call(port, headers={"X-Request-Id": "kotu <script> degeri"})
    assert replaced["X-Request-Id"] == "kimlik-1"


def test_guvenilen_vekil_zinciri(rig: Rig) -> None:
    backend = rig.backend(named_backend("bir"))
    config = ProxyConfig(trusted_proxies=frozenset({"127.0.0.1"}))
    port = rig.proxy(ReverseProxy([backend], config=config))
    seen = json.loads(call(port, headers={"X-Forwarded-For": "203.0.113.7"})[2])["basliklar"]
    assert seen["x-forwarded-for"] == "203.0.113.7, 127.0.0.1"


def test_saglik_denetimi(rig: Rig, loop_thread: BackgroundLoop) -> None:
    broken, _ = rig.crashing()
    healthy = rig.backend(named_backend("sağlam"))
    checker = HealthChecker([broken, healthy], rise=2, fall=2, timeout=0.5)
    loop_thread.run(checker.check_once())
    assert broken.healthy  # tek hata yetmez
    loop_thread.run(checker.check_once())
    assert not broken.healthy and healthy.healthy
    port = rig.proxy(ReverseProxy([broken, healthy], strategy=LeastConnections()))
    assert call(port)[0] == 200
