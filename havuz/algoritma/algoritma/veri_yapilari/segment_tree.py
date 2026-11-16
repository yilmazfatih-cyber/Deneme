"""Tembel yayılımlı segment ağacı: aralığa ekleme + aralık toplamı/en küçüğü, hepsi O(log n).

Fikir:
    Dizinin her parçasının (segmentin) toplamı ve en küçüğü bir ikili ağaçta tutulur: kök tüm
    diziyi, çocukları yarılarını kapsar. Bir sorgu aralığı en çok O(log n) tam düğüme bölünür.
    "Aralığa ekle" işleminde her öğeyi tek tek güncellemek O(n) olurdu; bunun yerine aralığı
    tamamen kapsayan düğümün özeti güncellenir ve "çocuklarına daha iletilmedi" diye bir tembel
    not (lazy) bırakılır. Not, ancak o düğümün içine inmek gerektiğinde çocuklara itilir (push).
    Tüm aralıklar yarı açıktır: [lo, hi) — lo dahil, hi hariç (Python dilimleri gibi).

Karmaşıklık: kurulum O(n); add/range_sum/range_min/get/set O(log n); yer O(n)
Ne zaman: aralık güncellemesi ve aralık sorgusu birlikte ve çok sayıda geliyorsa.
Ne zaman değil: yalnız nokta güncelleme + önek toplamı için `fenwick_tree.py` daha kısa ve
    hızlıdır; dizi hiç değişmiyorsa önek toplamı ya da `sparse_table.py` yeter.
Bağımlılık: yok
Özyineleme: derinlik O(log n) (n = 10^6 için ~21); yığın taşmaz.
Genişletme: "aralığı bir değere ata" için ikinci bir tembel alan (`_assign`) ekleyip `_apply`
    ve `_push` içinde önce atamayı, sonra eklemeyi uygulayın.

Örnek:
    >>> st = LazySegmentTree([5, 3, 8, 6])
    >>> st.add(1, 3, 10)
    >>> st.range_sum(0, 4), st.range_min(1, 4), st.get(2)
    (42, 6, 18)
"""

from __future__ import annotations

from collections.abc import Sequence


class LazySegmentTree:
    """Aralığa ekleme destekleyen toplam + en küçük segment ağacı (tam sayı ya da ondalık)."""

    def __init__(self, values: Sequence[float]) -> None:
        self._n = len(values)
        size = 4 * max(1, self._n)
        self._sum: list[float] = [0] * size
        self._min: list[float] = [0] * size
        self._lazy: list[float] = [0] * size
        if self._n:
            self._build(1, 0, self._n, values)

    def __len__(self) -> int:
        return self._n

    def _build(self, node: int, lo: int, hi: int, values: Sequence[float]) -> None:
        if hi - lo == 1:
            self._sum[node] = self._min[node] = values[lo]
            return
        mid = (lo + hi) // 2
        self._build(2 * node, lo, mid, values)
        self._build(2 * node + 1, mid, hi, values)
        self._pull(node)

    def _pull(self, node: int) -> None:
        self._sum[node] = self._sum[2 * node] + self._sum[2 * node + 1]
        self._min[node] = min(self._min[2 * node], self._min[2 * node + 1])

    def _apply(self, node: int, length: int, delta: float) -> None:
        self._sum[node] += delta * length
        self._min[node] += delta
        self._lazy[node] += delta

    def _push(self, node: int, lo: int, hi: int) -> None:
        if self._lazy[node]:
            mid = (lo + hi) // 2
            self._apply(2 * node, mid - lo, self._lazy[node])
            self._apply(2 * node + 1, hi - mid, self._lazy[node])
            self._lazy[node] = 0

    def _check(self, lo: int, hi: int, allow_empty: bool) -> None:
        if not 0 <= lo <= hi <= self._n or (lo == hi and not allow_empty):
            raise IndexError(f"geçersiz aralık [{lo}, {hi}) (uzunluk {self._n})")

    def add(self, lo: int, hi: int, delta: float) -> None:
        """[lo, hi) aralığındaki her öğeye `delta` ekler."""
        self._check(lo, hi, allow_empty=True)
        if lo < hi:
            self._add(1, 0, self._n, lo, hi, delta)

    def _add(self, node: int, lo: int, hi: int, qlo: int, qhi: int, delta: float) -> None:
        if qhi <= lo or hi <= qlo:
            return
        if qlo <= lo and hi <= qhi:
            self._apply(node, hi - lo, delta)
            return
        self._push(node, lo, hi)
        mid = (lo + hi) // 2
        self._add(2 * node, lo, mid, qlo, qhi, delta)
        self._add(2 * node + 1, mid, hi, qlo, qhi, delta)
        self._pull(node)

    def range_sum(self, lo: int, hi: int) -> float:
        """[lo, hi) toplamı (boş aralık: 0)."""
        self._check(lo, hi, allow_empty=True)
        return self._query(1, 0, self._n, lo, hi)[0] if lo < hi else 0

    def range_min(self, lo: int, hi: int) -> float:
        """[lo, hi) en küçüğü (aralık boş olamaz)."""
        self._check(lo, hi, allow_empty=False)
        return self._query(1, 0, self._n, lo, hi)[1]

    def _query(self, node: int, lo: int, hi: int, qlo: int, qhi: int) -> tuple[float, float]:
        if qlo <= lo and hi <= qhi:
            return self._sum[node], self._min[node]
        self._push(node, lo, hi)
        mid = (lo + hi) // 2
        if qhi <= mid:
            return self._query(2 * node, lo, mid, qlo, qhi)
        if mid <= qlo:
            return self._query(2 * node + 1, mid, hi, qlo, qhi)
        left = self._query(2 * node, lo, mid, qlo, qhi)
        right = self._query(2 * node + 1, mid, hi, qlo, qhi)
        return left[0] + right[0], min(left[1], right[1])

    def get(self, index: int) -> float:
        """Tek öğenin şu anki değeri."""
        if not 0 <= index < self._n:
            raise IndexError(f"dizin sınır dışında: {index} (uzunluk {self._n})")
        return self.range_sum(index, index + 1)

    def set(self, index: int, value: float) -> None:
        """Tek öğeyi verilen değere eşitler."""
        self.add(index, index + 1, value - self.get(index))
