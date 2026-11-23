"""Gerçek zaman katsayısı (RTF) = işlem süresi / ses süresi. 0,5 → ses süresinin yarısında bitti.

`Kronometre` saati parametreyle alır (testte sahte saat verilir). Duvar saati (perf_counter)
ölçülür: paylaşımlı makinede başka işler de süreyi etkiler; rapora donanım ve iş parçacığı yazılmalı.
Kim kullanır: degerlendir.py, scripts/gidis_donus.py. Genişletme: işlemci süresi gerekiyorsa
`time.process_time`'ı saat olarak verin.
"""

from __future__ import annotations

import time
from collections.abc import Callable


def rtf(islem_sn: float, ses_sn: float) -> float:
    """İşlem süresi / ses süresi; ses süresi 0 ise 0."""
    return islem_sn / ses_sn if ses_sn > 0 else 0.0


class Kronometre:
    """`with Kronometre() as k: ...` → `k.sure` (saniye)."""

    def __init__(self, saat: Callable[[], float] = time.perf_counter) -> None:
        self._saat = saat
        self._bas = 0.0
        self.sure = 0.0

    def __enter__(self) -> Kronometre:
        self._bas = self._saat()
        return self

    def __exit__(self, *_hata: object) -> None:
        self.sure = self._saat() - self._bas
