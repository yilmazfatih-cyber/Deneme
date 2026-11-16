"""NTT (sayı teorik dönüşüm): çok terimli çarpımını mod 998244353'te KESİN, O(n log n)'de yapar.

Fikir:
    FFT'deki karmaşık birim kökleri yerine mod p'de birimin kökleri kullanılır. p = 998244353 =
    119·2²³ + 1 asalıdır ve 3 onun ilkel köküdür; bu yüzden 2²³'e kadar her 2'nin kuvveti n için
    ω = 3^((p−1)/n) mod p, birimin n. ilkel köküdür. Kelebek döngüleri FFT ile aynıdır ama tüm
    işlemler tam sayı ve mod p'dir: yuvarlama hatası YOKTUR. Ters dönüşüm ω⁻¹ ve n⁻¹ ile yapılır.
    Sonuç mod p'dir; gerçek katsayılar p'yi aşabiliyorsa üç farklı NTT asalı ile hesaplayıp
    Çin kalan teoremiyle (`crt.py`) birleştirin.

Karmaşıklık: zaman O(n log n); yer O(n); n ≤ 2²³ (≈ 8.4 milyon)
Ne zaman: kombinatorikte "mod 998244353" çok terimli çarpımları, üreteç fonksiyonları, kesin
    evrişim.
Ne zaman değil: gerçel sayılı sinyal işlemede FFT (`fft.py`); kısa dizilerde düz çarpım.
Bağımlılık: yok
Genişletme: başka bir NTT asalı (ör. 469762049 = 7·2²⁶ + 1, kök 3) için `MOD` ve `ROOT`'u
    değiştirin.

Örnek:
    >>> multiply_polynomials_ntt([1, 2, 3], [4, 5])
    [4, 13, 22, 15]
    >>> multiply_polynomials_ntt([998244352], [2])  # (−1) · 2 ≡ −2
    [998244351]
"""

from __future__ import annotations

from collections.abc import Sequence

MOD = 998_244_353
ROOT = 3  # MOD'un ilkel kökü


def ntt(values: Sequence[int], invert: bool = False) -> list[int]:
    """Uzunluğu 2'nin kuvveti (≤ 2²³) olan dizinin mod MOD dönüşümü."""
    a = [x % MOD for x in values]
    n = len(a)
    if n & (n - 1) or n > 1 << 23:
        raise ValueError("uzunluk 2'nin kuvveti ve en çok 2^23 olmalı")
    j = 0
    for i in range(1, n):
        bit = n >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j |= bit
        if i < j:
            a[i], a[j] = a[j], a[i]
    length = 2
    while length <= n:
        w_len = pow(ROOT, (MOD - 1) // length, MOD)
        if invert:
            w_len = pow(w_len, MOD - 2, MOD)
        half = length // 2
        for start in range(0, n, length):
            w = 1
            for k in range(start, start + half):
                u, v = a[k], a[k + half] * w % MOD
                a[k] = (u + v) % MOD
                a[k + half] = (u - v) % MOD
                w = w * w_len % MOD
        length *= 2
    if invert:
        n_inverse = pow(n, MOD - 2, MOD)
        a = [x * n_inverse % MOD for x in a]
    return a


def multiply_polynomials_ntt(a: Sequence[int], b: Sequence[int]) -> list[int]:
    """İki çok terimlinin çarpımı mod MOD (katsayılar küçük dereceden büyüğe)."""
    if not a or not b:
        return []
    size = 1
    while size < len(a) + len(b) - 1:
        size *= 2
    fa = ntt(list(a) + [0] * (size - len(a)))
    fb = ntt(list(b) + [0] * (size - len(b)))
    product = ntt([x * y % MOD for x, y in zip(fa, fb)], invert=True)
    return product[: len(a) + len(b) - 1]
