"""Yayın odası: bir iletiyi odadaki herkese gönderir; yavaş üyeyi tüm odayı yavaşlatmadan çıkarır.

Her üyenin sınırlı bir gönderim kuyruğu ve kendi gönderici görevi vardır:
    broadcast(ileti) → her üyenin kuyruğuna put_nowait → gönderici görev sırayla ws.send()
    kuyruk dolu (üye okumuyor) → o üye 1008 ile kapatılır, diğerleri etkilenmez
Neden: tek bir yavaş istemciye `await ws.send()` ile beklemek, yayın döngüsünü ve herkesi
durdururdu.
Genişletme: oda geçmişi (son N ileti) gerekiyorsa `join` içinde yeni üyenin kuyruğuna önce onları
koyun.
"""

from __future__ import annotations

import asyncio
import contextlib

from websocket.connection import ConnectionClosedError, Message, WebSocket


class _Member:
    def __init__(self, ws: WebSocket, max_queue: int) -> None:
        self.ws = ws
        self.queue: asyncio.Queue[Message] = asyncio.Queue(max_queue)
        self.task: asyncio.Task[None] | None = None


class Room:
    def __init__(self, max_queue: int = 100) -> None:
        self.max_queue = max_queue
        self._members: dict[WebSocket, _Member] = {}
        self._closers: set[asyncio.Task[None]] = set()  # çöp toplayıcı görevleri yarıda silmesin

    def __len__(self) -> int:
        return len(self._members)

    def join(self, ws: WebSocket) -> None:
        member = _Member(ws, self.max_queue)
        member.task = asyncio.create_task(self._sender(member), name="oda-gonderici")
        self._members[ws] = member

    async def leave(self, ws: WebSocket) -> None:
        member = self._members.pop(ws, None)
        if member is not None and member.task is not None:
            member.task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await member.task

    def broadcast(self, message: Message, exclude: WebSocket | None = None) -> int:
        """İletiyi kuyruklara koyar (beklemez); kaç üyeye sıraya alındığını döndürür."""
        delivered = 0
        for ws, member in list(self._members.items()):
            if ws is exclude:
                continue
            try:
                member.queue.put_nowait(message)
                delivered += 1
            except asyncio.QueueFull:
                self._members.pop(ws, None)
                if member.task is not None:
                    member.task.cancel()
                closer = asyncio.create_task(
                    ws.close(1008, "iletileri yeterince hızlı okumuyorsunuz")
                )
                self._closers.add(closer)
                closer.add_done_callback(self._closers.discard)
        return delivered

    async def _sender(self, member: _Member) -> None:
        with contextlib.suppress(ConnectionClosedError, ConnectionError):
            while True:
                await member.ws.send(await member.queue.get())

    async def close_all(self, code: int = 1001) -> None:
        for ws in list(self._members):
            await self.leave(ws)
            await ws.close(code)
        if self._closers:
            await asyncio.gather(*self._closers, return_exceptions=True)
