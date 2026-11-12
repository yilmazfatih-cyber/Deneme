"""
Birleştirme sıralaması (merge sort): diziyi ikiye böler, iki yarıyı ayrı ayrı
sıralar, sonra sıralı iki yarıyı tek geçişte birleştirir. "Böl ve yönet"
paradigmasının klasik örneğidir.

Kaynak: https://en.wikipedia.org/wiki/Merge_sort

Karmaşıklık: her durumda O(n log n) zaman, O(n) ek bellek. Kararlıdır: eşit
anahtarlı elemanların göreli sırası korunur.
"""

from typing import Any


def birlestir(sol: list[Any], sag: list[Any]) -> list[Any]:
    """
    Sıralı iki listeyi tek bir sıralı listede birleştirir.

    >>> birlestir([1, 4, 9], [2, 3, 10])
    [1, 2, 3, 4, 9, 10]
    >>> birlestir([], [7])
    [7]
    """
    sonuc: list[Any] = []
    i = j = 0
    while i < len(sol) and j < len(sag):
        # "<=" kararlılığı sağlar: eşitlikte soldaki (önce gelen) eleman önce yazılır.
        if sol[i] <= sag[j]:
            sonuc.append(sol[i])
            i += 1
        else:
            sonuc.append(sag[j])
            j += 1
    sonuc.extend(sol[i:])
    sonuc.extend(sag[j:])
    return sonuc


def birlestirme_siralamasi(dizi: list[Any]) -> list[Any]:
    """
    Listenin sıralı bir kopyasını döndürür; girdiyi değiştirmez.

    >>> birlestirme_siralamasi([5, 2, 9, 1, 5, 6])
    [1, 2, 5, 5, 6, 9]
    >>> birlestirme_siralamasi(["elma", "Armut", "çilek"])
    ['Armut', 'elma', 'çilek']
    >>> birlestirme_siralamasi([])
    []
    >>> birlestirme_siralamasi("cba")
    Traceback (most recent call last):
        ...
    TypeError: liste bekleniyordu, str verildi
    """
    if not isinstance(dizi, list):
        raise TypeError(f"liste bekleniyordu, {type(dizi).__name__} verildi")
    if len(dizi) <= 1:
        return list(dizi)
    orta = len(dizi) // 2
    return birlestir(birlestirme_siralamasi(dizi[:orta]), birlestirme_siralamasi(dizi[orta:]))


if __name__ == "__main__":
    import doctest

    doctest.testmod()
