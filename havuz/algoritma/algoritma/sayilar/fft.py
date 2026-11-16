"""FFT ile çok terimli çarpımı: iki tam sayı katsayılı çok terimliyi O(n log n)'de çarpar.

Fikir:
    Çok terimli çarpımı katsayılarda O(n²)'dir; ama n noktadaki DEĞERLERİ biliniyorsa çarpım,
    değerlerin tek tek çarpımıdır (O(n)). FFT, değerleri birimin n. kökleri ω^k noktalarında
    O(n log n)'de hesaplar: P(x) = Çift(x²) + x·Tek(x²) ayrışımı ve ω^(k + n/2) = −ω^k
    simetrisi sayesinde her düzeyde iş yarıya bölünür. Değerler çarpılıp ters FFT ile (ω yerine
    ω⁻¹ ve 1/n ölçeği) katsayılara dönülür. Bu sürüm özyinelemesiz ("kelebek" döngüleri + bit
    ters çevirme sıralaması).
    Kayan nokta uyarısı: sonuç yuvarlanarak tam sayıya çevrilir. Katsayılar büyükse
    (|a|·|b|·n ≳ 10¹⁴) yuvarlama hatası yanlış sonuç verir; kesinlik gerekiyorsa `ntt.py`.

Karmaşıklık: zaman O(n log n); yer O(n)
Ne zaman: büyük çok terimli/büyük sayı çarpımı, evrişim (sinyal işleme), dizgi eşleme sayımı.
Ne zaman değil: kısa dizilerde (≲ 64) düz O(n²) çarpım daha hızlıdır; tam kesinlik → `ntt.py`.
Bağımlılık: yok
Genişletme: büyük katsayılarda katsayıları 2¹⁵'lik parçalara bölüp üç FFT ile çarpın.

Örnek:
    >>> multiply_polynomials_fft([1, 2, 3], [4, 5])  # (1 + 2x + 3x²)(4 + 5x)
    [4, 13, 22, 15]
"""

from __future__ import annotations

import cmath
from collections.abc import Sequence


def fft(values: Sequence[complex], invert: bool = False) -> list[complex]:
    """Uzunluğu 2'nin kuvveti olan dizinin (ters) ayrık Fourier dönüşümü."""
    a = list(values)
    n = len(a)
    if n & (n - 1):
        raise ValueError("uzunluk 2'nin kuvveti olmalı")
    j = 0
    for i in range(1, n):  # bit ters çevirme sırası
        bit = n >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j |= bit
        if i < j:
            a[i], a[j] = a[j], a[i]
    length = 2
    while length <= n:
        angle = 2 * cmath.pi / length * (-1 if invert else 1)
        root = cmath.exp(1j * angle)
        for start in range(0, n, length):
            w = 1 + 0j
            for k in range(length // 2):
                u = a[start + k]
                v = a[start + k + length // 2] * w
                a[start + k] = u + v
                a[start + k + length // 2] = u - v
                w *= root
        length *= 2
    if invert:
        a = [x / n for x in a]
    return a


def multiply_polynomials_fft(a: Sequence[int], b: Sequence[int]) -> list[int]:
    """İki tam sayı katsayılı çok terimlinin çarpımı (katsayılar küçük dereceden büyüğe)."""
    if not a or not b:
        return []
    size = 1
    while size < len(a) + len(b) - 1:
        size *= 2
    fa = fft([complex(x) for x in a] + [0j] * (size - len(a)))
    fb = fft([complex(x) for x in b] + [0j] * (size - len(b)))
    product = fft([x * y for x, y in zip(fa, fb)], invert=True)
    return [round(c.real) for c in product[: len(a) + len(b) - 1]]
