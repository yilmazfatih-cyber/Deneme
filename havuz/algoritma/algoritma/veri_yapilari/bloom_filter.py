"""Bloom süzgeci: "kesinlikle yok" ya da "büyük olasılıkla var" diyen, çok az yer kaplayan küme.

Fikir:
    m bitlik bir dizi ve k farklı karma fonksiyonu vardır. Eklenen öğenin k karması k bit konumu
    verir; o bitler 1 yapılır. Sorguda k bitin hepsi 1 ise "belki var", biri bile 0 ise "kesin yok"
    denir. Yanlış negatif OLMAZ; yanlış pozitif olasılığı ≈ (1 − e^(−k·n/m))^k'dir.
    n öğe ve hedef hata oranı p için en iyi seçim: m = −n·ln p / (ln 2)², k = (m/n)·ln 2.
    k karma, tek bir blake2b özetinden çift karma ile türetilir: h_i = h1 + i·h2 (mod m).
    Python'un `hash()` fonksiyonu süreçten sürece değiştiği için KULLANILMAZ; sonuç her
    çalıştırmada aynıdır.

Karmaşıklık: ekleme/sorgu O(k); yer O(m) bit (≈ 9.6 bit/öğe, %1 hata için)
Ne zaman: pahalı bir aramanın önünde "kesin yok"ları ucuza elemek (disk, ağ, veritabanı).
Ne zaman değil: silme gerekiyorsa (sayaçlı Bloom gerekir); yanlış pozitif kabul edilemiyorsa.
Bağımlılık: yok
Genişletme: silme için her biti küçük bir sayaçla değiştirin (sayaçlı Bloom süzgeci).

Örnek:
    >>> bf = BloomFilter(capacity=1000, error_rate=0.01)
    >>> bf.add("ankara")
    >>> "ankara" in bf, "izmir" in bf, bf.bit_count, bf.hash_count
    (True, False, 9586, 7)
"""

from __future__ import annotations

import hashlib
import math


class BloomFilter:
    """Dizgi ya da bayt öğeler için Bloom süzgeci."""

    def __init__(self, capacity: int, error_rate: float) -> None:
        if capacity <= 0 or not 0 < error_rate < 1:
            raise ValueError("kapasite > 0 ve 0 < hata oranı < 1 olmalı")
        self._m = max(8, math.ceil(-capacity * math.log(error_rate) / math.log(2) ** 2))
        self._k = max(1, round(self._m / capacity * math.log(2)))
        self._bits = bytearray((self._m + 7) // 8)
        self._added = 0

    @property
    def bit_count(self) -> int:
        """Bit dizisinin uzunluğu (m)."""
        return self._m

    @property
    def hash_count(self) -> int:
        """Karma fonksiyonu sayısı (k)."""
        return self._k

    def __len__(self) -> int:
        """Eklenen öğe sayısı (yinelenenler de sayılır)."""
        return self._added

    def _positions(self, item: str | bytes) -> list[int]:
        data = item.encode("utf-8") if isinstance(item, str) else item
        digest = hashlib.blake2b(data, digest_size=16).digest()
        h1 = int.from_bytes(digest[:8], "little")
        h2 = int.from_bytes(digest[8:], "little") | 1  # tek sayı: adımlar hep farklı konum verir
        return [(h1 + i * h2) % self._m for i in range(self._k)]

    def add(self, item: str | bytes) -> None:
        """Öğeyi ekler."""
        for position in self._positions(item):
            self._bits[position >> 3] |= 1 << (position & 7)
        self._added += 1

    def __contains__(self, item: object) -> bool:
        if not isinstance(item, (str, bytes)):
            return False
        return all(self._bits[p >> 3] & (1 << (p & 7)) for p in self._positions(item))

    def expected_false_positive_rate(self) -> float:
        """Şu anki doluluğa göre kuramsal yanlış pozitif olasılığı."""
        return (1 - math.exp(-self._k * self._added / self._m)) ** self._k
