"""HyperLogLog: milyonlarca farklı öğeyi birkaç kilobaytla, ~%1–2 hatayla sayar (kardinalite).

Fikir:
    İyi bir karmanın bitleri rastgeledir: karmanın başında k sıfır görmek 2^(k+1) farklı öğede bir
    olur. Yalnız tek bir "en uzun sıfır dizisi" çok gürültülü bir tahmin verir; bu yüzden karma
    ikiye bölünür: ilk p bit öğeyi m = 2^p kovadan birine atar, kalan bitlerdeki ilk 1'in konumu
    (ρ) o kovada en büyük değer olarak saklanır. Kovaların harmonik ortalaması birleştirilir:
    E = α_m · m² / Σ 2^(−M[j]). Küçük sayılarda (E ≤ 2.5m) boş kova sayısından "doğrusal sayım"
    yapılır. Göreli standart hata ≈ 1.04/√m (p = 12 → m = 4096 → %1.6).
    İki HLL kova kova `max` ile birleştirilir: birleşimin kardinalitesi (dağıtık sayım).

Karmaşıklık: ekleme O(1); tahmin O(m); yer O(m) bayt (m = 2^p)
Ne zaman: tekil ziyaretçi, farklı arama terimi gibi çok büyük akışlarda yaklaşık farklı öğe sayısı.
Ne zaman değil: kesin sayı gerekiyorsa ve öğeler belleğe sığıyorsa `len(set(...))`.
Bağımlılık: yok
Genişletme: çok büyük p'lerde bellek için kovaları 6 bitlik paketlere sıkıştırabilirsiniz.

Örnek:
    >>> hll = HyperLogLog(precision=12)
    >>> for i in range(10_000):
    ...     hll.add(f"kullanici-{i % 5000}")
    >>> abs(hll.estimate() - 5000) / 5000 < 0.05
    True
"""

from __future__ import annotations

import hashlib
import math

_HASH_BITS = 64


class HyperLogLog:
    """2^precision kovalı HyperLogLog sayacı (64 bit blake2b karma)."""

    def __init__(self, precision: int = 12) -> None:
        if not 4 <= precision <= 16:
            raise ValueError("precision 4 ile 16 arasında olmalı")
        self._p = precision
        self._m = 1 << precision
        self._registers = bytearray(self._m)

    @property
    def register_count(self) -> int:
        return self._m

    def add(self, item: str | bytes) -> None:
        """Öğeyi ekler (aynı öğeyi tekrar eklemek tahmini değiştirmez)."""
        data = item.encode("utf-8") if isinstance(item, str) else item
        x = int.from_bytes(hashlib.blake2b(data, digest_size=8).digest(), "big")
        index = x >> (_HASH_BITS - self._p)
        rest_bits = _HASH_BITS - self._p
        rest = x & ((1 << rest_bits) - 1)
        rho = rest_bits - rest.bit_length() + 1  # ilk 1 bitinin konumu (1'den başlar)
        if rho > self._registers[index]:
            self._registers[index] = rho

    def _alpha(self) -> float:
        if self._m == 16:
            return 0.673
        if self._m == 32:
            return 0.697
        if self._m == 64:
            return 0.709
        return 0.7213 / (1 + 1.079 / self._m)

    def estimate(self) -> float:
        """Farklı öğe sayısı tahmini."""
        m = self._m
        raw = self._alpha() * m * m / sum(2.0**-r for r in self._registers)
        zeros = self._registers.count(0)
        if raw <= 2.5 * m and zeros:
            return m * math.log(m / zeros)  # doğrusal sayım: küçük sayılarda çok daha doğru
        return raw  # 64 bit karmada büyük sayı düzeltmesi gerekmez

    def merge(self, other: HyperLogLog) -> None:
        """Başka bir sayacı bununla birleştirir (aynı precision gerekir)."""
        if other._p != self._p:
            raise ValueError("yalnız aynı precision değerli sayaçlar birleştirilebilir")
        self._registers = bytearray(map(max, self._registers, other._registers))
