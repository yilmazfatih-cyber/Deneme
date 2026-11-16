"""Seyrek tablo: değişmeyen dizide aralık en küçüğü (RMQ) sorgusunu O(1)'de yanıtlar.

Fikir:
    table[k][i] = values[i : i + 2^k] aralığının özeti (ör. en küçüğü). table[k], table[k−1]'in
    iki yarısından O(n)'de kurulur; toplam O(n log n). Sorgu [lo, hi) için k = ⌊log2(hi − lo)⌋
    seçilir ve aralık, birbiriyle ÇAKIŞAN iki 2^k'lık blokla örtülür: [lo, lo+2^k) ve
    [hi−2^k, hi). Çakışma sonucu bozmaz çünkü işlem "eş kuvvetli"dir (idempotent):
    min(x, x) = x. Bu yüzden yalnız min, max, ebob, bit-ve/veya için çalışır; toplam için ÇALIŞMAZ.

Karmaşıklık: kurulum O(n log n); sorgu O(1); yer O(n log n)
Ne zaman: dizi değişmiyor ve çok sayıda aralık min/max/ebob sorgusu geliyorsa (ör. LCA).
Ne zaman değil: dizi güncelleniyorsa `segment_tree.py`; toplam sorgusu için önek toplamı.
Bağımlılık: yok
Genişletme: en küçüğün DİZİNİ gerekiyorsa değer yerine (değer, dizin) çiftleri saklayın.

Örnek:
    >>> st = SparseTable([5, 2, 7, 1, 9, 3], min)
    >>> st.query(0, 3), st.query(2, 6), st.query(4, 5)
    (2, 1, 9)
    >>> from math import gcd
    >>> SparseTable([12, 18, 24, 9], gcd).query(0, 3)
    6
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Generic, TypeVar

T = TypeVar("T")


class SparseTable(Generic[T]):
    """Eş kuvvetli (idempotent) ve birleşmeli bir işlem için O(1) aralık sorgusu."""

    def __init__(self, values: Sequence[T], combine: Callable[[T, T], T]) -> None:
        self._combine = combine
        self._n = len(values)
        self._table: list[list[T]] = [list(values)]
        k = 1
        while (1 << k) <= self._n:
            previous = self._table[k - 1]
            half = 1 << (k - 1)
            row = [combine(previous[i], previous[i + half]) for i in range(self._n - (1 << k) + 1)]
            self._table.append(row)
            k += 1

    def __len__(self) -> int:
        return self._n

    def query(self, lo: int, hi: int) -> T:
        """values[lo:hi] aralığının özeti; aralık boş olamaz."""
        if not 0 <= lo < hi <= self._n:
            raise IndexError(f"geçersiz aralık [{lo}, {hi}) (uzunluk {self._n})")
        k = (hi - lo).bit_length() - 1
        row = self._table[k]
        return self._combine(row[lo], row[hi - (1 << k)])
