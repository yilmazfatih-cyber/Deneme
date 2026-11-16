"""Kutu paketleme sezgiselleri: eşyaları en az sayıda sabit kapasiteli kutuya yerleştirme.

Fikir:
    En az kutu sayısını bulmak NP-zordur; hızlı ve kanıtlı yakın sonuç veren sezgiseller:
      * İlk uyan (First Fit): eşyayı sığdığı İLK kutuya koy, sığmazsa yeni kutu aç.
      * En iyi uyan (Best Fit): sığdığı kutular arasında EN AZ boşluk bırakana koy.
      * Azalan ilk uyan (FFD): önce büyükten küçüğe sırala, sonra İlk uyan; kanıtlı sınır
        FFD ≤ (11/9)·OPT + 6/9 (büyükler önce yerleşir, boşlukları küçükler doldurur).
    Alt sınır: ⌈toplam boyut / kapasite⌉ kutudan azı olanaksızdır. Okunaklılık için kutular
    doğrusal taranır (O(n · kutu)); büyük girdide kalan kapasiteye göre dengeli ağaç kullanın.

Karmaşıklık: First/Best Fit O(n · b) (b = kutu sayısı); FFD O(n log n + n · b); yer O(n)
Ne zaman: kamyon/konteyner yükleme, depolama, sanal makine yerleştirme, dosyaları disklere bölme.
Ne zaman değil: kanıtlı en iyi gerekiyorsa ve n küçükse kesin arama (dal-sınır / ILP).
Bağımlılık: yok
Genişletme: çok boyutlu (ağırlık + hacim) için "sığar mı" denetimini her boyutta yapın.

Örnek:
    >>> sizes = [4, 8, 1, 4, 2, 1]
    >>> first_fit(sizes, 10), first_fit_decreasing(sizes, 10), lower_bound_bins(sizes, 10)
    ([[0, 2, 3, 5], [1, 4]], [[1, 4], [0, 3, 2, 5]], 2)
"""

from __future__ import annotations

import math
from collections.abc import Sequence


def _check(sizes: Sequence[float], capacity: float) -> None:
    if capacity <= 0:
        raise ValueError("kapasite pozitif olmalı")
    for i, size in enumerate(sizes):
        if not 0 < size <= capacity:
            raise ValueError(f"{i}. eşyanın boyutu ({size}) 0 ile kapasite arasında olmalı")


def first_fit(sizes: Sequence[float], capacity: float) -> list[list[int]]:
    """Her eşya sığdığı ilk kutuya; kutular eşya dizinlerinin listesi."""
    _check(sizes, capacity)
    bins: list[list[int]] = []
    room: list[float] = []
    for i, size in enumerate(sizes):
        for b in range(len(bins)):
            if size <= room[b]:
                bins[b].append(i)
                room[b] -= size
                break
        else:
            bins.append([i])
            room.append(capacity - size)
    return bins


def best_fit(sizes: Sequence[float], capacity: float) -> list[list[int]]:
    """Her eşya, sığdığı kutular içinde en az boşluk bırakana."""
    _check(sizes, capacity)
    bins: list[list[int]] = []
    room: list[float] = []
    for i, size in enumerate(sizes):
        candidates = [b for b in range(len(bins)) if size <= room[b]]
        if candidates:
            b = min(candidates, key=lambda k: (room[k] - size, k))
            bins[b].append(i)
            room[b] -= size
        else:
            bins.append([i])
            room.append(capacity - size)
    return bins


def first_fit_decreasing(sizes: Sequence[float], capacity: float) -> list[list[int]]:
    """Büyükten küçüğe sıralayıp ilk uyan; dizinler özgün listeye göredir."""
    order = sorted(range(len(sizes)), key=lambda i: (-sizes[i], i))
    packed = first_fit([sizes[i] for i in order], capacity)
    return [[order[k] for k in box] for box in packed]


def lower_bound_bins(sizes: Sequence[float], capacity: float) -> int:
    """Gereken kutu sayısı için alt sınır: ⌈Σ boyut / kapasite⌉."""
    _check(sizes, capacity)
    return math.ceil(sum(sizes) / capacity)
