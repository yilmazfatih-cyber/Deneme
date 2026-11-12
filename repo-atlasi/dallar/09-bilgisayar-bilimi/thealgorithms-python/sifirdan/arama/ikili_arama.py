"""
İkili arama: sıralı bir dizide aranan değeri, her adımda arama aralığını
yarıya indirerek bulur.

Kaynak: https://en.wikipedia.org/wiki/Binary_search_algorithm

Karmaşıklık: zaman O(log n), ek bellek O(1). Girdinin sıralı olup olmadığını
denetlemek O(n) sürer; bu yüzden denetim isteğe bağlıdır (`dogrula`).
"""

from collections.abc import Sequence
from itertools import pairwise


def sol_sinir(sirali_dizi: Sequence[int], aranan: int) -> int:
    """
    `aranan` değerinden büyük ya da ona eşit ilk elemanın indeksini döndürür.
    Sözleşme standart kütüphanedeki `bisect.bisect_left` ile aynıdır.

    >>> sol_sinir([1, 3, 3, 7], 3)
    1
    >>> sol_sinir([1, 3, 3, 7], 4)
    3
    >>> sol_sinir([1, 3, 3, 7], 99)
    4
    >>> sol_sinir([], 5)
    0
    """
    alt, ust = 0, len(sirali_dizi)
    while alt < ust:
        # (alt + ust) // 2 Python'da taşmaz; C/Java'da alt + (ust - alt) // 2 yazılır.
        orta = (alt + ust) // 2
        if sirali_dizi[orta] < aranan:
            alt = orta + 1
        else:
            ust = orta
    return alt


def ikili_arama(sirali_dizi: Sequence[int], aranan: int, dogrula: bool = True) -> int:
    """
    Aranan değerin (ilk geçtiği yerin) indeksini döndürür; değer yoksa -1.

    >>> ikili_arama([2, 4, 8, 16, 32], 16)
    3
    >>> ikili_arama([2, 4, 8, 16, 32], 5)
    -1
    >>> ikili_arama([5, 5, 5], 5)
    0
    >>> ikili_arama([], 1)
    -1
    >>> ikili_arama([3, 1, 2], 1)
    Traceback (most recent call last):
        ...
    ValueError: dizi küçükten büyüğe sıralı olmalı
    """
    if dogrula and any(onceki > sonraki for onceki, sonraki in pairwise(sirali_dizi)):
        raise ValueError("dizi küçükten büyüğe sıralı olmalı")
    indeks = sol_sinir(sirali_dizi, aranan)
    if indeks < len(sirali_dizi) and sirali_dizi[indeks] == aranan:
        return indeks
    return -1


if __name__ == "__main__":
    import doctest

    doctest.testmod()
