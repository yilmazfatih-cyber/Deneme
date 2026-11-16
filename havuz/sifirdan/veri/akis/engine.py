"""Olay zamanlı akış işleyici: pencereler, filigran (watermark), izin verilen gecikme, geç gelenler.

Olaylar VARIŞ sırasıyla gelir ama OLAY zamanına göre pencerelere düşer. Filigran = görülen en büyük
olay zamanı - `out_of_orderness` ("bundan eski olay artık gelmez" tahmini). Filigran bir pencerenin
bitişini geçince pencere SONUÇ verir ("ilk"). Pencere `allowed_lateness` kadar daha açık tutulur: o
sürede gelen geç olay sonucu günceller ("düzeltme"). Daha geç gelen olay pencereye girmez, `late`
listesine gider.

    olay zamanı:   3 7 12 5 21 ...      filigran (gecikme 4): 8 → [0,10) bitişi 10 > 8, henüz değil
    varış ──────►  21 gelince filigran 17 → [0,10) "ilk" sonucu verir; [10,20) bekler

Genişletme: sonuçları bir anahtar-değer deposuna (bkz. anahtar_deger) yazıp işleyicinin durumunu
(açık pencereler + filigran) anlık görüntüyle kalıcı kılın; çökmede kaldığı yerden devam etsin.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from .aggregates import Aggregate
from .windows import Sliding, Tumbling, Window

MIN_TIME = -(2**63)


@dataclass(frozen=True)
class Event:
    key: str
    value: float
    time: int  # olay zamanı (tamsayı; ör. ms)


@dataclass(frozen=True)
class Result:
    window: Window
    key: str
    value: float | None
    kind: str  # "ilk" (filigran geçti), "düzeltme" (geç olay geldi), "son" (kapatıldı)


@dataclass
class _State:
    aggregate: Aggregate
    fired: bool = False


@dataclass
class StreamProcessor:
    assigner: Tumbling | Sliding
    make_aggregate: Callable[[], Aggregate]
    out_of_orderness: int = 0
    allowed_lateness: int = 0
    watermark: int = MIN_TIME
    late: list[Event] = field(default_factory=list)  # pencereye giremeyecek kadar geç olaylar
    _windows: dict[tuple[Window, str], _State] = field(default_factory=dict)
    _max_time: int = MIN_TIME

    def process(self, event: Event) -> list[Result]:
        """Bir olayı işler; bu olayla çıkan sonuçları döndürür."""
        out: list[Result] = []
        accepted = False
        for window in self.assigner.assign(event.time):
            if window[1] + self.allowed_lateness <= self.watermark:
                continue  # bu pencere kapandı: olay ona giremez
            accepted = True
            state = self._windows.setdefault((window, event.key), _State(self.make_aggregate()))
            state.aggregate.add(event.value)
            if state.fired:  # filigran geçmişti: geç olay sonucu düzeltir
                out.append(Result(window, event.key, state.aggregate.result(), "düzeltme"))
        if not accepted:
            self.late.append(event)
        self._max_time = max(self._max_time, event.time)
        out += self.advance(self._max_time - self.out_of_orderness)
        return out

    def advance(self, watermark: int) -> list[Result]:
        """Filigranı ilerletir (geri gitmez): biten pencereler sonuç verir, süresi dolanlar
        kapanır."""
        if watermark <= self.watermark:
            return []
        self.watermark = watermark
        out: list[Result] = []
        for (window, key), state in sorted(self._windows.items()):
            if not state.fired and window[1] <= watermark:
                state.fired = True
                out.append(Result(window, key, state.aggregate.result(), "ilk"))
        for (window, key), state in sorted(self._windows.items()):
            if window[1] + self.allowed_lateness <= watermark:
                del self._windows[(window, key)]
                out.append(Result(window, key, state.aggregate.result(), "son"))
        return out

    def flush(self) -> list[Result]:
        """Akış bitti: bütün pencereleri sonuçlandırıp kapatır."""
        return self.advance(2**63 - 1)

    def open_windows(self) -> int:
        return len(self._windows)
