"""Pollard rho (Brent sürümü) ile çarpanlara ayırma: 10¹⁸ civarı sayıları hızla böler.

Fikir:
    n'nin bilinmeyen bir asal çarpanı p olsun. f(x) = x² + c (mod n) dizisi mod p'de en çok p
    farklı değer alabildiğinden ~√p adımda kendini tekrar eder (doğum günü paradoksu). Döngüye
    girildiği an, dizinin iki elemanının farkı p'nin katıdır: ebob(|x − y|, n) > 1 olur ve bir
    çarpan bulunur. Brent'in sürümü döngüyü ikinin kuvveti uzunluklu adımlarla yakalar ve
    ebob'u her adımda değil, farkların çarpımı üstünden toplu (128'lik) hesaplar.
    Önce küçük asallarla deneme bölmesi yapılır; kalan parça asalsa (Miller-Rabin) bitti,
    değilse rho ile ikiye bölünüp parçalar aynı yolla ayrılır. c rastgele (tohumlu) seçilir.
    Ölçüm: iki ~10⁹ asalın çarpımı olan 20 sayıda (≈10¹⁸, rho için zor durum) en kötü 0.05 sn.

Karmaşıklık: beklenen O(n^(1/4)) ebob/çarpma (en küçük asal çarpan p için O(√p)); yer O(log n)
Ne zaman: 10¹⁸–10²⁴ mertebesindeki tek sayıları çarpanlarına ayırmak (bölen sayısı, totient).
Ne zaman değil: çok sayıda küçük sayı için elek tabanlı ayırma (`sieve.py`); 10³⁰'un üstündeki
    büyük asal çarpanlı sayılar için eliptik eğri (ECM) ya da sayı cismi eleği gerekir.
Bağımlılık: algoritma.sayilar.miller_rabin (asallık testi)
Genişletme: Euler totient φ(n) = n · Π(1 − 1/p) çarpanlardan doğrudan hesaplanır.

Örnek:
    >>> factorize(600851475143), factorize(2**4 * 3 * 1000000007)
    ([71, 839, 1471, 6857], [2, 2, 2, 2, 3, 1000000007])
"""

from __future__ import annotations

import math
import random

from algoritma.sayilar.miller_rabin import is_prime

_SMALL_PRIMES = [p for p in range(2, 1000) if all(p % q for q in range(2, math.isqrt(p) + 1))]


def _brent(n: int, rng: random.Random) -> int:
    """Bileşik ve tek n'nin 1 ile n arasında bir çarpanı."""
    while True:
        y, c, batch = rng.randrange(1, n), rng.randrange(1, n), 128
        g, r, q = 1, 1, 1
        x = ys = y
        while g == 1:
            x = y
            for _ in range(r):
                y = (y * y + c) % n
            k = 0
            while k < r and g == 1:
                ys = y
                for _ in range(min(batch, r - k)):
                    y = (y * y + c) % n
                    q = q * abs(x - y) % n
                g = math.gcd(q, n)
                k += batch
            r *= 2
        if g == n:  # toplu ebob çarpanı atladı: geri dönüp tek tek ilerle
            g = 1
            while g == 1:
                ys = (ys * ys + c) % n
                g = math.gcd(abs(x - ys), n)
        if g != n:
            return g  # g == n ise başka bir c ile yeniden dene


def factorize(n: int, rng: random.Random | None = None) -> list[int]:
    """n ≥ 1'in asal çarpanları (artan, tekrarlı). factorize(1) = []."""
    if n < 1:
        raise ValueError("çarpanlara ayırma için n ≥ 1 olmalı")
    rng = rng if rng is not None else random.Random(0)
    factors: list[int] = []
    for p in _SMALL_PRIMES:
        while n % p == 0:
            factors.append(p)
            n //= p
    pending = [n] if n > 1 else []
    while pending:
        m = pending.pop()
        if is_prime(m):
            factors.append(m)
            continue
        root = math.isqrt(m)
        if root * root == m:  # tam kare: rho için zor durum, doğrudan böl
            pending += [root, root]
            continue
        d = _brent(m, rng)
        pending += [d, m // d]
    return sorted(factors)
