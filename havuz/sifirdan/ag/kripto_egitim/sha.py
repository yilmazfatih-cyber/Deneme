"""SHA-256 ve SHA-1 özet işlevleri — sıfırdan (FIPS 180-4).

Ne yapar: iletiyi 64 baytlık bloklara böler, her bloğu "sıkıştırma" işlevinden geçirip 256 (ya da 160) bitlik
durumu günceller. Arayüz `hashlib` ile aynıdır (`update`, `digest`, `hexdigest`, `copy`).
Kim kullanır: `mac.py` (HMAC), `kdf.py`, `otp.py`, `jwt.py`, `asymmetric.py`.
EĞİTSELDİR: üretimde `hashlib.sha256` kullanın (C ile yazılmış, yüzlerce kat hızlı ve denetlenmiş).
SHA-1 çakışmaya karşı KIRIKTIR; yalnız eski protokoller (HOTP/TOTP, WebSocket el sıkışması) için buradadır.
Genişletme: yeni bir Merkle–Damgård özeti (ör. SHA-224) için `_BlockHash`'ten türetip başlangıç durumunu ve
`_compress`'i tanımlayın; `tests/kripto_egitim/test_sha.py` içindeki `hashlib` karşılaştırmasına ekleyin.
"""

from __future__ import annotations

import math
import struct
from typing import Self

MASK32 = 0xFFFFFFFF


def _rotr(value: int, count: int) -> int:
    """32 bitlik sağa döndürme."""
    return ((value >> count) | (value << (32 - count))) & MASK32


def _rotl(value: int, count: int) -> int:
    """32 bitlik sola döndürme."""
    return ((value << count) | (value >> (32 - count))) & MASK32


def _first_primes(count: int) -> list[int]:
    """İlk `count` asal sayı (sabitleri türetmek için; hız önemli değil)."""
    primes: list[int] = []
    candidate = 2
    while len(primes) < count:
        if all(candidate % p for p in primes):
            primes.append(candidate)
        candidate += 1
    return primes


def _icbrt(value: int) -> int:
    """Tam sayı küp kök (aşağı yuvarlanmış), ikili aramayla."""
    low, high = 0, 1 << ((value.bit_length() + 2) // 3 + 1)
    while low < high:
        mid = (low + high + 1) // 2
        if mid**3 <= value:
            low = mid
        else:
            high = mid - 1
    return low


# "Kol yenimde bir şey yok" sabitleri: gizli bir arka kapı olmadığı görülsün diye asalların köklerinden türetilir.
# K[i] = i. asalın küp kökünün kesir kısmının ilk 32 biti; H0[i] = i. asalın karekökünün kesir kısmının ilk 32 biti.
_K256 = [_icbrt(p << 96) & MASK32 for p in _first_primes(64)]
_H256 = [math.isqrt(p << 64) & MASK32 for p in _first_primes(8)]
_H1 = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0]


class _BlockHash:
    """64 baytlık bloklarla çalışan, uzunluğu sona büyük-uçlu yazan özetlerin ortak iskeleti."""

    name = ""
    block_size = 64
    digest_size = 0
    _initial: list[int] = []

    def __init__(self, data: bytes = b"") -> None:
        self._state = list(self._initial)
        self._buffer = b""
        self._length = 0  # şimdiye dek verilen toplam bayt
        if data:
            self.update(data)

    def _compress(self, block: bytes) -> None:
        raise NotImplementedError

    def update(self, data: bytes) -> None:
        """Veriyi ekler; dolan her 64 baytlık bloğu hemen sıkıştırır."""
        self._length += len(data)
        buffer = self._buffer + bytes(data)
        full = len(buffer) - len(buffer) % 64
        for offset in range(0, full, 64):
            self._compress(buffer[offset : offset + 64])
        self._buffer = buffer[full:]

    def copy(self) -> Self:
        """O anki durumun bağımsız kopyası (HMAC ve PBKDF2 bunu hız için kullanır)."""
        clone = type(self)()
        clone._state = list(self._state)
        clone._buffer = self._buffer
        clone._length = self._length
        return clone

    def digest(self) -> bytes:
        """Dolguyu (0x80, sıfırlar, 64 bit uzunluk) bir kopyaya uygular; asıl nesne `update` almayı sürdürebilir."""
        clone = self.copy()
        zeros = (55 - self._length) % 64
        padding = b"\x80" + b"\x00" * zeros + struct.pack(">Q", self._length * 8)
        clone.update(padding)
        assert not clone._buffer
        return struct.pack(f">{len(clone._state)}I", *clone._state)[: self.digest_size]

    def hexdigest(self) -> str:
        return self.digest().hex()


class Sha256(_BlockHash):
    """SHA-256: 8 sözcüklük durum, blok başına 64 tur."""

    name = "sha256"
    digest_size = 32
    _initial = _H256

    def _compress(self, block: bytes) -> None:
        w = list(struct.unpack(">16I", block))
        for i in range(16, 64):  # ileti çizelgesi: 16 sözcüğü 64'e genişlet
            s0 = _rotr(w[i - 15], 7) ^ _rotr(w[i - 15], 18) ^ (w[i - 15] >> 3)
            s1 = _rotr(w[i - 2], 17) ^ _rotr(w[i - 2], 19) ^ (w[i - 2] >> 10)
            w.append((w[i - 16] + s0 + w[i - 7] + s1) & MASK32)
        a, b, c, d, e, f, g, h = self._state
        for i in range(64):
            big_s1 = _rotr(e, 6) ^ _rotr(e, 11) ^ _rotr(e, 25)
            choose = (e & f) ^ (~e & MASK32 & g)
            temp1 = (h + big_s1 + choose + _K256[i] + w[i]) & MASK32
            big_s0 = _rotr(a, 2) ^ _rotr(a, 13) ^ _rotr(a, 22)
            majority = (a & b) ^ (a & c) ^ (b & c)
            temp2 = (big_s0 + majority) & MASK32
            h, g, f, e = g, f, e, (d + temp1) & MASK32
            d, c, b, a = c, b, a, (temp1 + temp2) & MASK32
        self._state = [(x + y) & MASK32 for x, y in zip(self._state, (a, b, c, d, e, f, g, h), strict=True)]


class Sha1(_BlockHash):
    """SHA-1: 5 sözcüklük durum, blok başına 80 tur. Çakışmaya karşı kırıktır; yalnız eski protokoller için."""

    name = "sha1"
    digest_size = 20
    _initial = _H1

    def _compress(self, block: bytes) -> None:
        w = list(struct.unpack(">16I", block))
        for i in range(16, 80):
            w.append(_rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1))
        a, b, c, d, e = self._state
        for i in range(80):
            if i < 20:
                f, k = (b & c) | (~b & MASK32 & d), 0x5A827999
            elif i < 40:
                f, k = b ^ c ^ d, 0x6ED9EBA1
            elif i < 60:
                f, k = (b & c) | (b & d) | (c & d), 0x8F1BBCDC
            else:
                f, k = b ^ c ^ d, 0xCA62C1D6
            temp = (_rotl(a, 5) + f + e + k + w[i]) & MASK32
            a, b, c, d, e = temp, a, _rotl(b, 30), c, d
        self._state = [(x + y) & MASK32 for x, y in zip(self._state, (a, b, c, d, e), strict=True)]


def sha256(data: bytes = b"") -> Sha256:
    """`hashlib.sha256` ile aynı kullanım: `sha256(b"abc").hexdigest()`."""
    return Sha256(data)


def sha1(data: bytes = b"") -> Sha1:
    """`hashlib.sha1` ile aynı kullanım."""
    return Sha1(data)
