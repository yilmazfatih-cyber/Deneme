"""WebSocket bağlantısı: ileti birleştirme, ping/pong, kapanış el sıkışması, UTF-8 ve boyut
denetimi.

Sunucu ve istemci aynı sınıfı kullanır; tek fark maskeleme yönüdür (`is_client`).
    recv(): çerçeve oku → denetim çerçevesiyse (ping → pong yanıtla; kapat → yankıla) devam et
            → veri çerçevesiyse parçaları birleştir (UTF-8 artımlı doğrulanır) → FIN gelince iletiyi
            döndür
    close(): kapanış çerçevesi gönder → karşı tarafın kapanışını bekle (süre sınırlı) → TCP'yi kapat
Protokol ihlalinde bağlantı uygun kodla "başarısız" kılınır (1002 protokol, 1007 geçersiz UTF-8,
1009 çok büyük) ve `ConnectionClosedError` fırlatılır.
Eşzamanlılık: yazmalar kilitlidir (yayın + otomatik pong aynı anda yazabilir); OKUMAYI tek görev
yapmalıdır.
Genişletme: yeni bir denetim davranışı (ör. pong gecikmesini ölçme) `_handle_control` içine eklenir.
"""

from __future__ import annotations

import asyncio
import codecs
import contextlib
import os
from collections.abc import AsyncIterator, Callable

from websocket.frames import (
    Frame,
    Opcode,
    ProtocolError,
    close_payload,
    encode_frame,
    parse_close_payload,
    read_frame,
)

Message = str | bytes


class ConnectionClosedError(Exception):
    """Bağlantı kapandı. `code`: 1000 olağan, 1001 ayrılıyor, 1006 koptu (kapanış çerçevesi yok)."""

    def __init__(self, code: int, reason: str = "") -> None:
        super().__init__(f"WebSocket kapandı ({code}) {reason}".strip())
        self.code = code
        self.reason = reason


