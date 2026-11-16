"""kuyruk — eşzamanlılığı sınırlı asyncio görev kuyruğu: aynı anda en çok N görev çalışır, gerisi sırada bekler
(öncelik destekli; eşit öncelikte ilk gelen ilk çalışır). Ayrıca `map_limit`: listeyi en çok N paralel işle eşler.

Kullanım:
    kuyruk = TaskQueue(concurrency=3)                       # çalışan bir olay döngüsü içinde kurun
    sonuc = await kuyruk.add(lambda: istemci.get(url))
    kuyruk.add(yedekle, priority=10)                         # büyük öncelik önce çalışır
    await kuyruk.on_idle()                                   # sıra boşalıp çalışan iş bitince
    boyutlar = await map_limit(dosyalar, 4, boyut_oku)        # sıra korunur

Sınırlar: Yalnız asyncio içindir (iş parçacığı havuzu için concurrent.futures kullanın). Bellek içidir; süreç kapanınca
sıradakiler kaybolur. `clear(cancel_running=True)` çalışan görevleri asyncio iptaliyle durdurur. `map_limit` ilk
hatada yeni iş başlatmaz, çalışanları iptal eder ve o hatayı fırlatır.

Genişletme: Görev başına davranış (ör. zaman aşımı: asyncio.timeout) `add` seçeneklerine eklenir ve `_run` içinde
uygulanır; TypeScript eşine (ts/src/kuyruk.ts) aynı adla eklenir.
"""

from __future__ import annotations

import asyncio
import itertools
from collections.abc import Awaitable, Callable, Iterable
from typing import Any, TypeVar

__all__ = ["QueueClearedError", "TaskQueue", "map_limit"]

T = TypeVar("T")
R = TypeVar("R")


class QueueClearedError(Exception):
    """Görev, kuyruk temizlendiği için hiç çalıştırılmadı."""


class TaskQueue:
    """Eşzamanlılığı sınırlı, öncelikli görev kuyruğu."""

    def __init__(self, concurrency: int = 4, *, auto_start: bool = True) -> None:
        if isinstance(concurrency, bool) or not isinstance(concurrency, int) or concurrency < 1:
            raise ValueError("concurrency 1 veya daha büyük bir tam sayı olmalı.")
        self.concurrency = concurrency
        self._paused = not auto_start
        self._waiting: list[tuple[int, int, Callable[[], Awaitable[Any]], asyncio.Future[Any]]] = []
        self._running: dict[asyncio.Task[Any], asyncio.Future[Any]] = {}
        self._counter = itertools.count()
        self._idle: list[asyncio.Future[None]] = []

    @property
    def size(self) -> int:
        """Sırada bekleyen görev sayısı."""
        return len(self._waiting)

    @property
    def pending(self) -> int:
        """Şu an çalışan görev sayısı."""
        return len(self._running)

    def add(self, fn: Callable[[], Awaitable[T]], *, priority: int = 0) -> asyncio.Future[T]:
        """Görevi sıraya ekler; sonucu veren bir Future döner (await edilebilir)."""
        future: asyncio.Future[T] = asyncio.get_running_loop().create_future()
        entry = (-priority, next(self._counter), fn, future)
        # Öncelik büyükten küçüğe; eşitlerde ekleme sırası (kararlı).
        index = len(self._waiting)
        while index > 0 and self._waiting[index - 1][:2] > entry[:2]:
            index -= 1
        self._waiting.insert(index, entry)
        self._pump()
        return future

    def _pump(self) -> None:
        while not self._paused and len(self._running) < self.concurrency and self._waiting:
            _, _, fn, future = self._waiting.pop(0)
            if future.cancelled():
                continue
            task = asyncio.ensure_future(self._run(fn, future))
            self._running[task] = future
            task.add_done_callback(self._finish)
        if not self._running and not self._waiting:
            for waiter in self._idle:
                if not waiter.done():
                    waiter.set_result(None)
            self._idle.clear()

    async def _run(self, fn: Callable[[], Awaitable[Any]], future: asyncio.Future[Any]) -> None:
        try:
            result = await fn()
        except asyncio.CancelledError:
            if not future.done():
                future.cancel()
            raise
        except Exception as error:
            if not future.done():
                future.set_exception(error)
        else:
            if not future.done():
                future.set_result(result)

    def _finish(self, task: asyncio.Task[Any]) -> None:
        future = self._running.pop(task, None)
        # Görev daha başlamadan iptal edildiyse _run hiç çalışmaz; Future'ı burada iptal ederiz.
        if future is not None and not future.done():
            future.cancel()
        self._pump()

    async def on_idle(self) -> None:
        """Sıra boşalıp çalışan görev kalmayınca döner."""
        if not self._running and not self._waiting:
            return
        waiter: asyncio.Future[None] = asyncio.get_running_loop().create_future()
        self._idle.append(waiter)
        await waiter

    def pause(self) -> None:
        """Yeni görev başlatmayı durdurur (çalışanlar sürer)."""
        self._paused = True

    def start(self) -> None:
        self._paused = False
        self._pump()

    def clear(self, *, cancel_running: bool = False) -> None:
        """Sıradakileri QueueClearedError ile reddeder; `cancel_running` → çalışanlar iptal edilir."""
        waiting, self._waiting = self._waiting, []
        for _, _, _, future in waiting:
            if not future.done():
                future.set_exception(
                    QueueClearedError("Görev kuyruk temizlendiği için çalıştırılmadı.")
                )
        if cancel_running:
            for task in list(self._running):
                task.cancel()
        self._pump()


async def map_limit(items: Iterable[T], limit: int, fn: Callable[[T], Awaitable[R]]) -> list[R]:
    """Listeyi en çok `limit` paralel işle eşler; sonuç sırası girdi sırasıdır. İlk hatada durur."""
    if isinstance(limit, bool) or not isinstance(limit, int) or limit < 1:
        raise ValueError("limit 1 veya daha büyük bir tam sayı olmalı.")
    values = list(items)
    results: list[R | None] = [None] * len(values)
    next_index = 0

    async def worker() -> None:
        nonlocal next_index
        while next_index < len(values):
            index = next_index
            next_index += 1
            results[index] = await fn(values[index])

    tasks = [asyncio.ensure_future(worker()) for _ in range(min(limit, len(values)))]
    try:
        await asyncio.gather(*tasks)
    except BaseException:
        for task in tasks:
            task.cancel()  # ilk hatada kalan işler durdurulur; asıl hata olduğu gibi yayılır
        raise
    return results  # type: ignore[return-value]
