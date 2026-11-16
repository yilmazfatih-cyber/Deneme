"""SSE: tel biçimi (WHATWG ayrıştırma kuralları), enjeksiyon, yayıncı geçmişi, kopup yeniden
bağlanan istemci.
"""

from __future__ import annotations

import asyncio

import pytest
from hypothesis import given
from hypothesis import strategies as st

from destek import HOST, BackgroundLoop
from http_sunucu import HttpServer
from sunucu_olaylari import Broker, Event, EventParser, comment, format_event, listen, sse_endpoint


def test_bicim_ve_cok_satirli_veri() -> None:
    raw = format_event(Event("satır 1\nsatır 2", "siparis", "7", 3000))
    assert raw == "id: 7\nevent: siparis\nretry: 3000\ndata: satır 1\ndata: satır 2\n\n".encode()
    parser = EventParser()
    assert parser.feed(raw) == [Event("satır 1\nsatır 2", "siparis", "7", 3000)]
    assert parser.last_id == "7"


def test_whatwg_ayrintilari() -> None:
    parser = EventParser()
    stream = b"\xef\xbb\xbf: yorum\r\ndata:bosluksuz\rdata: iki\n\n"  # BOM, yorum, CRLF ve tek CR
    stream += b"event: x\n\nid: 5\nretry: abc\ndata: son\n\n"  # verisiz olay atılır
    events = parser.feed(stream)
    assert [e.data for e in events] == ["bosluksuz\niki", "son"]  # BOM, CR/CRLF, yorum, boş olay
    assert events[1].id == "5" and events[1].retry is None  # sayı olmayan retry yok sayılır


@given(
    st.lists(st.tuples(st.text(max_size=30), st.sampled_from(["message", "siparis"])), max_size=5),
    st.integers(1, 7),
)
def test_parca_parca_besleme_gidis_donus(items: list[tuple[str, str]], step: int) -> None:
    events = [Event(data.replace("\r", ""), kind, str(i)) for i, (data, kind) in enumerate(items)]
    raw = b"".join(format_event(e) for e in events) + comment("nabız")
    parser = EventParser()
    received = [e for i in range(0, len(raw), step) for e in parser.feed(raw[i : i + step])]
    assert [(e.data, e.event, e.id) for e in received] == [(e.data, e.event, e.id) for e in events]


@pytest.mark.parametrize("bad", [Event("x", "a\nevent: sahte"), Event("x", id="1\r\ndata: sahte")])
def test_alan_enjeksiyonu_reddedilir(bad: Event) -> None:
    with pytest.raises(ValueError, match="enjeksiyon"):
        format_event(bad)


def test_gecmisten_kacirilanlar() -> None:
    async def scenario() -> list[str]:
        broker = Broker(history=3)
        for text in ("a", "b", "c", "d"):
            broker.publish(text)
        queue = broker.subscribe("2")
        return [item.data for item in [queue.get_nowait(), queue.get_nowait()] if item]

    assert asyncio.run(scenario()) == ["c", "d"]


def test_kopan_istemci_kaldigi_yerden_devam_eder(loop_thread: BackgroundLoop) -> None:
    async def scenario() -> list[tuple[str, str]]:
        broker = Broker()
        server = HttpServer(sse_endpoint(broker, heartbeat=0.05, retry_ms=10))
        await server.start()
        received: list[tuple[str, str]] = []

        async def produce() -> None:
            await asyncio.sleep(0.1)
            broker.publish("bir")
            await asyncio.sleep(0.05)
            await server.close(grace=0.1)  # sunucu düşer: istemci kopar
            broker.publish("kaçırılan")  # istemci yokken yayınlanan olay
            await server_two.start()
            await asyncio.sleep(0.1)
            broker.publish("üç")

        server_two = HttpServer(sse_endpoint(broker, heartbeat=0.05, retry_ms=10), port=server.port)
        producer = asyncio.create_task(produce())
        url = f"http://{HOST}:{server.port}/olaylar"
        async for event in listen(url, max_reconnects=50, sleep=lambda s: asyncio.sleep(0.02)):
            received.append((event.event, event.data))
            if event.data == "üç":
                break
        await producer
        await server_two.close(grace=0.1)
        return received

    received = loop_thread.run(scenario(), timeout=30)
    data = [d for kind, d in received if kind == "message"]
    assert data == ["bir", "kaçırılan", "üç"]  # Last-Event-ID ile kaçırılan olay da geldi
    assert received[0] == ("hazir", "bağlandı")
