"""Yeniden bağlanan SSE istemcisi (asyncio): bağlantı koparsa `retry` kadar bekler, Last-Event-ID
ile döner.

    async for olay in listen("http://127.0.0.1:8457/olaylar", max_reconnects=10):
        print(olay.event, olay.data)
Beklemenin saat kaynağı `sleep` parametresidir (testlerde anında). Sunucu 204 dönerse dinleme biter
(WHATWG kuralı: "artık bağlanma"). Yeniden bağlanma sayısı sınırlıdır; aşılırsa `ConnectionError`.
Genişletme: üstel geri çekilme için `delay`'i her başarısız denemede ikiye katlayın (üst sınırla).
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from urllib.parse import urlsplit

from http_sunucu.body import BodyReader
from http_sunucu.headers import Headers
from http_sunucu.parser import HttpError, Limits, PeerClosedError, parse_header_line, read_line
from sunucu_olaylari.events import Event, EventParser


async def _open(
    host: str, port: int, target: str, last_id: str | None
) -> tuple[int, BodyReader, asyncio.StreamWriter]:
    reader, writer = await asyncio.open_connection(host, port)
    lines = [
        f"GET {target} HTTP/1.1",
        f"Host: {host}:{port}",
        "Accept: text/event-stream",
        "Cache-Control: no-store",
    ]
    if last_id:
        lines.append(f"Last-Event-ID: {last_id}")
    writer.write(("\r\n".join(lines) + "\r\n\r\n").encode("utf-8"))
    status = int((await read_line(reader, 8190, 502)).split(b" ")[1])
    headers = Headers()
    while line := await read_line(reader, 8190, 502):
        headers.add(*parse_header_line(line))
    framing = "chunked" if headers.has_token("transfer-encoding", "chunked") else "length"
    length = int(headers.get("content-length") or 0)
    limits = Limits(max_body=1 << 40, body_timeout=3600.0)
    return status, BodyReader(reader, framing, length, limits), writer


async def listen(
    url: str,
    *,
    max_reconnects: int = 5,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> AsyncIterator[Event]:
    parts = urlsplit(url)
    host, port = parts.hostname or "127.0.0.1", parts.port or 80
    target = (parts.path or "/") + (f"?{parts.query}" if parts.query else "")
    parser = EventParser()
    delay = 2.0
    for _ in range(max_reconnects + 1):
        try:
            status, body, writer = await _open(host, port, target, parser.last_id)
        except (OSError, HttpError, PeerClosedError, ValueError, IndexError):
            await sleep(delay)
            continue
        try:
            if status == 204:
                return
            async for chunk in body.iter_chunks():
                for event in parser.feed(chunk):
                    if event.retry is not None:
                        delay = event.retry / 1000
                    yield event
        except (OSError, HttpError, PeerClosedError, asyncio.IncompleteReadError):
            pass  # bağlantı koptu: aşağıda bekleyip yeniden bağlan
        finally:
            writer.close()
        await sleep(delay)
    raise ConnectionError(f"{url}: {max_reconnects} yeniden bağlanma denemesi tükendi.")
