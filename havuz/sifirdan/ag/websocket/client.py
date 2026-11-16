"""WebSocket istemcisi: `ws://` / `wss://` adresine bağlanır, el sıkışmayı doğrular, `WebSocket`
döndürür.

    ws = await connect("ws://127.0.0.1:8451/oda")
    await ws.send("merhaba")
    print(await ws.recv())
    await ws.close()
Genişletme: vekil (HTTP CONNECT) desteği gerekirse `open_connection` yerine önce vekile bağlanıp
CONNECT isteği yazan küçük bir adım ekleyin.
"""

from __future__ import annotations

import asyncio
import os
import ssl
from collections.abc import Callable, Collection
from urllib.parse import urlsplit

from http_sunucu.headers import Headers
from http_sunucu.parser import parse_header_line, read_line
from websocket.connection import WebSocket
from websocket.handshake import HandshakeError, check_response, client_request, new_key

MAX_HEAD_LINES = 100


async def _read_response_head(reader: asyncio.StreamReader) -> tuple[int, Headers]:
    status_line = await read_line(reader, 8190, 400)
    parts = status_line.decode("latin-1").split(" ", 2)
    if len(parts) < 2 or not parts[0].startswith("HTTP/1.") or not parts[1].isdigit():
        raise HandshakeError(0, "Sunucu HTTP yanıtı göndermedi.")
    headers = Headers()
    for _ in range(MAX_HEAD_LINES):
        line = await read_line(reader, 8190, 400)
        if not line:
            return int(parts[1]), headers
        headers.add(*parse_header_line(line))
    raise HandshakeError(0, "Sunucu yanıtında çok fazla başlık var.")


async def connect(
    url: str,
    *,
    origin: str | None = None,
    subprotocols: Collection[str] = (),
    open_timeout: float = 10.0,
    max_message: int = 1024 * 1024,
    ssl_context: ssl.SSLContext | None = None,
    randbytes: Callable[[int], bytes] = os.urandom,
) -> WebSocket:
    parts = urlsplit(url)
    if parts.scheme not in ("ws", "wss") or not parts.hostname:
        raise ValueError("Adres ws://sunucu[:kapı]/yol ya da wss://… biçiminde olmalı.")
    secure = parts.scheme == "wss"
    port = parts.port or (443 if secure else 80)
    context = (ssl_context or ssl.create_default_context()) if secure else None
    reader, writer = await asyncio.wait_for(
        asyncio.open_connection(parts.hostname, port, ssl=context), open_timeout
    )
    default_port = port == (443 if secure else 80)
    host_header = parts.hostname if default_port else f"{parts.hostname}:{port}"
    target = (parts.path or "/") + (f"?{parts.query}" if parts.query else "")
    key = new_key(randbytes)
    try:
        writer.write(client_request(host_header, target, key, origin, subprotocols))
        await writer.drain()
        status, headers = await asyncio.wait_for(_read_response_head(reader), open_timeout)
        check_response(status, headers, key)
    except BaseException:  # el sıkışma tutmadı (HandshakeError, PeerClosedError, zaman aşımı…)
        writer.close()
        raise
    return WebSocket(reader, writer, is_client=True, max_message=max_message, randbytes=randbytes)
