"""Bloom süzgeci: "bu anahtar bu SSTable'da KESİNLİKLE yok" diyebilen küçük bit dizisi.

Yanlış negatif yoktur (eklenen anahtar için hep True); yanlış pozitif oranı anahtar başına bit
sayısına bağlıdır (10 bit/anahtar ≈ %1). Konumlar çift karma (double hashing) ile bulunur:
blake2b'nin 16 baytlık özeti iki 64 bitlik sayıya bölünür, i. konum = (h1 + i·h2) mod m. Bayt
biçimi: bit_sayısı(4, LE) | karma_sayısı(1) | bitler(⌈m/8⌉ bayt).

Genişletme: bloklu Bloom (önbellek dostu) ya da Ribbon süzgeci; `to_bytes`/`from_bytes` biçimi
sürümlenmeli.
"""

from __future__ import annotations

import hashlib
import math
import struct
from collections.abc import Iterable

_HEADER = struct.Struct("<IB")


def _positions(key: bytes, num_bits: int, num_hashes: int) -> list[int]:
    digest = hashlib.blake2b(key, digest_size=16).digest()
    h1 = int.from_bytes(digest[:8], "little")
    h2 = int.from_bytes(digest[8:], "little") | 1  # tek sayı: ardışık konumlar çakışmasın
    return [(h1 + i * h2) % num_bits for i in range(num_hashes)]


class BloomFilter:
    """Sabit boyutlu Bloom süzgeci."""

    def __init__(self, num_bits: int, num_hashes: int, bits: bytes | None = None) -> None:
        if num_bits <= 0 or not 1 <= num_hashes <= 30:
            raise ValueError("num_bits > 0 ve 1 <= num_hashes <= 30 olmalı")
        self.num_bits = num_bits
        self.num_hashes = num_hashes
        size = (num_bits + 7) // 8
        self._bits = bytearray(bits) if bits is not None else bytearray(size)
        if len(self._bits) != size:
            raise ValueError("bit dizisinin uzunluğu num_bits ile uyuşmuyor")

    @classmethod
    def for_keys(cls, keys: Iterable[bytes], bits_per_key: int = 10) -> BloomFilter:
        """Verilen anahtarlar için uygun boyutta süzgeç kurar ve anahtarları ekler."""
        key_list = list(keys)
        num_bits = max(64, len(key_list) * bits_per_key)
        num_hashes = max(1, min(30, round(bits_per_key * math.log(2))))
        bloom = cls(num_bits, num_hashes)
        for key in key_list:
            bloom.add(key)
        return bloom

    def add(self, key: bytes) -> None:
        for pos in _positions(key, self.num_bits, self.num_hashes):
            self._bits[pos >> 3] |= 1 << (pos & 7)

    def might_contain(self, key: bytes) -> bool:
        """False ise anahtar kesinlikle eklenmemiştir; True ise belki eklenmiştir."""
        return all(
            self._bits[pos >> 3] & (1 << (pos & 7))
            for pos in _positions(key, self.num_bits, self.num_hashes)
        )

    def to_bytes(self) -> bytes:
        return _HEADER.pack(self.num_bits, self.num_hashes) + bytes(self._bits)

    @classmethod
    def from_bytes(cls, data: bytes) -> BloomFilter:
        num_bits, num_hashes = _HEADER.unpack_from(data, 0)
        return cls(num_bits, num_hashes, data[_HEADER.size :])
