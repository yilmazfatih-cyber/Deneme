"""Fenwick ağacı (ikili dizinli ağaç): nokta güncelleme + önek toplamı, ikisi de O(log n).

Fikir:
    i. kutu (1'den sayılır) kendisiyle birlikte geriye doğru `i & -i` kadar öğenin toplamını tutar
    (`i & -i`: i'nin en sağdaki 1 bitinin değeri). Önek toplamı için i'den başlayıp en sağ biti
    sile sile (i -= i & -i) en çok log n kutu toplanır. Güncellemede ise i'yi kapsayan kutular
    en sağ biti ekleye ekleye (i += i & -i) gezilir. Segment ağacının yarı belleğiyle, birkaç
    satırda aynı işi (ama yalnız tersi alınabilen işlemler için: toplam, XOR) yapar.
    `lower_bound` aynı bit yapısını kullanarak "önek toplamı ≥ hedef olan ilk konum"u O(log n)'de
    bulur (değerler negatif değilse); sıra istatistiği (k. öğe) için kullanılır.

Karmaşıklık: kurulum O(n); add/prefix_sum/range_sum/lower_bound O(log n); yer O(n)
Ne zaman: değişen bir dizide önek/aralık toplamı; sayma (ters çevrim sayısı), k. öğe bulma.
Ne zaman değil: aralığa güncelleme + aralık en küçüğü gerekiyorsa `segment_tree.py`.
Bağımlılık: yok
Genişletme: aralığa ekleme + nokta sorgusu için farkların (a[i] − a[i−1]) Fenwick'ini tutun.

Örnek:
    >>> fw = FenwickTree([3, 1, 4, 1, 5])
    >>> fw.add(2, 10)
    >>> fw.prefix_sum(3), fw.range_sum(1, 4), fw.lower_bound(18)
    (18, 16, 2)
"""

from __future__ import annotations

from collections.abc import Sequence


class FenwickTree:
    """0'dan başlayan dizinlerle çalışan Fenwick ağacı (içeride 1'den başlar)."""

    def __init__(self, values: Sequence[int] | int) -> None:
        if isinstance(values, int):
            values = [0] * values
        self._n = len(values)
        self._tree = [0] * (self._n + 1)
        for i, value in enumerate(values, start=1):  # O(n) kurulum: her kutu ebeveynine aktarır
            self._tree[i] += value
            parent = i + (i & -i)
            if parent <= self._n:
                self._tree[parent] += self._tree[i]

    def __len__(self) -> int:
        return self._n

    def add(self, index: int, delta: int) -> None:
        """values[index] += delta."""
        if not 0 <= index < self._n:
            raise IndexError(f"dizin sınır dışında: {index} (uzunluk {self._n})")
        i = index + 1
        while i <= self._n:
            self._tree[i] += delta
            i += i & -i

    def prefix_sum(self, count: int) -> int:
        """İlk `count` öğenin toplamı: values[0] + … + values[count − 1]."""
        if not 0 <= count <= self._n:
            raise IndexError(f"önek uzunluğu sınır dışında: {count} (uzunluk {self._n})")
        total = 0
        while count > 0:
            total += self._tree[count]
            count -= count & -count
        return total

    def range_sum(self, lo: int, hi: int) -> int:
        """values[lo:hi] toplamı."""
        if lo > hi:
            raise IndexError(f"geçersiz aralık [{lo}, {hi})")
        return self.prefix_sum(hi) - self.prefix_sum(lo)

    def lower_bound(self, target: int) -> int:
        """prefix_sum(i + 1) ≥ target olan en küçük i; yoksa len(self). Değerler ≥ 0 olmalı."""
        if target <= 0:
            return 0
        position = 0
        step = 1 << self._n.bit_length()
        while step:
            nxt = position + step
            if nxt <= self._n and self._tree[nxt] < target:
                position = nxt
                target -= self._tree[nxt]
            step >>= 1
        return position  # 1 tabanlı `position + 1` → 0 tabanlı `position`
