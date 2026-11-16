"""EBOB ve genişletilmiş Öklid: en büyük ortak bölen ve a·x + b·y = ebob(a, b) katsayıları.

Fikir:
    Öklid: ebob(a, b) = ebob(b, a mod b); b = 0 olunca yanıt a. Her iki adımda sayılar en az
    yarıya indiğinden adım sayısı O(log min(a, b)).
    Genişletilmiş Öklid aynı adımlarda x, y katsayılarını da taşır: her kalan r_i için
    r_i = a·x_i + b·y_i ilişkisi korunur; son sıfırdan önceki kalan ebob'dur ve katsayıları
    yanıttır (Bézout özdeşliği). Bu, modüler tersin (a·x ≡ 1 mod m) ve Çin kalan teoreminin
    temelidir.
    Döngüyle yazıldı (özyineleme yok). Negatif sayılarda ebob her zaman ≥ 0 döner.

Karmaşıklık: zaman O(log min(|a|, |b|)) aritmetik işlem; yer O(1)
Ne zaman: kesir sadeleştirme, modüler ters, doğrusal Diofant denklemleri (a·x + b·y = c).
Ne zaman değil: yalnız ebob gerekiyorsa `math.gcd` (C ile yazılmış) daha hızlıdır.
Bağımlılık: yok
Genişletme: a·x + b·y = c'nin çözümü ancak ebob | c ise vardır: (x, y) · (c / ebob).

Örnek:
    >>> gcd(84, 36), lcm(4, 6), extended_gcd(240, 46)
    (12, 12, (2, -9, 47))
"""

from __future__ import annotations


def gcd(a: int, b: int) -> int:
    """En büyük ortak bölen (≥ 0); gcd(0, 0) = 0."""
    a, b = abs(a), abs(b)
    while b:
        a, b = b, a % b
    return a


def lcm(a: int, b: int) -> int:
    """En küçük ortak kat (≥ 0); biri 0 ise 0."""
    if a == 0 or b == 0:
        return 0
    return abs(a // gcd(a, b) * b)


def extended_gcd(a: int, b: int) -> tuple[int, int, int]:
    """(g, x, y): a·x + b·y = g = gcd(a, b) ≥ 0."""
    old_r, r = a, b
    old_x, x = 1, 0
    old_y, y = 0, 1
    while r:
        q = old_r // r
        old_r, r = r, old_r - q * r
        old_x, x = x, old_x - q * x
        old_y, y = y, old_y - q * y
    if old_r < 0:  # negatif girdide işareti düzelt
        old_r, old_x, old_y = -old_r, -old_x, -old_y
    return old_r, old_x, old_y
