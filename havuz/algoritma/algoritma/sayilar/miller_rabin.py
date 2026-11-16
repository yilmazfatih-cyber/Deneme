"""Miller-Rabin asallık testi: 3.3·10²⁴'ten küçükte kesin, üstünde çok yüksek olasılıkla doğru.

Fikir:
    n − 1 = d · 2^s (d tek) yazılır. n asalsa her a için ya a^d ≡ 1, ya da bazı r < s için
    a^(d·2^r) ≡ −1 (mod n) olur (Fermat + "1'in kare kökleri yalnız ±1'dir"). Bu koşulu
    sağlamayan bir a, n'nin bileşik olduğunun KANITIDIR (tanık). Bileşik bir n için tanık
    olmayan a'ların oranı en çok 1/4'tür.
    İlk 12 asal (2 … 37) taban olarak denenirse n < 3 317 044 064 679 887 385 961 981 için
    yanıt KESİNDİR (bilinen sonuç). Daha büyük n'de ek olarak `rounds` tane rastgele taban
    denenir; yanılma olasılığı ≤ 4^(−rounds).

Karmaşıklık: zaman O(k · log³ n) (k taban, her biri bir modüler üs); yer O(1)
Ne zaman: tek tek büyük sayıların asallığı (RSA anahtarı, karma tablosu boyutu, Pollard rho).
Ne zaman değil: bir aralıktaki tüm asallar için elek (`sieve.py`) çok daha hızlıdır.
Bağımlılık: yok
Genişletme: kanıt (sertifika) gerekiyorsa ECPP gibi yöntemler gerekir; bu test kanıt üretmez.

Örnek:
    >>> is_prime(2**61 - 1), is_prime(561), is_prime(3215031751), is_prime(1)
    (True, False, False, False)
"""

from __future__ import annotations

import random

_DETERMINISTIC_BASES = (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37)
_DETERMINISTIC_LIMIT = 3_317_044_064_679_887_385_961_981


def _is_witness(a: int, d: int, s: int, n: int) -> bool:
    """a, n'nin bileşik olduğunu kanıtlıyor mu?"""
    x = pow(a, d, n)
    if x in (1, n - 1):
        return False
    for _ in range(s - 1):
        x = x * x % n
        if x == n - 1:
            return False
    return True


def is_prime(n: int, rounds: int = 20, rng: random.Random | None = None) -> bool:
    """n asal mı? n < 3.3·10²⁴ için kesin; üstünde yanılma olasılığı ≤ 4^(−rounds)."""
    if n < 2:
        return False
    for p in _DETERMINISTIC_BASES:
        if n % p == 0:
            return n == p
    d, s = n - 1, 0
    while d % 2 == 0:
        d //= 2
        s += 1
    if any(_is_witness(a, d, s, n) for a in _DETERMINISTIC_BASES):
        return False
    if n < _DETERMINISTIC_LIMIT:
        return True
    rng = rng if rng is not None else random.Random(n)  # belirlenimci: aynı n → aynı tabanlar
    return not any(_is_witness(rng.randrange(2, n - 1), d, s, n) for _ in range(rounds))
