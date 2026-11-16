"""Akıştan ortanca (iki yığın): sayılar tek tek gelirken ortancayı her an O(1)'de, ekleme O(log n).

Fikir:
    Sayılar iki yarıya bölünür: küçük yarı bir EN BÜYÜK-yığında (Python'da eksi işaretle),
    büyük yarı bir EN KÜÇÜK-yığında tutulur. İki kural korunur: (1) küçük yarının her öğesi
    büyük yarının her öğesinden küçük-eşittir; (2) küçük yarı ya büyük yarıyla eşit boyda ya da
    bir fazladır. O zaman ortanca, küçük yarının tepesidir (tek sayıda öğe) ya da iki tepenin
    ortalamasıdır (çift sayıda). Yeni sayı uygun yarıya eklenir, boylar bozulduysa bir tepe
    öbür yığına aktarılır.

Karmaşıklık: ekleme O(log n); ortanca O(1); yer O(n)
Ne zaman: canlı akışta ortanca (gecikme ölçümleri, sensör verisi, fiyat akışı).
Ne zaman değil: kayan PENCEREDE ortanca gerekiyorsa silme de lazım: iki yığın + tembel silme ya
    da sıralı liste (bisect) kullanın. Yaklaşık yüzdelikler için t-digest / P² gibi özetler.
Bağımlılık: yok
Genişletme: herhangi bir yüzdelik (ör. %90) için yarıların boy oranını 9:1 tutun.

Örnek:
    >>> rm = RunningMedian()
    >>> medians = []
    >>> for x in [5, 15, 1, 3]:
    ...     rm.add(x)
    ...     medians.append(rm.median())
    >>> medians, rm.lower_median()
    ([5, 10.0, 5, 4.0], 3)
"""

from __future__ import annotations

import heapq


class RunningMedian:
    """Sayı akışının ortancası."""

    def __init__(self) -> None:
        self._low: list[float] = []  # küçük yarı, eksi işaretli (en büyük-yığın)
        self._high: list[float] = []  # büyük yarı (en küçük-yığın)

    def __len__(self) -> int:
        return len(self._low) + len(self._high)

    def add(self, value: float) -> None:
        """Sayıyı ekler."""
        if not self._low or value <= -self._low[0]:
            heapq.heappush(self._low, -value)
        else:
            heapq.heappush(self._high, value)
        if len(self._low) > len(self._high) + 1:  # boyları dengele
            heapq.heappush(self._high, -heapq.heappop(self._low))
        elif len(self._high) > len(self._low):
            heapq.heappush(self._low, -heapq.heappop(self._high))

    def lower_median(self) -> float:
        """Alt ortanca: tek sayıda öğede ortanca, çiftte ortadaki iki değerin küçüğü."""
        if not self._low:
            raise ValueError("boş akışın ortancası yok")
        return -self._low[0]

    def median(self) -> float:
        """Ortanca; çift sayıda öğede ortadaki iki değerin ortalaması."""
        if len(self._low) > len(self._high):
            return self.lower_median()
        if not self._low:
            raise ValueError("boş akışın ortancası yok")
        return (-self._low[0] + self._high[0]) / 2
