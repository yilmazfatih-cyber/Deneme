"""Dal-sınır (branch and bound): 0/1 sırt çantası, kesirli gevşetmeyle üst sınır ve budama.

Fikir:
    Arama ağacında her eşya için "al / alma" dalları vardır. Her düğümde, o daldan
    ulaşılabilecek en iyi değere bir ÜST SINIR hesaplanır: eşyalar değer/ağırlık oranına göre
    sıralıyken, kalan kapasite açgözlüce doldurulur ve son eşyanın KESRİ alınabilir sayılır
    (kesirli sırt çantası; bu her zaman gerçek en iyiden büyük ya da eşittir). Sınır, şimdiye
    kadar bulunan en iyi çözümden büyük değilse dal hiç açılmaz. Düğümler sınırı en yüksek
    olandan başlayarak (en iyi ilk, öncelik kuyruğuyla) açılır; bu, iyi çözümleri erken bulup
    budamayı güçlendirir.
    DP'nin aksine ağırlıklar ONDALIK ya da çok büyük olabilir (tablo gerekmez).

Karmaşıklık: en kötü O(2ⁿ); pratikte budama çok etkili (yüzlerce eşya); yer O(açık düğüm sayısı)
Ne zaman: ağırlıklar tam sayı değil ya da kapasite çok büyük olduğu için DP tablosu kurulamıyorsa;
    genel olarak tam sayılı en iyileme problemlerinin kalıbı.
Ne zaman değil: küçük tam sayı kapasitede `algoritma/dp/knapsack.py` daha öngörülebilirdir.
Bağımlılık: yok
Genişletme: başka problemlerde yalnız iç `bound` işlevini (gevşetme) ve dallanma kuralını
    değiştirin;
    öncelik kuyruğu iskeleti aynı kalır.

Örnek:
    >>> knapsack_branch_and_bound([2.5, 3.2, 1.7, 4.0], [40, 50, 30, 60], 7.5)  # 7.4 kg
    (120, [0, 1, 2])
"""

from __future__ import annotations

import heapq
from collections.abc import Sequence


def knapsack_branch_and_bound(
    weights: Sequence[float], values: Sequence[float], capacity: float
) -> tuple[float, list[int]]:
    """(en iyi değer, seçilen eşya dizinleri artan). Ağırlıklar > 0, değerler ≥ 0."""
    if len(weights) != len(values):
        raise ValueError("ağırlık ve değer listeleri aynı uzunlukta olmalı")
    if any(w <= 0 for w in weights) or any(v < 0 for v in values) or capacity < 0:
        raise ValueError("ağırlıklar pozitif, değerler ve kapasite negatif olmamalı")
    order = sorted(range(len(weights)), key=lambda i: values[i] / weights[i], reverse=True)
    w = [weights[i] for i in order]
    v = [values[i] for i in order]
    n = len(w)

    def bound(level: int, value: float, room: float) -> float:
        """Kesirli gevşetme: level'dan itibaren açgözlü doldur, son eşyanın kesrini al."""
        for i in range(level, n):
            if w[i] <= room:
                room -= w[i]
                value += v[i]
            else:
                return value + v[i] * room / w[i]
        return value

    best_value: float = 0
    best_taken: tuple[int, ...] = ()
    heap: list[tuple[float, int, float, float, tuple[int, ...]]] = [
        (-bound(0, 0, capacity), 0, 0, capacity, ())
    ]  # (−sınır, düzey, değer, kalan yer, alınanlar) — en büyük sınır önce
    while heap:
        negative_bound, level, value, room, taken = heapq.heappop(heap)
        if -negative_bound <= best_value or level == n:
            continue  # bu dal en iyiyi geçemez (ya da yaprak)
        if w[level] <= room:  # dal 1: eşyayı al
            new_value = value + v[level]
            if new_value > best_value:
                best_value, best_taken = new_value, (*taken, level)
            upper = bound(level + 1, new_value, room - w[level])
            if upper > best_value:
                heapq.heappush(
                    heap, (-upper, level + 1, new_value, room - w[level], (*taken, level))
                )
        upper = bound(level + 1, value, room)  # dal 2: eşyayı alma
        if upper > best_value:
            heapq.heappush(heap, (-upper, level + 1, value, room, taken))
    return best_value, sorted(order[i] for i in best_taken)
