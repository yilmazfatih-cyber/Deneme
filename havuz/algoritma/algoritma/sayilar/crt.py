"""Çin kalan teoremi: x ≡ r_i (mod m_i) denklemlerinin ortak çözümü (aralarında asal olmasa da).

Fikir:
    Denklemler ikişer ikişer birleştirilir. x ≡ r1 (mod m1) ise x = r1 + m1·t. İkinci denkleme
    koyunca m1·t ≡ r2 − r1 (mod m2) olur. g = ebob(m1, m2) olsun: g, (r2 − r1)'i bölmüyorsa
    çözüm YOKTUR. Bölüyorsa her şey g'ye bölünür ve t, (m1/g)'nin mod (m2/g) tersiyle bulunur.
    Birleşik denklem x ≡ r1 + m1·t (mod ekok(m1, m2)) olur. Tüm denklemler bu şekilde katlanır.
    Modüller aralarında asalsa her adım çözülebilir ve sonuç tek türlüdür (mod çarpım).

Karmaşıklık: zaman O(k · log M) (k denklem, M modüllerin ekoku); yer O(1)
Ne zaman: takvim/çevrim hizalama ("hangi gün iki dönem birden başlar"), büyük sayıları küçük
    modüllerde hesaplayıp birleştirme (NTT ile çok modüllü çarpım), bulmacalar.
Ne zaman değil: tek denklem için doğrudan `x % m`.
Bağımlılık: yok
Genişletme: k çok büyükse ve modüller aralarında asalsa Garner algoritması aynı işi taşmasız yapar.

Örnek:
    >>> crt([2, 3, 2], [3, 5, 7])
    (23, 105)
    >>> crt([1, 2], [4, 6]) is None, crt([3, 1], [4, 6])
    (True, (7, 12))
"""

from __future__ import annotations

from collections.abc import Sequence


def _extended_gcd(a: int, b: int) -> tuple[int, int]:
    """(g, x): a·x ≡ g (mod b), g = ebob(a, b)."""
    old_r, r, old_x, x = a, b, 1, 0
    while r:
        q = old_r // r
        old_r, r = r, old_r - q * r
        old_x, x = x, old_x - q * x
    return old_r, old_x


def crt(remainders: Sequence[int], moduli: Sequence[int]) -> tuple[int, int] | None:
    """(x, M): tüm denklemleri sağlayan en küçük x ≥ 0 ve çözüm periyodu M; çözüm yoksa None."""
    if len(remainders) != len(moduli):
        raise ValueError("kalan ve modül listeleri aynı uzunlukta olmalı")
    if any(m <= 0 for m in moduli):
        raise ValueError("modüller pozitif olmalı")
    x, period = 0, 1
    for r, m in zip(remainders, moduli):
        g, inverse = _extended_gcd(period % m, m)  # period · inverse ≡ g (mod m)
        difference = (r - x) % m
        if difference % g:
            return None  # ebob farkı bölmüyor: çelişkili denklemler
        step = m // g
        t = (difference // g) * inverse % step
        x += period * t
        period *= step  # = ekok(period, m)
        x %= period
    return x, period
