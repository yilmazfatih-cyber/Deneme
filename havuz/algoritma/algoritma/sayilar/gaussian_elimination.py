"""Gauss eliminasyonu, KESİN: kesirlerle (Fraction) ve mod p'de doğrusal denklem çözme, determinant.

Fikir:
    Satır işlemleri (iki satırı değiştir, satırı sıfırdan farklı sayıyla çarp, bir satırın
    katını diğerine ekle) çözüm kümesini değiştirmez. Her sütunda bir "pivot" seçilir, pivotun
    altı ve üstü sıfırlanır; sonuç indirgenmiş satır basamak biçimidir (RREF). Pivotsuz
    sütunlar serbest değişkendir (sıfır alınır → bir özel çözüm). Bir satır "0 = c ≠ 0"
    olursa sistem çelişkilidir.
    Kayan nokta yerine `fractions.Fraction` kullanıldığından yuvarlama hatası YOKTUR (bedeli:
    sayılar büyüyebilir, yavaştır). Mod p sürümünde bölme, modüler tersle çarpmadır.
    Determinant: üst üçgen biçimde köşegen çarpımı; her satır değişimi işareti çevirir.

Karmaşıklık: zaman O(n² · m) aritmetik işlem (kesirlerde sayı boyu da büyür); yer O(n · m)
Ne zaman: küçük/orta sistemlerde kesin çözüm, rank, determinant; mod p'de (ör. XOR = mod 2)
    doğrusal cebir; kesirli ağırlıklı olasılık sistemleri (Markov zinciri emilim olasılıkları).
Ne zaman değil: büyük kayan nokta sistemleri için `lu_decomposition.py` (ya da numpy).
Bağımlılık: yok
Genişletme: ters matris için [A | I] matrisini RREF'e getirin; sağ yarı A⁻¹'dir.

Örnek:
    >>> solve([[2, 1], [1, 3]], [3, 5])
    [Fraction(4, 5), Fraction(7, 5)]
    >>> determinant([[1, 2], [3, 4]]), solve_mod([[1, 1], [1, 2]], [3, 4], 7)
    (Fraction(-2, 1), [2, 1])
    >>> solve([[1, 1], [2, 2]], [1, 3]) is None
    True
"""

from __future__ import annotations

from collections.abc import Sequence
from fractions import Fraction


def rref(matrix: Sequence[Sequence[Fraction | int]]) -> tuple[list[list[Fraction]], list[int]]:
    """(indirgenmiş satır basamak biçimi, pivot sütunları)."""
    rows = [[Fraction(x) for x in row] for row in matrix]
    pivots: list[int] = []
    r = 0
    cols = len(rows[0]) if rows else 0
    for c in range(cols):
        pivot = next((i for i in range(r, len(rows)) if rows[i][c] != 0), None)
        if pivot is None:
            continue  # serbest sütun
        rows[r], rows[pivot] = rows[pivot], rows[r]
        lead = rows[r][c]
        rows[r] = [x / lead for x in rows[r]]
        for i in range(len(rows)):
            if i != r and rows[i][c] != 0:
                factor = rows[i][c]
                rows[i] = [x - factor * y for x, y in zip(rows[i], rows[r])]
        pivots.append(c)
        r += 1
        if r == len(rows):
            break
    return rows, pivots


def solve(
    a: Sequence[Sequence[int | Fraction]], b: Sequence[int | Fraction]
) -> list[Fraction] | None:
    """A·x = b'nin bir çözümü (serbest değişkenler 0); çözüm yoksa None."""
    if len(a) != len(b):
        raise ValueError("A'nın satır sayısı b'nin uzunluğuna eşit olmalı")
    n_vars = len(a[0]) if a else 0
    reduced, pivots = rref([[*list(row), rhs] for row, rhs in zip(a, b)])
    if pivots and pivots[-1] == n_vars:
        return None  # sağ taraf sütununda pivot: "0 = c ≠ 0" satırı var, çelişki
    solution = [Fraction(0)] * n_vars
    for i, c in enumerate(pivots):
        solution[c] = reduced[i][n_vars]
    return solution


def determinant(a: Sequence[Sequence[int | Fraction]]) -> Fraction:
    """Kare matrisin determinantı (kesin)."""
    rows = [[Fraction(x) for x in row] for row in a]
    n = len(rows)
    if any(len(row) != n for row in rows):
        raise ValueError("determinant yalnız kare matriste tanımlı")
    det = Fraction(1)
    for c in range(n):
        pivot = next((i for i in range(c, n) if rows[i][c] != 0), None)
        if pivot is None:
            return Fraction(0)
        if pivot != c:
            rows[c], rows[pivot] = rows[pivot], rows[c]
            det = -det
        det *= rows[c][c]
        for i in range(c + 1, n):
            factor = rows[i][c] / rows[c][c]
            if factor:
                rows[i] = [x - factor * y for x, y in zip(rows[i], rows[c])]
    return det


def solve_mod(a: Sequence[Sequence[int]], b: Sequence[int], p: int) -> list[int] | None:
    """A·x ≡ b (mod p, p asal) için bir çözüm (serbest değişkenler 0); yoksa None."""

    def inverse(x: int) -> int:
        return pow(x, p - 2, p)  # Fermat: p asalsa x^(p−2) ≡ x⁻¹

    n_vars = len(a[0]) if a else 0
    rows = [[x % p for x in row] + [rhs % p] for row, rhs in zip(a, b)]
    pivots: list[int] = []
    r = 0
    for c in range(n_vars + 1):
        pivot = next((i for i in range(r, len(rows)) if rows[i][c]), None)
        if pivot is None:
            continue
        if c == n_vars:
            return None  # 0 = c ≠ 0
        rows[r], rows[pivot] = rows[pivot], rows[r]
        lead_inverse = inverse(rows[r][c])
        rows[r] = [x * lead_inverse % p for x in rows[r]]
        for i in range(len(rows)):
            if i != r and rows[i][c]:
                factor = rows[i][c]
                rows[i] = [(x - factor * y) % p for x, y in zip(rows[i], rows[r])]
        pivots.append(c)
        r += 1
        if r == len(rows):
            break
    solution = [0] * n_vars
    for i, c in enumerate(pivots):
        solution[c] = rows[i][n_vars]
    return solution
