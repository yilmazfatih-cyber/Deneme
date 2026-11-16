"""Gerçek soketlerle sunucu ↔ istemci: gidiş-dönüş özellik testi, ping/pong, kapanış,
ihlaller, oda.
"""

from __future__ import annotations

import asyncio
import http.client
from collections.abc import Awaitable, Callable

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from destek import HOST, BackgroundLoop
from http_sunucu import HttpServer, Request
from websocket import (
    ConnectionClosedError,
    HandshakeError,
    Message,
    Room,
    WebSocket,
    connect,
    websocket_endpoint,
)
from websocket.frames import Opcode, encode_frame
from websocket.ornek_sohbet import build_app

Scenario = Callable[[int], Awaitable[None]]


async def echo(ws: WebSocket, request: Request) -> None:
    async for message in ws:
        await ws.send(message)


def run_with_server(loop_thread: BackgroundLoop, handler: object, scenario: Scenario) -> None:
    """Sunucuyu başlatır, senaryoyu aynı döngüde çalıştırır, sunucuyu kapatır."""

    async def main() -> None:
        server = HttpServer(handler)  # type: ignore[arg-type]
        await server.start()
        try:
            await scenario(server.port)
        finally:
            await server.close(grace=2)

    loop_thread.run(main(), timeout=60)


def test_metin_ikili_ve_parcali_ileti(loop_thread: BackgroundLoop) -> None:
    async def scenario(port: int) -> None:
        ws = await connect(f"ws://{HOST}:{port}/")
        for message in ["merhaba", "", "İstanbul ğüşiöç 🚀", b"\x00\xff" * 70000, b""]:
            await ws.send(message)
            assert await ws.recv() == message
        await ws.send("parçalı bir türkçe ileti", fragment_size=3)  # harfler parçalara bölünür
        assert await ws.recv() == "parçalı bir türkçe ileti"
        await ws.close()
        assert ws.close_code == 1000

    run_with_server(loop_thread, websocket_endpoint(echo), scenario)


def test_gidis_donus_ozellik_testi(loop_thread: BackgroundLoop) -> None:
    async def scenario(port: int) -> None:
        ws = await connect(f"ws://{HOST}:{port}/")
        messages = st.one_of(st.text(max_size=300), st.binary(max_size=70000))

        @settings(max_examples=40)
        @given(messages, st.sampled_from([None, 1, 7, 125, 126]))
        def check(message: Message, fragment: int | None) -> None:
            async def once() -> Message:
                await ws.send(message, fragment_size=fragment)
                return await ws.recv()

            assert asyncio.run_coroutine_threadsafe(once(), loop).result(10) == message

        loop = asyncio.get_running_loop()
        await asyncio.to_thread(check)
        await ws.close()

    run_with_server(loop_thread, websocket_endpoint(echo), scenario)


def test_ping_pong_ve_kapanis_kodlari(loop_thread: BackgroundLoop) -> None:
    seen: list[tuple[int, str]] = []

    async def handler(ws: WebSocket, request: Request) -> None:
        try:
            async for message in ws:
                if message == "kapat":
                    await ws.close(4000, "sunucu bitirdi")
                    return
                await ws.send(message)
        finally:
            seen.append((ws.close_code or 0, ws.close_reason))

    async def scenario(port: int) -> None:
        ws = await connect(f"ws://{HOST}:{port}/")
        waiter = await ws.ping(b"nabiz")
        await ws.send("a")
        assert await ws.recv() == "a"
        assert waiter.result() == b"nabiz"
        await ws.close(1000, "güle güle")
        other = await connect(f"ws://{HOST}:{port}/")
        await other.send("kapat")
        with pytest.raises(ConnectionClosedError) as info:
            await other.recv()
        assert (info.value.code, info.value.reason) == (4000, "sunucu bitirdi")
        await asyncio.sleep(0.05)

    run_with_server(loop_thread, websocket_endpoint(handler), scenario)
    assert (1000, "güle güle") in seen


HANDSHAKE = (
    b"GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
    b"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n"
)
KEY = b"\x01\x02\x03\x04"


def masked(opcode: int, payload: bytes, fin: bool = True) -> bytes:
    return encode_frame(opcode, payload, fin=fin, mask=KEY)


@pytest.mark.parametrize(
    ("frames", "code"),
    [
        (encode_frame(Opcode.TEXT, b"maskesiz"), 1002),
        (masked(Opcode.TEXT, b"\xff\xfe"), 1007),
        (
            masked(
                Opcode.TEXT, b"\xce\xba\xe1\xbd\xb9\xcf\x83\xce\xbc\xce\xb5\xed\xa0\x80", fin=False
            ),
            1007,
        ),
        (masked(Opcode.CONTINUATION, b"devam"), 1002),
        (masked(Opcode.TEXT, b"bir", fin=False) + masked(Opcode.TEXT, b"iki"), 1002),
        (masked(Opcode.BINARY, bytes(2000)), 1009),
        (
            masked(Opcode.TEXT, b"a" * 600, fin=False) + masked(Opcode.CONTINUATION, b"a" * 600),
            1009,
        ),
        (masked(Opcode.CLOSE, (1005).to_bytes(2, "big")), 1002),
        (b"\x89\xfe\x00\x7e" + KEY + bytes(126), 1002),
    ],
)
def test_ham_ihlaller_dogru_kodla_kapatilir(
    loop_thread: BackgroundLoop, frames: bytes, code: int
) -> None:
    async def scenario(port: int) -> None:
        reader, writer = await asyncio.open_connection(HOST, port)
        writer.write(HANDSHAKE)
        head = await reader.readuntil(b"\r\n\r\n")
        assert head.startswith(b"HTTP/1.1 101")
        writer.write(frames)
        reply = await asyncio.wait_for(
            reader.read(), 5
        )  # sunucu kapanış çerçevesi yollayıp kapatır
        assert reply[0] == 0x88
        assert int.from_bytes(reply[2:4], "big") == code
        writer.close()

    run_with_server(loop_thread, websocket_endpoint(echo, max_message=1000), scenario)


