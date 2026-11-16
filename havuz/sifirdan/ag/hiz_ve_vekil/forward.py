"""Arka uca istek iletme (asyncio): bağlan → isteği yaz → yanıt başlığını oku → gövdeyi AKIŞLA
aktar.

Başlık temizliği: "hop-by-hop" başlıklar (Connection, Keep-Alive, TE, Transfer-Encoding, Upgrade…)
ve Connection başlığında ADI GEÇEN başlıklar yalnız tek bir bağlantıya aittir; vekil onları ASLA
iletmez. (Aksi hâlde istemci "Connection: X-Yetki" yazarak vekilin eklediği bir başlığı arka uçtan
sildirebilir.)
Hata türleri: bağlanamama ya da yanıt başlamadan kopma → `retryable=True` (istek işlenmedi, başka
arka uç denenebilir); yanıt zaman aşımı → `retryable=False` (yavaş arka uca tekrar yüklenmek yükü
katlar).
Genişletme: arka uca TLS için `open_connection(..., ssl=bağlam)`; bağlantı havuzu için
`http_istemci/pool.py` kalıbını asyncio'ya uyarlayın.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator
from dataclasses import dataclass

from http_sunucu.body import BodyReader
from http_sunucu.headers import Headers
from http_sunucu.parser import HttpError, Limits, PeerClosedError, parse_header_line, read_line

HOP_BY_HOP = frozenset(
    {
        "connection",
        "keep-alive",
        "proxy-connection",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
    }
)


class BackendError(Exception):
    def __init__(self, message: str, retryable: bool, timeout: bool = False) -> None:
        super().__init__(message)
        self.retryable = retryable
        self.timeout = timeout


def strip_hop_by_hop(headers: Headers) -> Headers:
    named = {t.strip().lower() for v in headers.get_all("connection") for t in v.split(",")}
    return Headers((n, v) for n, v in headers if n.lower() not in HOP_BY_HOP | named)


@dataclass
class UpstreamResponse:
    status: int
    headers: Headers
    body: AsyncIterator[bytes]
    writer: asyncio.StreamWriter

    async def aclose(self) -> None:
        self.writer.close()
        with contextlib.suppress(Exception):
            await self.writer.wait_closed()


async def _read_head(reader: asyncio.StreamReader) -> tuple[int, Headers]:
    while True:
        parts = (await read_line(reader, 8190, 502)).decode("latin-1").split(" ", 2)
        if len(parts) < 2 or not parts[0].startswith("HTTP/1.") or not parts[1].isdigit():
            raise HttpError(502, "arka uç geçerli HTTP yanıtı vermedi")
        headers = Headers()
        while line := await read_line(reader, 8190, 502):
            headers.add(*parse_header_line(line))
        if not 100 <= int(parts[1]) < 200:
            return int(parts[1]), headers


async def _body(
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
    framing: str,
    length: int,
    limits: Limits,
) -> AsyncIterator[bytes]:
    try:
        if framing == "close":
            while chunk := await reader.read(65536):
                yield chunk
        else:
            body = BodyReader(reader, framing, length, limits)
            async for chunk in body.iter_chunks():
                yield chunk
    finally:
        writer.close()


def _framing(method: str, status: int, headers: Headers) -> tuple[str, int]:
    if method == "HEAD" or status in (204, 304):
        return "none", 0
    if headers.has_token("transfer-encoding", "chunked"):
        return "chunked", 0
    length = headers.get("content-length")
    if length is not None and length.isascii() and length.isdigit():
        return "length", int(length)
    return "close", 0


async def forward(
    host: str,
    port: int,
    method: str,
    target: str,
    headers: Headers,
    body: bytes,
    *,
    connect_timeout: float,
    response_timeout: float,
    max_body: int = 100 * 1024 * 1024,
) -> UpstreamResponse:
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), connect_timeout
        )
    except (OSError, TimeoutError) as exc:
        raise BackendError(f"{host}:{port} bağlanılamadı: {exc}", retryable=True) from exc
    lines = [f"{method} {target} HTTP/1.1", *(f"{n}: {v}" for n, v in headers)]
    lines += ["Connection: close", f"Content-Length: {len(body)}"]
    try:
        writer.write(("\r\n".join(lines) + "\r\n\r\n").encode("latin-1") + body)
        await writer.drain()
        status, response_headers = await asyncio.wait_for(_read_head(reader), response_timeout)
    except TimeoutError as exc:
        writer.close()
        raise BackendError(
            f"{host}:{port} zamanında yanıt vermedi", retryable=False, timeout=True
        ) from exc
    except (ConnectionError, PeerClosedError, HttpError, asyncio.IncompleteReadError) as exc:
        writer.close()
        raise BackendError(f"{host}:{port} yanıt vermeden kapandı: {exc}", retryable=True) from exc
    framing, length = _framing(method, status, response_headers)
    limits = Limits(max_body=max_body, body_timeout=response_timeout)
    stream = _body(reader, writer, framing, length, limits)
    return UpstreamResponse(status, response_headers, stream, writer)
