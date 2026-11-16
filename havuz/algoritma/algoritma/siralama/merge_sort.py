"""Birleştirmeli sıralama: sıralı parçaları birleştirerek O(n log n) sıralar; ters çevrim sayar.

Fikir:
    İki sıralı listeyi birleştirmek doğrusal zamanda yapılır: iki başı karşılaştır, küçüğü al.
    Aşağıdan yukarı sürümde önce 1'lik parçalar 2'lik, sonra 2'likler 4'lük… birleştirilir;
    log n tur, her tur O(n). Özyineleme yoktur, yığın taşmaz. Eşitlikte SOL parçadan alındığı
    için kararlıdır. Aynı birleştirme adımı ters çevrimleri (i < j ve a[i] > a[j]) de sayar:
    sağdan bir öğe alındığında soldaki kalan öğelerin hepsi ondan büyüktür.

Karmaşıklık: zaman her durumda O(n log n); ek yer O(n)
Kararlılık: kararlı
Ne zaman: kararlılık + en kötü durum güvencesi gerektiğinde; bağlı listeler; dış sıralama;
    ters çevrim sayısı (iki sıralamanın ne kadar farklı olduğu) gerektiğinde.
Ne zaman değil: bellek çok kısıtlıysa yerinde `heap_sort.py`; gerçek kodda `sorted()`.
Bağımlılık: yok
Genişletme: küçük parçaları (≤ 32) önce eklemeli sıralamayla sıralamak sabit maliyeti düşürür.

Örnek:
    >>> merge_sort([38, 27, 43, 3, 9, 82, 10])
    [3, 9, 10, 27, 38, 43, 82]
    >>> count_inversions([2, 4, 1, 3, 5])
    3
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any, TypeVar

T = TypeVar("T")


def _identity(value: Any) -> Any:
    return value


def _sorted_order(keys: Sequence[Any]) -> tuple[list[int], int]:
    """(anahtarları sıralayan dizin listesi, ters çevrim sayısı)."""
    n = len(keys)
    order = list(range(n))
    buffer = [0] * n
    inversions = 0
    width = 1
    while width < n:
        for lo in range(0, n, 2 * width):
            mid, hi = min(lo + width, n), min(lo + 2 * width, n)
            i, j, k = lo, mid, lo
            while i < mid and j < hi:
                if keys[order[j]] < keys[order[i]]:  # sağdaki KESİN küçükse sağdan al
                    buffer[k] = order[j]
                    inversions += mid - i  # soldaki kalan her öğe bununla ters çevrim oluşturur
                    j += 1
                else:
                    buffer[k] = order[i]
                    i += 1
                k += 1
            buffer[k:hi] = order[i:mid] + order[j:hi]  # biri boştur
        order, buffer = buffer, order
        width *= 2
    return order, inversions


def merge_sort(items: Sequence[T], key: Callable[[T], Any] | None = None) -> list[T]:
    """Yeni, sıralı bir liste döndürür (kararlı)."""
    get_key = key if key is not None else _identity
    order, _ = _sorted_order([get_key(item) for item in items])
    return [items[i] for i in order]


def count_inversions(items: Sequence[Any]) -> int:
    """i < j ve items[i] > items[j] olan çiftlerin sayısı, O(n log n)."""
    return _sorted_order(items)[1]
