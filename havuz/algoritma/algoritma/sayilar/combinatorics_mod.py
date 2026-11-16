"""Kombinasyon mod p: C(n, k) mod asal p — önceden hesaplanmış faktöriyeller ve Lucas teoremi.

Fikir:
    C(n, k) = n! / (k! (n−k)!). Mod p'de bölme, tersle çarpmaktır. n < p ise faktöriyeller ve
    TERS faktöriyeller bir kez hesaplanır (O(N)); sonra her C(n, k) üç çarpımdır (O(1)).
    Ters faktöriyeller tek tek ters alınmaz: önce (N!)⁻¹ Fermat ile bulunur, sonra
    (i−1)!⁻¹ = i!⁻¹ · i ile geriye doğru inilir (tek bir üs alma).
    n ≥ p ise n! ≡ 0 olur ve yöntem çöker. Lucas teoremi: n ve k, p tabanında yazılırsa
    C(n, k) ≡ Π C(n_i, k_i) (mod p). Böylece 10¹⁸'lik n için bile p küçükse hesap yapılabilir.

Karmaşıklık: BinomialMod kurulum O(N + log p), sorgu O(1); Lucas O(p + log_p n); yer O(N) / O(p)
Ne zaman: olasılık/sayma sorularında "sonucu mod 10⁹+7 verin"; çok sayıda C(n, k) sorgusu.
Ne zaman değil: tam (modsuz) değer gerekiyorsa `math.comb`; p asal değilse bu yöntemler geçersiz
    (bileşik modül için Granville / CRT gerekir).
Bağımlılık: yok
Genişletme: Catalan sayısı = C(2n, n) / (n+1) = binomial(2n, n) · ters(n+1).

Örnek:
    >>> table = BinomialMod(100, 1_000_000_007)
    >>> table.binomial(10, 3), table.binomial(100, 50), table.binomial(5, 7)
    (120, 538992043, 0)
    >>> lucas_binomial(10**18, 10**9, 13)
    0
"""

from __future__ import annotations


class BinomialMod:
    """0 ≤ k ≤ n ≤ max_n için C(n, k) mod p (p asal ve p > max_n)."""

    def __init__(self, max_n: int, p: int) -> None:
        if p <= max_n:
            raise ValueError("p, max_n'den büyük bir asal olmalı (n ≥ p için lucas_binomial)")
        self._p = p
        self._fact = [1] * (max_n + 1)
        for i in range(1, max_n + 1):
            self._fact[i] = self._fact[i - 1] * i % p
        self._inv_fact = [1] * (max_n + 1)
        self._inv_fact[max_n] = pow(self._fact[max_n], p - 2, p)  # Fermat: a^(p−2) = a⁻¹
        for i in range(max_n, 0, -1):
            self._inv_fact[i - 1] = self._inv_fact[i] * i % p

    def binomial(self, n: int, k: int) -> int:
        """C(n, k) mod p; k < 0 ya da k > n ise 0."""
        if k < 0 or k > n:
            return 0
        if n >= len(self._fact):
            raise ValueError(f"n en çok {len(self._fact) - 1} olabilir")
        return self._fact[n] * self._inv_fact[k] % self._p * self._inv_fact[n - k] % self._p

    def factorial(self, n: int) -> int:
        """n! mod p."""
        return self._fact[n]


def lucas_binomial(n: int, k: int, p: int) -> int:
    """C(n, k) mod p, p KÜÇÜK bir asal (n çok büyük olabilir)."""
    if k < 0 or k > n:
        return 0
    small = BinomialMod(p - 1, p)
    result = 1
    while n or k:
        n_digit, k_digit = n % p, k % p
        if k_digit > n_digit:
            return 0
        result = result * small.binomial(n_digit, k_digit) % p
        n, k = n // p, k // p
    return result
