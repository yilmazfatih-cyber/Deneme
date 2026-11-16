"""Gezgin satıcı, kesin çözüm (Held-Karp): bit maskeli dinamik programlamayla en kısa tur.

Fikir:
    Tur 0. şehirden başlayıp 0'a döner. dp[S][j] = 0'dan çıkıp S kümesindeki şehirlerin hepsini
    birer kez gezerek j'de biten en kısa yol (j ∈ S, 0 ∉ S). Geçiş: dp[S ∪ {k}][k] =
    min(dp[S][j] + d[j][k]). Küme, bitleri şehirleri gösteren bir tam sayıdır (bit maskesi).
    Yanıt: min_j dp[tümü][j] + d[j][0]. Her durum için seçilen önceki şehir saklanır ve turun
    kendisi geriye doğru kurulur. Kaba kuvvetin (n−1)! permütasyonu yerine n²·2ⁿ işlem.
    Uzaklıklar simetrik olmak zorunda değildir.

Karmaşıklık: zaman O(n² · 2ⁿ); yer O(n · 2ⁿ) — Python'da pratik sınır n ≈ 15 (~10 sn)
Ne zaman: az sayıda durak (≤ 15) için kanıtlı en iyi tur (teslimat, gezi planı).
Ne zaman değil: daha çok şehirde `tsp_two_opt.py` gibi sezgiseller (en iyiyi garanti etmez).
Bağımlılık: yok
Genişletme: dönüşsüz yol (Hamilton yolu) için son adımdaki d[j][0] terimini çıkarın.

Örnek:
    >>> d = [[0, 2, 9, 10], [1, 0, 6, 4], [15, 7, 0, 8], [6, 3, 12, 0]]
    >>> held_karp(d)
    (21, [0, 2, 3, 1])
"""

from __future__ import annotations

import math
from collections.abc import Sequence


def held_karp(dist: Sequence[Sequence[float]]) -> tuple[float, list[int]]:
    """(tur uzunluğu, 0'dan başlayan şehir sırası — dönüş kenarı dahil değil)."""
    n = len(dist)
    if n <= 1:
        return 0, list(range(n))
    m = n - 1  # 1 … n−1 şehirleri; bit j ↔ şehir j+1
    full = 1 << m
    dp = [[math.inf] * m for _ in range(full)]
    previous = [[-1] * m for _ in range(full)]
    for j in range(m):
        dp[1 << j][j] = dist[0][j + 1]
    for mask in range(1, full):
        row = dp[mask]
        for j in range(m):
            if not (mask >> j) & 1 or row[j] == math.inf:
                continue
            base = row[j]
            for k in range(m):
                if (mask >> k) & 1:
                    continue
                nxt = mask | (1 << k)
                candidate = base + dist[j + 1][k + 1]
                if candidate < dp[nxt][k]:
                    dp[nxt][k] = candidate
                    previous[nxt][k] = j
    best, last = min((dp[full - 1][j] + dist[j + 1][0], j) for j in range(m))
    tour = []
    mask = full - 1
    while last != -1:
        tour.append(last + 1)
        last, mask = previous[mask][last], mask & ~(1 << last)
    return best, [0, *tour[::-1]]
