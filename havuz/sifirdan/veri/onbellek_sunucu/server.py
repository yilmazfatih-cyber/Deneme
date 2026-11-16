"""asyncio TCP sunucusu: bağlantı başına RESP çözümleme, ardışık (pipelined) istekler, arka plan
görevleri.

Arka planda: etkin süre dolumu (her `expire_interval` sn) ve isteğe bağlı dönemsel anlık görüntü.
`SAVE` komutu ve kapanış da görüntü alır (yol verildiyse). Tek iş parçacığı + olay döngüsü: komutlar
sırayla yürür, kilit gerekmez.

Genişletme: kimlik doğrulama (AUTH) için `_handle`'da ilk komutu denetleyin; TLS için
`asyncio.start_server(..., ssl=ssl_context)`.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import Callable
from pathlib import Path

from . import snapshot
from .resp import Error, ProtocolError, Reply, SimpleString, encode, parse_request
from .store import Store

DEFAULT_PORT = 8450  # havuz kapı aralığı 8450–8469 (STANDARTLAR §12)


class CacheServer:
    def __init__(
        self,
        store: Store,
        host: str = "127.0.0.1",
        port: int = DEFAULT_PORT,
        snapshot_path: str | Path | None = None,
        save_interval: float | None = None,
        expire_interval: float | None = 0.1,
    ) -> None:
        self.store = store
        self.host, self.port = host, port
        self.snapshot_path = None if snapshot_path is None else Path(snapshot_path)
        self.save_interval = save_interval
        self.expire_interval = expire_interval
        self._server: asyncio.Server | None = None
        self._tasks: list[asyncio.Task[None]] = []
        self.connections = 0

    async def start(self) -> int:
        """Dinlemeye başlar; gerçek kapı numarasını döndürür (port=0 ise işletim sistemi seçer)."""
        if self.snapshot_path is not None and self.snapshot_path.exists():
            snapshot.load(self.store, self.snapshot_path)
        self._server = await asyncio.start_server(self._handle, self.host, self.port)
        self.port = self._server.sockets[0].getsockname()[1]
        if self.expire_interval:
            self._tasks.append(asyncio.create_task(self._every(self.expire_interval, self._expire)))
        if self.save_interval and self.snapshot_path is not None:
            self._tasks.append(asyncio.create_task(self._every(self.save_interval, self.save)))
        return self.port

    async def _every(self, seconds: float, action: Callable[[], None]) -> None:
        while True:
            await asyncio.sleep(seconds)
            action()

    def _expire(self) -> None:
        self.store.active_expire_cycle()

    def save(self) -> None:
        if self.snapshot_path is not None:
            snapshot.save(self.store, self.snapshot_path)

    async def close(self) -> None:
        for task in self._tasks:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()
        self.save()

    async def _handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        self.connections += 1
        buffer = bytearray()
        try:
            while data := await reader.read(65536):
                buffer += data
                while (request := parse_request(buffer)) is not None:
                    if not request:
                        continue  # boş satır
                    if request[0].lower() == b"quit":
                        writer.write(encode(SimpleString("OK")))
                        return
                    reply: Reply
                    if request[0].lower() == b"save":
                        reply = self._save_reply()
                    else:
                        reply = self.store.execute(request)
                    writer.write(encode(reply))
                await writer.drain()
        except ProtocolError as error:
            writer.write(encode(Error("ERR", f"protokol hatası: {error}")))
        except ConnectionError:
            pass
        finally:
            self.connections -= 1
            with contextlib.suppress(ConnectionError):
                await writer.drain()
            writer.close()

    def _save_reply(self) -> SimpleString | Error:
        if self.snapshot_path is None:
            return Error("ERR", "anlık görüntü yolu verilmedi (--anlik ile başlatın)")
        self.save()
        return SimpleString("OK")
