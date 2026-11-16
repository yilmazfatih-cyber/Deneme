"""Rezervuar örnekleme: uzunluğu bilinmeyen akıştan tek geçişte düzgün (ya da ağırlıklı) k örnek.

Fikir:
    Algoritma R: ilk k öğe rezervuara konur. i. öğe (0'dan sayılır, i ≥ k) geldiğinde [0, i]
    aralığından j seçilir; j < k ise rezervuarın j. yuvası bu öğeyle değiştirilir. Tümevarımla:
    her adımdan sonra görülen her öğenin rezervuarda olma olasılığı tam k/(i+1)'dir.
    Ağırlıklı (Efraimidis-Spirakis A-Res): her öğeye anahtar u^(1/w) verilir (u ∈ (0, 1) düzgün,
    w ağırlık); en büyük k anahtarlı öğeler tutulur (k'lık en küçük-yığın). Ağırlığı büyük öğenin
    anahtarı 1'e yakın olur ve daha sık seçilir; sonuç ağırlıklı, TEKRARSIZ bir örnektir.
    Akış bir kez okunur; bellek yalnız k öğedir.

Karmaşıklık: Algoritma R O(n) zaman, O(k) yer; ağırlıklı O(n log k) zaman, O(k) yer
Ne zaman: günlük akışından örnek, çok büyük dosyadan rastgele satırlar, dağıtık örnekleme.
Ne zaman değil: veri bellekteyse ve uzunluğu biliniyorsa `rng.sample` (ya da `fisher_yates.py`).
Bağımlılık: yok
Genişletme: çok uzun akışta "Algoritma L" atlama sayısını geometrik dağılımla hesaplayıp
    rastgele sayı çağrısını O(k log(n/k))'ye indirir.

Örnek:
    >>> import random
    >>> reservoir_sample(range(1000), 3, random.Random(1))
    [677, 127, 254]
    >>> rng, stream = random.Random(2), [("a", 1.0), ("c", 9.0)]
    >>> picks = [weighted_reservoir_sample(stream, 1, rng)[0] for _ in range(10_000)]
    >>> round(picks.count("c") / 10_000, 1)  # ağırlık payı 9/10
    0.9
"""

from __future__ import annotations

import heapq
import random
from collections.abc import Iterable
from typing import TypeVar

T = TypeVar("T")


def reservoir_sample(stream: Iterable[T], k: int, rng: random.Random) -> list[T]:
    """Akıştan düzgün rastgele k öğe (akış k'dan kısaysa hepsi)."""
    if k < 0:
        raise ValueError("k negatif olamaz")
    reservoir: list[T] = []
    for i, item in enumerate(stream):
        if i < k:
            reservoir.append(item)
        else:
            j = rng.randrange(i + 1)
            if j < k:
                reservoir[j] = item
    return reservoir


def weighted_reservoir_sample(
    stream: Iterable[tuple[T, float]], k: int, rng: random.Random
) -> list[T]:
    """(öğe, ağırlık > 0) akışından ağırlıkla orantılı, tekrarsız k öğe (büyük anahtar önce)."""
    if k < 0:
        raise ValueError("k negatif olamaz")
    heap: list[tuple[float, int, T]] = []  # (anahtar, sıra no, öğe): en küçük anahtar tepede
    for index, (item, weight) in enumerate(stream):
        if weight <= 0:
            raise ValueError(f"ağırlık pozitif olmalı: {item!r} → {weight}")
        u = rng.random() or 1e-300  # u = 0 olursa anahtar 0 olurdu
        key = u ** (1.0 / weight)
        if len(heap) < k:
            heapq.heappush(heap, (key, index, item))
        elif heap and key > heap[0][0]:
            heapq.heapreplace(heap, (key, index, item))
    return [item for _, _, item in sorted(heap, reverse=True)]