class WebSocket:
    def __init__(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        *,
        is_client: bool,
        max_message: int = 1024 * 1024,
        close_timeout: float = 2.0,
        randbytes: Callable[[int], bytes] = os.urandom,
    ) -> None:
        self._reader = reader
        self._writer = writer
        self.is_client = is_client
        self.max_message = max_message
        self.close_timeout = close_timeout
        self._randbytes = randbytes
        self._write_lock = asyncio.Lock()
        self._reading = False
        self._close_sent = False
        self._close_received = asyncio.Event()
        self._closed = False
        self.close_code: int | None = None
        self.close_reason = ""
        self._pong_waiters: list[asyncio.Future[bytes]] = []
        self._reset_message()

    @property
    def closed(self) -> bool:
        return self._closed

    def _reset_message(self) -> None:
        self._message_opcode: Opcode | None = None
        self._parts: list[bytes] = []
        self._text: list[str] = []
        self._size = 0
        self._decoder = codecs.getincrementaldecoder("utf-8")("strict")

    async def _write_frame(self, opcode: int, payload: bytes, fin: bool = True) -> None:
        mask = self._randbytes(4) if self.is_client else None
        data = encode_frame(opcode, payload, fin=fin, mask=mask)
        async with self._write_lock:
            self._writer.write(data)
            await asyncio.wait_for(self._writer.drain(), self.close_timeout * 5)

    async def send(self, message: Message, fragment_size: int | None = None) -> None:
        """Metin (str) ya da ikili (bytes) ileti gönderir; `fragment_size` verilirse parçalara
        böler.
        """
        if self._closed or self._close_sent:
            raise ConnectionClosedError(self.close_code or 1006, "kapalı bağlantıya yazılamaz")
        opcode = Opcode.TEXT if isinstance(message, str) else Opcode.BINARY
        data = message.encode("utf-8") if isinstance(message, str) else message
        step = fragment_size or max(len(data), 1)
        pieces = [data[i : i + step] for i in range(0, len(data), step)] or [b""]
        for index, piece in enumerate(pieces):
            first = index == 0
            await self._write_frame(
                opcode if first else Opcode.CONTINUATION, piece, index == len(pieces) - 1
            )

    async def ping(self, data: bytes = b"") -> asyncio.Future[bytes]:
        """Ping gönderir; dönen gelecek, `recv` döngüsü pong'u gördüğünde tamamlanır."""
        waiter: asyncio.Future[bytes] = asyncio.get_running_loop().create_future()
        self._pong_waiters.append(waiter)
        await self._write_frame(Opcode.PING, data)
        return waiter

    async def recv(self) -> Message:
        """Bir sonraki tam iletiyi döndürür; bağlantı kapanınca `ConnectionClosedError`."""
        while True:
            frame = await self._read_frame()
            try:
                if frame.opcode >= 0x8:
                    await self._handle_control(frame)
                    continue
                message = self._assemble(frame)
            except ProtocolError as err:
                await self._fail(err)
                raise ConnectionClosedError(err.code, err.reason) from err
            if message is not None:
                return message

    async def __aiter__(self) -> AsyncIterator[Message]:
        with contextlib.suppress(ConnectionClosedError):
            while True:
                yield await self.recv()

    async def _read_frame(self) -> Frame:
        if self._closed or self._close_received.is_set():
            raise ConnectionClosedError(self.close_code or 1006, self.close_reason)
        self._reading = True
        try:
            return await read_frame(
                self._reader, expect_masked=not self.is_client, max_size=self.max_message
            )
        except ProtocolError as err:
            await self._fail(err)
            raise ConnectionClosedError(err.code, err.reason) from err
        except (asyncio.IncompleteReadError, ConnectionError) as exc:
            self.close_code = self.close_code or 1006
            await self._close_transport()
            raise ConnectionClosedError(1006, "kapanış el sıkışması olmadan koptu") from exc
        finally:
            self._reading = False

    def _assemble(self, frame: Frame) -> Message | None:
        if frame.opcode == Opcode.CONTINUATION:
            if self._message_opcode is None:
                raise ProtocolError(1002, "başlamamış bir iletinin devam çerçevesi")
        else:
            if self._message_opcode is not None:
                raise ProtocolError(1002, "önceki parçalı ileti bitmeden yeni ileti başladı")
            self._message_opcode = frame.opcode
        self._size += len(frame.payload)
        if self._size > self.max_message:
            raise ProtocolError(1009, "ileti izin verilen boyutu aşıyor")
        if self._message_opcode == Opcode.TEXT:
            # artımlı: geçersiz bayt ilk parçada bile yakalanır; parçaya bölünmüş harf sorun değil
            try:
                self._text.append(self._decoder.decode(frame.payload, final=frame.fin))
            except UnicodeDecodeError as exc:
                raise ProtocolError(1007, "metin iletisi geçerli UTF-8 değil") from exc
        else:
            self._parts.append(frame.payload)
        if not frame.fin:
            return None
        message: Message = (
            "".join(self._text) if self._message_opcode == Opcode.TEXT else b"".join(self._parts)
        )
        self._reset_message()
        return message

    async def _handle_control(self, frame: Frame) -> None:
        if frame.opcode == Opcode.PING:
            with contextlib.suppress(ConnectionError):
                await self._write_frame(Opcode.PONG, frame.payload)
        elif frame.opcode == Opcode.PONG:
            waiters, self._pong_waiters = self._pong_waiters, []
            for waiter in waiters:
                if not waiter.done():
                    waiter.set_result(frame.payload)
        else:
            code, reason = parse_close_payload(frame.payload)
            self.close_code, self.close_reason = code, reason
            self._close_received.set()
            if not self._close_sent:  # karşı taraf başlattı: aynı kodla yankıla (1005 ise boş yük)
                self._close_sent = True
                with contextlib.suppress(ConnectionError, TimeoutError):
                    await self._write_frame(
                        Opcode.CLOSE, close_payload(code) if code != 1005 else b""
                    )
            await self._close_transport()
            raise ConnectionClosedError(code, reason)

    async def close(self, code: int = 1000, reason: str = "") -> None:
        """Kapanış el sıkışması: kapat gönder → karşı tarafın kapatını bekle → TCP'yi kapat."""
        if self._closed:
            return
        if not self._close_sent:
            self._close_sent = True
            self.close_code = code
            try:
                await self._write_frame(Opcode.CLOSE, close_payload(code, reason))
            except (ConnectionError, TimeoutError):
                await self._close_transport()
                return
        with contextlib.suppress(TimeoutError, ConnectionClosedError):
            async with asyncio.timeout(self.close_timeout):
                if self._reading:  # başka bir görev recv() içinde: kapanışı o görecek
                    await self._close_received.wait()
                while not self._close_received.is_set():
                    await self.recv()  # gelen veri atılır; kapanış çerçevesi gelince çıkılır
        await self._close_transport()

    async def _fail(self, err: ProtocolError) -> None:
        """Protokol ihlali: hata koduyla kapanış çerçevesi gönder ve bağlantıyı hemen kapat."""
        if not self._close_sent:
            self._close_sent = True
            self.close_code, self.close_reason = err.code, err.reason
            with contextlib.suppress(ConnectionError, TimeoutError, ValueError):
                await self._write_frame(Opcode.CLOSE, close_payload(err.code, err.reason[:60]))
        await self._close_transport()

    async def _close_transport(self) -> None:
        if self._closed:
            return
        self._closed = True
        for waiter in self._pong_waiters:
            if not waiter.done():
                waiter.cancel()
        self._writer.close()
        with contextlib.suppress(Exception):
            await asyncio.wait_for(self._writer.wait_closed(), self.close_timeout)
