"""Count-min sketch: akıştaki öğelerin sıklığını sabit bellekte, yalnız fazla tahmin ederek sayar.

Fikir:
    d satır × w sütunluk bir sayaç tablosu ve her satır için ayrı bir karma vardır. Öğe gelince
    her satırda kendi sütunundaki sayaç artırılır. Sorguda d sayacın EN KÜÇÜĞÜ döndürülür:
    çakışmalar sayacı yalnız artırabildiği için tahmin hiçbir zaman gerçek sayıdan küçük olmaz.
    w = ⌈e/ε⌉ ve d = ⌈ln(1/δ)⌉ seçilirse, 1 − δ olasılıkla tahmin ≤ gerçek + ε·N olur
    (N = toplam sayım). Karma, satır numarasıyla tuzlanmış blake2b'dir (belirlenimci).

Karmaşıklık: ekleme/tahmin O(d); yer O(w·d) — öğe sayısından bağımsız
Ne zaman: çok büyük akışta yaklaşık sıklık (ağ trafiği, en sık aranan kelimeler, ağır vuruşlar).
Ne zaman değil: kesin sayım gerekiyorsa ve öğeler belleğe sığıyorsa `collections.Counter`.
Bağımlılık: yok
Genişletme: "muhafazakâr güncelleme" (yalnız en küçük sayaçları artır) hatayı azaltır; `add`'i
    önce tahmin edip sonra yalnız tahmin+sayıdan küçük sayaçları yükseltecek biçimde değiştirin.

Örnek:
    >>> cms = CountMinSketch.from_error(epsilon=0.01, delta=0.01)
    >>> for word in ["çay", "çay", "simit", "çay"]:
    ...     cms.add(word)
    >>> cms.estimate("çay"), cms.estimate("simit"), cms.estimate("kahve"), cms.total
    (3, 1, 0, 4)
"""

from __future__ import annotations

import hashlib
import math


class CountMinSketch:
    """Sabit boyutlu sayaç tablosu; tahminler gerçek sayıdan asla küçük değildir."""

    def __init__(self, width: int, depth: int) -> None:
        if width <= 0 or depth <= 0:
            raise ValueError("genişlik ve derinlik pozitif olmalı")
        self._width = width
        self._depth = depth
        self._table = [[0] * width for _ in range(depth)]
        self.total = 0

    @classmethod
    def from_error(cls, epsilon: float, delta: float) -> CountMinSketch:
        """Hata ≤ epsilon·N, olasılık ≥ 1 − delta olacak boyutla kurar."""
        if not 0 < epsilon < 1 or not 0 < delta < 1:
            raise ValueError("0 < epsilon < 1 ve 0 < delta < 1 olmalı")
        return cls(math.ceil(math.e / epsilon), math.ceil(math.log(1 / delta)))

    @property
    def width(self) -> int:
        return self._width

    @property
    def depth(self) -> int:
        return self._depth

    def _columns(self, item: str | bytes) -> list[int]:
        data = item.encode("utf-8") if isinstance(item, str) else item
        columns = []
        for row in range(self._depth):
            salt = row.to_bytes(16, "little")
            digest = hashlib.blake2b(data, digest_size=8, salt=salt).digest()
            columns.append(int.from_bytes(digest, "little") % self._width)
        return columns

    def add(self, item: str | bytes, count: int = 1) -> None:
        """Öğenin sayımını `count` artırır (count ≥ 0)."""
        if count < 0:
            raise ValueError("count-min sketch yalnız artırmayı destekler (count ≥ 0)")
        for row, column in enumerate(self._columns(item)):
            self._table[row][column] += count
        self.total += count

    def estimate(self, item: str | bytes) -> int:
        """Sıklık tahmini (≥ gerçek değer)."""
        return min(self._table[row][col] for row, col in enumerate(self._columns(item)))
