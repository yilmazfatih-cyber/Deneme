"""Pencere kümeleme işlevleri: sayı, toplam, en küçük, en büyük, ortalama.

Her kümeleme `add(değer)` ile beslenir, `result()` o anki sonucu verir (boş pencerede sayı 0,
ötekiler None). Toplam ve ortalama `math.fsum` ile hesaplanır: olayların varış sırası sonucu (son
bitine dek) değiştirmez — akışta sıra her zaman karışıktır.

Genişletme: YENİ KÜMELEME → `Aggregate`'ten türeyen bir sınıf + `AGGREGATES`'e bir satır + testte
`BATCH` başvurusuna eşdeğeri.
"""

from __future__ import annotations

import math
from abc import ABC, abstractmethod


class Aggregate(ABC):
    @abstractmethod
    def add(self, value: float) -> None:
        """Pencereye bir değer ekler."""

    @abstractmethod
    def result(self) -> float | None:
        """Şimdiki sonuç."""


class Count(Aggregate):
    def __init__(self) -> None:
        self.count = 0

    def add(self, value: float) -> None:
        self.count += 1

    def result(self) -> float | None:
        return self.count


class Sum(Aggregate):
    def __init__(self) -> None:
        self.values: list[float] = []

    def add(self, value: float) -> None:
        self.values.append(value)

    def result(self) -> float | None:
        return math.fsum(self.values) if self.values else None


class Mean(Sum):
    def result(self) -> float | None:
        return math.fsum(self.values) / len(self.values) if self.values else None


class Min(Aggregate):
    def __init__(self) -> None:
        self.best: float | None = None

    def add(self, value: float) -> None:
        self.best = value if self.best is None else min(self.best, value)

    def result(self) -> float | None:
        return self.best


class Max(Min):
    def add(self, value: float) -> None:
        self.best = value if self.best is None else max(self.best, value)


AGGREGATES: dict[str, type[Aggregate]] = {
    "sayi": Count,
    "toplam": Sum,
    "ortalama": Mean,
    "en_kucuk": Min,
    "en_buyuk": Max,
    # YENİ KÜMELEME BURAYA: "ad": SınıfAdı,
}
