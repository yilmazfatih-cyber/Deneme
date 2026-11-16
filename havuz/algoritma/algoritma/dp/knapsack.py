"""Sırt çantası: 0/1, sınırsız ve sınırlı sürümler; en iyi değer + hangi eşyadan kaç tane.

Fikir:
    best[c] = c kapasiteyle elde edilebilecek en büyük değer.
      0/1: eşyalar sırayla; best[c] = max(best[c], best[c − w_i] + v_i), c BÜYÜKTEN küçüğe
          (eşya bir kez kullanılsın). Alınma kararı tabloda tutulur, sondan başa geri izlenir.
      Sınırsız: c küçükten büyüğe; her c için son eklenen eşya saklanır, c'den geri yürünür.
      Sınırlı (en çok k_i adet): k_i, 1, 2, 4, … ve kalan büyüklüğünde paketlere bölünür (ikili
          bölme); her paket bir 0/1 eşyasıdır ve 0 … k_i'nin her değeri bir alt toplamdır.
    Ağırlıklar ve kapasite negatif olmayan TAM SAYI olmalıdır (tablo kapasiteyle dizinlenir).

Karmaşıklık: 0/1 ve sınırsız O(n · C); sınırlı O(C · Σ log k_i); yer O(n · C) (geri izleme için)
Ne zaman: bütçe/kapasite altında değer en büyükleme (yatırım seçimi, yük planlama, kesme stoku).
Ne zaman değil: kapasite çok büyükse (≫ 10⁷) tablo sığmaz; dal-sınır
    (`algoritma/eniyileme/branch_and_bound.py`) ya da değere göre DP kullanın.
Bağımlılık: yok
Genişletme: "tam olarak C'yi doldur" için best'i −∞ ile başlatıp yalnız best[0] = 0 yapın.

Örnek:
    >>> knapsack_01([1, 3, 4, 5], [1, 4, 5, 7], 7)
    (9, [1, 2])
    >>> knapsack_unbounded([2, 3], [3, 5], 7), knapsack_bounded([2, 3], [3, 5], [3, 1], 7)
    ((11, [2, 1]), (11, [2, 1]))
"""

from __future__ import annotations

from collections.abc import Sequence


def _check(weights: Sequence[int], values: Sequence[float], capacity: int) -> None:
    if len(weights) != len(values):
        raise ValueError("ağırlık ve değer listeleri aynı uzunlukta olmalı")
    if capacity < 0 or any(w < 0 for w in weights):
        raise ValueError("kapasite ve ağırlıklar negatif olmayan tam sayı olmalı")


def knapsack_01(
    weights: Sequence[int], values: Sequence[float], capacity: int
) -> tuple[float, list[int]]:
    """(en iyi değer, seçilen eşyaların dizinleri — artan sırada)."""
    _check(weights, values, capacity)
    best: list[float] = [0] * (capacity + 1)
    took = [[False] * (capacity + 1) for _ in weights]
    for i, (w, v) in enumerate(zip(weights, values)):
        for c in range(capacity, w - 1, -1):  # büyükten küçüğe: eşya bu turda bir kez kullanılır
            if best[c - w] + v > best[c]:
                best[c] = best[c - w] + v
                took[i][c] = True
    chosen = []
    c = capacity
    for i in range(len(weights) - 1, -1, -1):
        if took[i][c]:
            chosen.append(i)
            c -= weights[i]
    return best[capacity], chosen[::-1]


def knapsack_unbounded(
    weights: Sequence[int], values: Sequence[float], capacity: int
) -> tuple[float, list[int]]:
    """(en iyi değer, her eşyadan kaç tane alındığı)."""
    _check(weights, values, capacity)
    best: list[float] = [0] * (capacity + 1)
    last = [-1] * (capacity + 1)  # bu kapasitede en son eklenen eşya
    for c in range(1, capacity + 1):
        for i, (w, v) in enumerate(zip(weights, values)):
            if 0 < w <= c and best[c - w] + v > best[c]:
                best[c] = best[c - w] + v
                last[c] = i
    counts = [0] * len(weights)
    c = capacity
    while c > 0:
        if last[c] == -1:  # bu kapasite tam dolmuyor; bir eksiğe bak
            c -= 1
            continue
        counts[last[c]] += 1
        c -= weights[last[c]]
    return best[capacity], counts


def knapsack_bounded(
    weights: Sequence[int], values: Sequence[float], limits: Sequence[int], capacity: int
) -> tuple[float, list[int]]:
    """(en iyi değer, her eşyadan kaç tane); i. eşyadan en çok limits[i] tane."""
    if len(limits) != len(weights):
        raise ValueError("limit listesi eşya sayısıyla aynı uzunlukta olmalı")
    packs: list[tuple[int, int]] = []  # (özgün eşya, paketteki adet)
    for i, limit in enumerate(limits):
        size = 1
        while limit > 0:
            take = min(size, limit)
            packs.append((i, take))
            limit -= take
            size *= 2
    best, chosen = knapsack_01(
        [weights[i] * k for i, k in packs], [values[i] * k for i, k in packs], capacity
    )
    counts = [0] * len(weights)
    for p in chosen:
        counts[packs[p][0]] += packs[p][1]
    return best, counts
