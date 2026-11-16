"""Eratosthenes eleği (+ en küçük asal çarpan) ve parçalı elek: bir aralıktaki tüm asallar.

Fikir:
    Elek: 2'den √n'ye her asal p için p², p²+p, p²+2p … işaretlenir (p'den küçük çarpanlı
    katlar zaten daha önce işaretlendi; bu yüzden p²'den başlanır). İşaretlenmeyenler asaldır.
    Aynı döngüde her sayının EN KÜÇÜK asal çarpanı kaydedilirse, n'ye kadar her sayı bu tabloyla
    O(log n)'de çarpanlarına ayrılır.
    Parçalı elek: [lo, hi) aralığı çok uzaktaysa (ör. 10¹² civarı) baştan elemek bellek tüketir.
    Önce √hi'ye kadar asallar bulunur; sonra yalnız [lo, hi) uzunluğunda bir dizi tutulur ve her
    taban asalın aralıktaki ilk katından başlanarak elenir. Bellek O(√hi + (hi − lo)).

Karmaşıklık: elek O(n log log n) zaman, O(n) yer; parçalı elek O((hi − lo) log log hi + √hi)
Ne zaman: n ≲ 10⁷'ye kadar tüm asallar; çok sayıda küçük sayıyı çarpanlarına ayırma;
    büyük bir aralıktaki asallar (parçalı).
Ne zaman değil: tek bir büyük sayının asallığı için `miller_rabin.py`.
Bağımlılık: yok
Genişletme: bellek için yalnız tek sayıları tutan elek (yarı bellek) ya da bytearray yerine bit
    dizisi.

Örnek:
    >>> primes_up_to(30)
    [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]
    >>> [p - 10**9 for p in segmented_primes(10**9, 10**9 + 100)]
    [7, 9, 21, 33, 87, 93, 97]
    >>> factorize_with_spf(360, smallest_prime_factors(400))
    [2, 2, 2, 3, 3, 5]
"""

from __future__ import annotations

import math


def primes_up_to(n: int) -> list[int]:
    """n'ye kadar (n dahil) tüm asallar."""
    if n < 2:
        return []
    is_composite = bytearray(n + 1)
    for p in range(2, math.isqrt(n) + 1):
        if not is_composite[p]:
            is_composite[p * p :: p] = b"\x01" * len(range(p * p, n + 1, p))
    return [i for i in range(2, n + 1) if not is_composite[i]]


def smallest_prime_factors(n: int) -> list[int]:
    """spf[i] = i'nin en küçük asal çarpanı (spf[0] = spf[1] = 0)."""
    spf = list(range(n + 1))
    for i in range(min(n + 1, 2)):
        spf[i] = 0
    for p in range(2, math.isqrt(n) + 1):
        if spf[p] == p:  # p asal
            for multiple in range(p * p, n + 1, p):
                if spf[multiple] == multiple:
                    spf[multiple] = p
    return spf


def factorize_with_spf(x: int, spf: list[int]) -> list[int]:
    """spf tablosuyla x'in asal çarpanları (artan, tekrarlı). x ≤ len(spf) − 1 olmalı."""
    if x < 1 or x >= len(spf):
        raise ValueError(f"x, 1 ile {len(spf) - 1} arasında olmalı")
    factors = []
    while x > 1:
        factors.append(spf[x])
        x //= spf[x]
    return factors


def segmented_primes(lo: int, hi: int) -> list[int]:
    """[lo, hi) aralığındaki asallar; bellek O(√hi + (hi − lo))."""
    lo = max(lo, 2)
    if hi <= lo:
        return []
    is_composite = bytearray(hi - lo)
    for p in primes_up_to(math.isqrt(hi - 1)):
        start = max(p * p, (lo + p - 1) // p * p)  # aralıktaki ilk kat (p²'den küçük olmayan)
        is_composite[start - lo :: p] = b"\x01" * len(range(start, hi, p))
    return [lo + i for i, flag in enumerate(is_composite) if not flag]
