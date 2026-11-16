"""Hızlı sıralama (üç yollu): rastgele pivot, "küçük | eşit | büyük" bölümleme, yığın taşmaz.

Fikir:
    Bir pivot seçilir; dizi tek geçişte üç bölgeye ayrılır: pivottan küçükler, eşitler, büyükler
    (Dijkstra'nın "Hollanda bayrağı" bölümlemesi). Eşitler zaten yerindedir; yalnız küçükler ve
    büyükler sıralanmaya devam eder. Üç yollu bölümleme, çok yinelenen değerli dizilerde iki
    yollunun O(n²)'ye düşmesini önler. Pivot rastgele seçildiği için sıralı girdi de kötü durum
    üretmez. Özyineleme yerine açık yığın: büyük parça yığına itilir, küçük parçayla devam
    edilir; böylece yığın en çok log2 n derinliğe ulaşır.

Karmaşıklık: zaman beklenen O(n log n), en kötü O(n²) (olasılığı ihmal edilebilir); ek yer O(log n)
Kararlılık: kararlı DEĞİL (bölümleme eşit anahtarların sırasını bozar)
Ne zaman: genel amaçlı yerinde sıralama; önbellek dostu olduğundan pratikte çok hızlıdır.
Ne zaman değil: kararlılık gerekiyorsa `merge_sort.py`; en kötü durum güvencesi gerekiyorsa
    `heap_sort.py`. Gerçek Python kodunda `sorted()` / `list.sort()`.
Bağımlılık: yok
Genişletme: introsort için derinlik 2·log2 n'yi aşınca o parçayı `heap_sort` ile sıralayın.

Örnek:
    >>> import random
    >>> quick_sort([3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5], rng=random.Random(0))
    [1, 1, 2, 3, 3, 4, 5, 5, 5, 6, 9]
"""

from __future__ import annotations

import random
from collections.abc import Sequence
from typing import Any, Protocol, TypeVar


class _Comparable(Protocol):
    def __lt__(self, other: Any, /) -> bool: ...


T = TypeVar("T", bound=_Comparable)


def partition3(a: list[T], lo: int, hi: int, pivot: T) -> tuple[int, int]:
    """a[lo..hi] (iki uç dahil) bölgesini bölümler; (lt, gt) döndürür:
    a[lo:lt] < pivot, a[lt:gt+1] == pivot, a[gt+1:hi+1] > pivot."""
    lt, i, gt = lo, lo, hi
    while i <= gt:
        if a[i] < pivot:
            a[lt], a[i] = a[i], a[lt]
            lt += 1
            i += 1
        elif pivot < a[i]:
            a[i], a[gt] = a[gt], a[i]
            gt -= 1
        else:
            i += 1
    return lt, gt


def quick_sort(items: Sequence[T], rng: random.Random | None = None) -> list[T]:
    """Yeni, sıralı bir liste döndürür."""
    rng = rng if rng is not None else random.Random(0)
    a = list(items)
    stack = [(0, len(a) - 1)]
    while stack:
        lo, hi = stack.pop()
        while lo < hi:
            lt, gt = partition3(a, lo, hi, a[rng.randint(lo, hi)])
            if lt - lo < hi - gt:  # sol küçük: sağı sonraya bırak, solla devam et
                stack.append((gt + 1, hi))
                hi = lt - 1
            else:
                stack.append((lo, lt - 1))
                lo = gt + 1
    return a
