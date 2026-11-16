"""Pencere atayıcıları: bir olay zamanını hangi pencerelere düştüğüne çevirir.

- Atlayan (tumbling): [0, 10), [10, 20)... her olay TEK pencerede.
- Kayan (sliding/hopping): boy 10, kayma 5 → [0, 10), [5, 15), [10, 20)... her olay boy/kayma
  pencerede. Pencereler yarı açıktır: [başlangıç, bitiş). Zaman tamsayıdır (ör. milisaniye);
  negatif zaman da doğru pencereye düşer (taban bölme).

Genişletme: oturum (session) penceresi için atayıcı yetmez: olaylar arası boşluk `gap`'i aşınca
kapanan, birleşebilen pencereler gerekir (`engine.py`'de pencere birleştirme adımı).
"""

from __future__ import annotations

from dataclasses import dataclass

Window = tuple[int, int]  # [başlangıç, bitiş)


@dataclass(frozen=True)
class Tumbling:
    size: int

    def __post_init__(self) -> None:
        if self.size <= 0:
            raise ValueError("pencere boyu pozitif olmalı")

    def assign(self, timestamp: int) -> list[Window]:
        start = timestamp // self.size * self.size
        return [(start, start + self.size)]


@dataclass(frozen=True)
class Sliding:
    size: int
    slide: int

    def __post_init__(self) -> None:
        if self.size <= 0 or self.slide <= 0 or self.size % self.slide:
            raise ValueError("boy ve kayma pozitif olmalı; boy kaymanın katı olmalı (ör. 10 ve 5)")

    def assign(self, timestamp: int) -> list[Window]:
        last_start = timestamp // self.slide * self.slide
        starts = range(last_start - self.size + self.slide, last_start + 1, self.slide)
        return [(start, start + self.size) for start in starts]
