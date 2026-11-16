"""Testler için senaryolu rastgele kaynak: `randrange` önceden verilen sayıları sırayla döndürür.

Bir algoritmanın TÜM olası rastgele seçim dizilerini tek tek denemek (ve böylece dağılımı
tam olarak, istatistik yapmadan doğrulamak) için kullanılır.
Genişletme: başka bir yöntem (ör. `random()`) gerekiyorsa aynı biçimde ekleyin.
"""

from __future__ import annotations

import random
from collections.abc import Iterator


class ScriptedRandom(random.Random):
    """randrange(start, stop) çağrılarına sırayla verilen değerleri döndürür."""

    def __init__(self, values: list[int]) -> None:
        super().__init__(0)
        self._values: Iterator[int] = iter(values)

    def randrange(self, start: int, stop: int | None = None, step: int = 1) -> int:
        low, high = (0, start) if stop is None else (start, stop)
        value = next(self._values)
        assert low <= value < high, f"senaryo değeri {value} aralık [{low}, {high}) dışında"
        return value
