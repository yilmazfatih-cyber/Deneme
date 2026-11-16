"""En sık k öğe: kesin sayım (sözlük + yığın) ve akış için Misra-Gries "ağır vuruşlar" özeti.

Fikir:
    Kesin: öğeler bir sözlükte sayılır (O(n)), sonra k boyutlu bir yığınla en büyük k sayaç seçilir
    (O(m log k), m farklı öğe). Eşit sayıda belirlenimci olmak için öğenin kendisine bakılır.
    Akış (Misra-Gries): yalnız k − 1 sayaç tutulur. Gelen öğenin sayacı varsa artırılır; boş yer
    varsa sayaç açılır; ikisi de yoksa TÜM sayaçlar 1 azaltılır (sıfırlananlar silinir). Sonuç:
    n öğelik akışta n/k'dan fazla geçen her öğe özetin içindedir ve sayacı gerçek sayıdan en
    çok n/k eksiktir. Bellek, farklı öğe sayısından bağımsız O(k)'dır.

Karmaşıklık: kesin O(n + m log k) zaman, O(m) yer; Misra-Gries O(n · k) en kötü (sayaç azaltma),
    O(k) yer
Ne zaman: en çok satan ürünler, en sık aranan kelimeler; çok büyük akışta ağır vuruşları bulmak.
Ne zaman değil: yaklaşık SAYI (sıklık tahmini) gerekiyorsa `count_min_sketch.py`; veri küçükse
    `Counter.most_common(k)` yeter.
Bağımlılık: yok
Genişletme: Misra-Gries'in adaylarını kesinleştirmek için akışı ikinci kez okuyup yalnız adayları
    sayın.

Örnek:
    >>> top_k_frequent("elma armut elma kiraz armut elma".split(), 2)
    [('elma', 3), ('armut', 2)]
    >>> summary = misra_gries("aabacadaeaf", 3)
    >>> "a" in summary, summary["a"] <= 6
    (True, True)
"""

from __future__ import annotations

import heapq
from collections import Counter
from collections.abc import Hashable, Iterable
from typing import Any, Protocol, TypeVar


class _SortableHashable(Hashable, Protocol):
    def __lt__(self, other: Any, /) -> bool: ...


T = TypeVar("T", bound=_SortableHashable)
H = TypeVar("H", bound=Hashable)


def top_k_frequent(items: Iterable[T], k: int) -> list[tuple[T, int]]:
    """En sık k öğe ve sayıları; sayı azalan, eşitlikte öğe artan sırada."""
    if k < 0:
        raise ValueError("k negatif olamaz")
    counts = Counter(items)
    best = heapq.nsmallest(k, counts.items(), key=lambda pair: (-pair[1], pair[0]))
    return [(item, count) for item, count in best]


def misra_gries(stream: Iterable[H], k: int) -> dict[H, int]:
    """En çok k − 1 sayaçlı özet: n/k'dan sık her öğe içinde; sayaçlar ≤ n/k eksik sayar."""
    if k < 2:
        raise ValueError("k en az 2 olmalı")
    counters: dict[H, int] = {}
    for item in stream:
        if item in counters:
            counters[item] += 1
        elif len(counters) < k - 1:
            counters[item] = 1
        else:
            for key in list(counters):  # herkesi 1 azalt
                counters[key] -= 1
                if counters[key] == 0:
                    del counters[key]
    return counters
