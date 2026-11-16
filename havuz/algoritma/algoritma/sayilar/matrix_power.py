"""Matris üssüyle doğrusal yineleme: a(n) = c1·a(n−1) + … + ck·a(n−k)'nin n. terimi O(k³ log n)'de.

Fikir:
    Durum vektörü [a(n), a(n−1), …, a(n−k+1)] bir "geçiş matrisi" T ile bir adım ilerletilir:
    T'nin ilk satırı katsayılardır, altı ise bir kaydırma (birim matrisin kaydırılmış hâli).
    n adım ilerlemek Tⁿ ile çarpmaktır; Tⁿ kare-çarp yöntemiyle O(log n) matris çarpımında
    bulunur. Böylece 10¹⁸. Fibonacci sayısı bile (mod m) anında hesaplanır.
    Tüm işlemler mod m'de yapılır (tam sayılar büyümesin diye); m = 0 verilirse mod alınmaz.

Karmaşıklık: zaman O(k³ · log n); yer O(k²)
Ne zaman: n çok büyükken doğrusal yinelemeler (Fibonacci, karo döşeme sayıları, grafta tam
    n adımlı yol sayısı = komşuluk matrisinin n. kuvveti).
Ne zaman değil: n küçükse (≲ 10⁷) basit döngü yeter; k çok büyükse (≫ 100) Kitamasa /
    Berlekamp-Massey.
Bağımlılık: yok
Genişletme: sabit terimli yineleme (a(n) = … + d) için duruma sabit 1 bileşeni ekleyin.

Örnek:
    >>> fibonacci(10), fibonacci(10**18, 1_000_000_007)
    (55, 209783453)
    >>> linear_recurrence([1, 1, 1], [0, 0, 1], 10)  # Tribonacci: 0, 0, 1, 1, 2, 4, 7, 13, 24, 44
    81
"""

from __future__ import annotations

from collections.abc import Sequence

Matrix = list[list[int]]


def mat_mult(a: Sequence[Sequence[int]], b: Sequence[Sequence[int]], mod: int = 0) -> Matrix:
    """Matris çarpımı (mod > 0 ise her girdi mod alınır)."""
    inner, cols = len(b), len(b[0]) if b else 0
    result = [[0] * cols for _ in a]
    for i, row in enumerate(a):
        out = result[i]
        for t in range(inner):
            if row[t]:
                factor, b_row = row[t], b[t]
                for j in range(cols):
                    out[j] += factor * b_row[j]
        if mod:
            result[i] = [x % mod for x in out]
    return result


def mat_pow(m: Sequence[Sequence[int]], exponent: int, mod: int = 0) -> Matrix:
    """Kare matrisin üssü (exponent ≥ 0), kare-çarp ile."""
    if exponent < 0:
        raise ValueError("negatif üs desteklenmez")
    size = len(m)
    result: Matrix = [[int(i == j) for j in range(size)] for i in range(size)]
    base: Matrix = [list(row) for row in m]
    while exponent:
        if exponent & 1:
            result = mat_mult(result, base, mod)
        base = mat_mult(base, base, mod)
        exponent >>= 1
    return result


def linear_recurrence(
    coefficients: Sequence[int], initial: Sequence[int], n: int, mod: int = 0
) -> int:
    """a(n); a(i) = Σ coefficients[j] · a(i−1−j), başlangıç a(0) … a(k−1) = initial."""
    k = len(coefficients)
    if len(initial) != k or k == 0:
        raise ValueError("katsayı ve başlangıç değeri sayısı eşit ve > 0 olmalı")
    if n < k:
        return initial[n] % mod if mod else initial[n]
    transition: Matrix = [list(coefficients)] + [
        [int(j == i) for j in range(k)] for i in range(k - 1)
    ]
    power = mat_pow(transition, n - k + 1, mod)
    state = [initial[k - 1 - i] for i in range(k)]  # [a(k−1), a(k−2), …, a(0)]
    value = sum(power[0][j] * state[j] for j in range(k))
    return value % mod if mod else value


def fibonacci(n: int, mod: int = 0) -> int:
    """F(n) (F(0) = 0, F(1) = 1), isteğe bağlı mod ile."""
    return linear_recurrence([1, 1], [0, 1], n, mod)
