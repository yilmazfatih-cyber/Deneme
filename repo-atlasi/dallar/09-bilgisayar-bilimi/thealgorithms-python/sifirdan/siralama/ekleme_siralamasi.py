"""
Ekleme sıralaması (insertion sort): soldaki sıralı bölgeye her adımda bir
eleman daha "ekler"; elemanı kendinden büyükleri sağa kaydırarak yerine koyar.

Kaynak: https://en.wikipedia.org/wiki/Insertion_sort

Karmaşıklık: en kötü ve ortalama O(n^2), neredeyse sıralı girdide O(n).
Küçük dizilerde hızlıdır; Python'un Timsort'u kısa parçalarda benzer bir
yöntem (ikili ekleme) kullanır.
"""

from typing import Any


def ekleme_siralamasi(dizi: list[Any]) -> list[Any]:
    """
    Listenin sıralı bir kopyasını döndürür; kararlıdır.

    >>> ekleme_siralamasi([4, 3, 2, 10, 12, 1, 5, 6])
    [1, 2, 3, 4, 5, 6, 10, 12]
    >>> ekleme_siralamasi([-1.5, -2, 0])
    [-2, -1.5, 0]
    >>> ekleme_siralamasi([1])
    [1]
    >>> ekleme_siralamasi(None)
    Traceback (most recent call last):
        ...
    TypeError: liste bekleniyordu, NoneType verildi
    """
    if not isinstance(dizi, list):
        raise TypeError(f"liste bekleniyordu, {type(dizi).__name__} verildi")
    sonuc = list(dizi)
    for i in range(1, len(sonuc)):
        eleman = sonuc[i]
        j = i - 1
        # Kesin büyükleri kaydırıyoruz; eşitler yerinde kalır, böylece sıralama kararlı olur.
        while j >= 0 and sonuc[j] > eleman:
            sonuc[j + 1] = sonuc[j]
            j -= 1
        sonuc[j + 1] = eleman
    return sonuc


if __name__ == "__main__":
    import doctest

    doctest.testmod()
