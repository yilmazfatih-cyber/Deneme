"""İstek gövdesi okuyucu: Content-Length ya da parçalı (chunked) çerçeve, boyut sınırı, zaman aşımı.

Parçalı gövde biçimi (RFC 9112 §7.1):
    1a;ad=değer\\r\\n   ← onaltılık boyut (+ yok sayılan uzantılar)
    <26 bayt>\\r\\n
    0\\r\\n             ← son parça
    Ara-Baslik: x\\r\\n ← isteğe bağlı son başlıklar (trailer); ASLA asıl başlıklara karıştırılmaz
    \\r\\n
`Expect: 100-continue`: istemci gövdeyi göndermeden önce onay bekler. `on_first_read` geri çağrısı,
işleyici gövdeyi İLK kez okumak istediğinde "100 Continue" yazar; işleyici okumadan yanıt verirse
(ör. 401) gövde hiç istenmemiş olur.
Genişletme: gövdeyi diske akıtmak için `read_chunk` döngüsüyle dosyaya yazan bir yardımcı ekleyin.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import TypeVar

from http_sunucu.headers import Headers
from http_sunucu.parser import (
    HEX_RE,
    HttpError,
    Limits,
    PeerClosedError,
    parse_header_line,
    read_line,
)

T = TypeVar("T")


class BodyReader:
    """Tek bir isteğin gövdesi. `read_all()` ya da `async for parca in govde.iter_chunks()`."""

    def __init__(
        self,
        reader: asyncio.StreamReader,
        framing: str,
        length: int,
        limits: Limits,
        on_first_read: Callable[[], Awaitable[None]] | None = None,
    ) -> None:
        self._reader = reader
        self._framing = framing
        self._remaining = length
        self._limits = limits
        self._on_first_read = on_first_read
        self._chunk_left = 0
        self._received = 0
        self.started = False
        self.done = framing == "none" or (framing == "length" and length == 0)
        self.trailers = Headers()

    async def _timed(self, awaitable: Awaitable[T]) -> T:
        try:
            return await asyncio.wait_for(awaitable, self._limits.body_timeout)
        except TimeoutError as exc:
            raise HttpError(408, "gövde zamanında gelmedi") from exc

    async def read_chunk(self, max_size: int = 65536) -> bytes:
        """Gövdenin bir sonraki parçasını döndürür; gövde bitince b"" döner."""
        if self.done:
            return b""
        if not self.started:
            self.started = True
            if self._on_first_read is not None:
                await self._on_first_read()
        if self._framing == "length":
            data = await self._timed(self._reader.read(min(max_size, self._remaining)))
            if not data:
                raise HttpError(400, "gövde eksik geldi")
            self._remaining -= len(data)
            self.done = self._remaining == 0
            return data
        return await self._read_chunked(max_size)

    async def _read_chunked(self, max_size: int) -> bytes:
        if self._chunk_left == 0:
            size = await self._read_chunk_size()
            if size == 0:
                await self._read_trailers()
                self.done = True
                return b""
            self._chunk_left = size
        data = await self._timed(self._reader.read(min(max_size, self._chunk_left)))
        if not data:
            raise HttpError(400, "parça eksik geldi")
        self._chunk_left -= len(data)
        if self._chunk_left == 0:
            try:
                crlf = await self._timed(self._reader.readexactly(2))
            except asyncio.IncompleteReadError as exc:
                raise HttpError(400, "parça sonu eksik") from exc
            if crlf != b"\r\n":
                raise HttpError(400, "parça verisinden sonra CRLF gelmeli")
        return data

    async def _read_line(self) -> bytes:
        try:
            return await self._timed(read_line(self._reader, self._limits.max_line, 400))
        except PeerClosedError as exc:
            raise HttpError(400, "gövde yarıda kesildi") from exc

    async def _read_chunk_size(self) -> int:
        line = await self._read_line()
        size_part, _, extensions = line.partition(b";")
        size_text = size_part.decode("latin-1")
        if not HEX_RE.fullmatch(size_text):  # "0x1a", "+5", " 5", "1_0" gibi biçimler reddedilir
            raise HttpError(400, "parça boyutu geçersiz")
        if any(b < 0x20 or b == 0x7F for b in extensions):
            raise HttpError(400, "parça uzantısında denetim karakteri var")
        size = int(size_text, 16)
        self._received += size
        if self._received > self._limits.max_body:
            raise HttpError(413, "gövde çok büyük")
        return size

    async def _read_trailers(self) -> None:
        total = 0
        while True:
            raw = await self._read_line()
            if not raw:
                return
            total += len(raw)
            if (
                total > self._limits.max_head_bytes
                or len(self.trailers) >= self._limits.max_headers
            ):
                raise HttpError(431, "son başlıklar çok büyük")
            name, value = parse_header_line(raw)
            self.trailers.add(name, value)

    async def iter_chunks(self, max_size: int = 65536) -> AsyncIterator[bytes]:
        while chunk := await self.read_chunk(max_size):
            yield chunk

    async def read_all(self, limit: int | None = None) -> bytes:
        """Gövdenin tamamı. `limit` verilirse ondan büyük gövde 413 ile reddedilir."""
        cap = self._limits.max_body if limit is None else min(limit, self._limits.max_body)
        if self._framing == "length" and self._remaining > cap:
            raise HttpError(413, "gövde çok büyük")
        parts: list[bytes] = []
        size = 0
        async for chunk in self.iter_chunks():
            size += len(chunk)
            if size > cap:
                raise HttpError(413, "gövde çok büyük")
            parts.append(chunk)
        return b"".join(parts)

    async def drain(self, max_bytes: int) -> bool:
        """Okunmamış gövdeyi okuyup atar; `max_bytes`'ı aşmadan biterse True."""
        seen = 0
        while not self.done:
            seen += len(await self.read_chunk())
            if seen > max_bytes:
                return False
        return True
