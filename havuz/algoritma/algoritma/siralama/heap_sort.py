"""Yığın sıralaması: diziyi yerinde en büyük yığına çevirir, sonra kökü tek tek sona taşır.

Fikir:
    Önce dizi O(n)'de en büyük yığına (max-heap) dönüştürülür (sondan başa aşağı kaydırma).
    Sonra tekrar tekrar: kök (en büyük) dizinin sonundaki yuvayla yer değiştirir, yığın bir
    küçülür ve yeni kök aşağı kaydırılarak yığın kuralı onarılır. Dizinin sonu böylece büyükten
    küçüğe dolar. Ek bellek kullanmaz ve en kötü durumda da O(n log n)'dir.

Karmaşıklık: zaman her durumda O(n log n); ek yer O(1) (yerinde)
Kararlılık: kararlı DEĞİL
Ne zaman: bellek sıkıntısı + en kötü durum güvencesi birlikte gerekiyorsa (gömülü sistemler,
    introsort'un yedek planı).
Ne zaman değil: pratikte hızlı sıralamadan yavaştır (önbellek dostu değil); kararlılık gerekiyorsa
    `merge_sort.py`.
Bağımlılık: yok
Genişletme: yalnız en büyük k öğe gerekiyorsa döngüyü k adımda durdurun (kısmi sıralama).

Örnek:
    >>> heap_sort([12, 11, 13, 5, 6, 7])
    [5, 6, 7, 11, 12, 13]
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Protocol, TypeVar


class _Comparable(Protocol):
    def __lt__(self, other: Any, /) -> bool: ...


T = TypeVar("T", bound=_Comparable)


def _sift_down(a: list[T], root: int, end: int) -> None:
    """a[0:end] en büyük yığınında `root` düğümünü yerine indirir."""
    while True:
        child = 2 * root + 1
        if child >= end:
            return
        if child + 1 < end and a[child] < a[child + 1]:
            child += 1
        if not a[root] < a[child]:
            return
        a[root], a[child] = a[child], a[root]
        root = child


def heap_sort(items: Sequence[T]) -> list[T]:
    """Yeni, sıralı bir liste döndürür (içeride yerinde çalışır)."""
    a = list(items)
    n = len(a)
    for start in range(n // 2 - 1, -1, -1):
        _sift_down(a, start, n)
    for end in range(n - 1, 0, -1):
        a[0], a[end] = a[end], a[0]
        _sift_down(a, 0, end)
    return a
