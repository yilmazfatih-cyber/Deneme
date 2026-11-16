"""Etkin sağlık denetimi: her arka uca düzenli aralıkla `GET /saglik` gönderir.

    üst üste `fall` başarısız → hasta (vekil ona istek göndermez)
    üst üste `rise` başarılı → yeniden sağlıklı
Neden iki eşik: tek bir kayıp paket arka ucu gereksiz yere havuzdan çıkarmasın, tek bir şanslı yanıt
da çökmüş bir arka ucu hemen geri almasın ("çırpınma" önlenir). Testlerde `check_once()` doğrudan
çağrılır (gerçek bekleme yok); üretimde `start()` arka plan görevi kurar.
Genişletme: yanıt gövdesini de denetlemek (ör. "tamam") için `_probe` içinde gövdeyi okuyun.
"""

from __future__ import annotations

import asyncio
import contextlib

from hiz_ve_vekil.balancer import Backend
from hiz_ve_vekil.forward import BackendError, forward
from http_sunucu.headers import Headers


class HealthChecker:
    def __init__(
        self,
        backends: list[Backend],
        *,
        path: str = "/saglik",
        interval: float = 5.0,
        timeout: float = 1.0,
        rise: int = 2,
        fall: int = 2,
    ) -> None:
        self.backends, self.path, self.interval, self.timeout = backends, path, interval, timeout
        self.rise, self.fall = rise, fall
        self._streak: dict[int, int] = {}  # + art arda başarı, − art arda hata
        self._task: asyncio.Task[None] | None = None

    async def _probe(self, backend: Backend) -> bool:
        headers = Headers([("Host", backend.name), ("User-Agent", "sifirdan-saglik")])
        try:
            upstream = await forward(
                backend.host,
                backend.port,
                "GET",
                self.path,
                headers,
                b"",
                connect_timeout=self.timeout,
                response_timeout=self.timeout,
            )
        except BackendError:
            return False
        await upstream.aclose()
        return 200 <= upstream.status < 400

    async def check_once(self) -> None:
        results = await asyncio.gather(*(self._probe(b) for b in self.backends))
        for backend, ok in zip(self.backends, results, strict=True):
            streak = self._streak.get(id(backend), 0)
            streak = max(streak, 0) + 1 if ok else min(streak, 0) - 1
            self._streak[id(backend)] = streak
            if backend.healthy and streak <= -self.fall:
                backend.healthy = False
            elif not backend.healthy and streak >= self.rise:
                backend.healthy = True

    async def _run(self) -> None:
        while True:
            await self.check_once()
            await asyncio.sleep(self.interval)

    def start(self) -> None:
        self._task = asyncio.create_task(self._run(), name="saglik-denetimi")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