def test_parcalara_bolunmus_gecerli_harf(loop_thread: BackgroundLoop) -> None:
    async def scenario(port: int) -> None:
        reader, writer = await asyncio.open_connection(HOST, port)
        writer.write(HANDSHAKE)
        await reader.readuntil(b"\r\n\r\n")
        text = "ğ".encode()  # iki bayt: parçalar arasında bölünüyor
        writer.write(
            masked(Opcode.TEXT, text[:1], fin=False) + masked(Opcode.CONTINUATION, text[1:])
        )
        assert await reader.readexactly(4) == b"\x81\x02" + text
        writer.close()

    run_with_server(loop_thread, websocket_endpoint(echo), scenario)


def test_el_sikisma_http_uzerinden_reddedilir(loop_thread: BackgroundLoop) -> None:
    async def scenario(port: int) -> None:
        def plain_get() -> tuple[int, str | None]:
            conn = http.client.HTTPConnection(HOST, port, timeout=5)
            conn.request("GET", "/", headers={"Upgrade": "websocket", "Connection": "Upgrade"})
            response = conn.getresponse()
            conn.close()
            return response.status, response.getheader("Sec-WebSocket-Version")

        assert await asyncio.to_thread(plain_get) == (426, "13")
        with pytest.raises(HandshakeError):
            await connect(f"ws://{HOST}:{port}/", origin="http://kotu-site.example")

    run_with_server(loop_thread, websocket_endpoint(echo), scenario)


def test_istemci_websocket_olmayan_sunucuyu_reddeder(loop_thread: BackgroundLoop) -> None:
    from http_sunucu import Response

    async def plain(request: Request) -> Response:
        return Response.text("ben düz HTTP'yim")

    async def scenario(port: int) -> None:
        with pytest.raises(HandshakeError, match="200"):
            await connect(f"ws://{HOST}:{port}/")
        with pytest.raises(ValueError, match="ws://"):
            await connect(f"http://{HOST}:{port}/")

    run_with_server(loop_thread, plain, scenario)


def test_oda_yayini_ve_ornek_sohbet(loop_thread: BackgroundLoop) -> None:
    async def scenario(port: int) -> None:
        def page() -> tuple[int, str, str]:
            conn = http.client.HTTPConnection(HOST, port, timeout=5)
            conn.request("GET", "/")
            response = conn.getresponse()
            body = response.read().decode()
            conn.close()
            return response.status, response.getheader("Content-Security-Policy") or "", body

        status, csp, body = await asyncio.to_thread(page)
        assert status == 200
        assert "connect-src 'self'" in csp
        assert "textContent" in body
        clients = [await connect(f"ws://{HOST}:{port}/oda") for _ in range(3)]
        await asyncio.sleep(0.05)  # üçü de odaya katılsın
        await clients[0].send("herkese merhaba")
        for client in clients:
            assert await asyncio.wait_for(client.recv(), 5) == "herkese merhaba"
        for client in clients:
            await client.close()

    run_with_server(loop_thread, build_app(), scenario)


class _StuckSocket:
    """Hiç okumayan üye: send sonsuza dek bekler."""

    def __init__(self) -> None:
        self.closed_with: int | None = None

    async def send(self, message: Message) -> None:
        await asyncio.Event().wait()

    async def close(self, code: int = 1000, reason: str = "") -> None:
        self.closed_with = code


def test_yavas_uye_odayi_yavaslatmaz(loop_thread: BackgroundLoop) -> None:
    async def scenario() -> None:
        room = Room(max_queue=2)
        stuck = _StuckSocket()
        room.join(stuck)  # type: ignore[arg-type]
        await asyncio.sleep(0)
        delivered = [room.broadcast(f"ileti {i}") for i in range(5)]
        await asyncio.sleep(0.01)
        assert delivered == [1, 1, 0, 0, 0]  # kuyruk 2: üçüncü sığmaz → üye odadan çıkarılır
        assert len(room) == 0
        assert stuck.closed_with == 1008
        await room.close_all()

    loop_thread.run(scenario())


def test_baglanti_kopunca_1006(loop_thread: BackgroundLoop) -> None:
    async def scenario(port: int) -> None:
        ws = await connect(f"ws://{HOST}:{port}/")
        ws._writer.transport.abort()  # kapanış çerçevesi göndermeden kopar
        with pytest.raises(ConnectionClosedError) as info:
            await ws.recv()
        assert info.value.code == 1006

    run_with_server(loop_thread, websocket_endpoint(echo), scenario)
