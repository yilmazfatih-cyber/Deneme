"""HMAC (RFC 2104) ve sabit zamanlı karşılaştırma — sıfırdan.

Ne yapar: anahtarlı ileti doğrulama kodu. HMAC(K, m) = H((K ⊕ opad) ‖ H((K ⊕ ipad) ‖ m)). Herhangi
bir özet "fabrikası" ile çalışır: bu paketin `sha256`/`sha1`'i ya da `hashlib.sha256`,
`hashlib.sha512`.
Kim kullanır: `kdf.py` (PBKDF2, HKDF), `otp.py` (HOTP/TOTP), `jwt.py` (HS256).
EĞİTSELDİR: üretimde `hmac.new(...)` ve `hmac.compare_digest(...)` kullanın.
Genişletme: yeni bir özet eklemek için ona `block_size`, `digest_size`, `update`, `digest`, `copy`
verin; `HashObject` protokolüne uyan her şey burada çalışır.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Protocol

from kripto_egitim.sha import sha256


class HashObject(Protocol):
    """`hashlib` nesneleriyle bu paketin özet sınıflarının ortak yüzü."""

    @property
    def block_size(self) -> int: ...

    @property
    def digest_size(self) -> int: ...

    def update(self, data: bytes, /) -> None: ...

    def digest(self) -> bytes: ...

    def copy(self) -> HashObject: ...


HashFactory = Callable[[], HashObject]


class Hmac:
    """Artımlı HMAC. İç ve dış dolgulu anahtar durumları bir kez hesaplanıp `copy()` ile yeniden
    kullanılır.
    """

    def __init__(self, key: bytes, msg: bytes = b"", digestmod: HashFactory = sha256) -> None:
        probe = digestmod()
        block = probe.block_size
        if len(key) > block:  # uzun anahtar önce özetlenir (RFC 2104 §2)
            hashed = digestmod()
            hashed.update(key)
            key = hashed.digest()
        key = key.ljust(block, b"\x00")
        self.digest_size = probe.digest_size
        self.block_size = block
        self._inner = digestmod()
        self._inner.update(bytes(k ^ 0x36 for k in key))
        self._outer = digestmod()
        self._outer.update(bytes(k ^ 0x5C for k in key))
        if msg:
            self.update(msg)

    def update(self, msg: bytes) -> None:
        self._inner.update(msg)

    def copy(self) -> Hmac:
        clone = Hmac.__new__(Hmac)
        clone.digest_size = self.digest_size
        clone.block_size = self.block_size
        clone._inner = self._inner.copy()
        clone._outer = self._outer.copy()
        return clone

    def digest(self) -> bytes:
        outer = self._outer.copy()
        outer.update(self._inner.digest())
        return outer.digest()

    def hexdigest(self) -> str:
        return self.digest().hex()


def hmac_digest(key: bytes, msg: bytes, digestmod: HashFactory = sha256) -> bytes:
    """Tek seferlik HMAC; `hmac.digest(key, msg, "sha256")` karşılığı."""
    return Hmac(key, msg, digestmod).digest()


def constant_time_equal(a: bytes, b: bytes) -> bool:
    """İki bayt dizisini, ilk farkta erken dönmeden karşılaştırır.

    Neden: `a == b` ilk farklı baytta durur; saldırgan yanıt süresini ölçüp doğru imzayı bayt bayt
    tahmin edebilir. Uzunluk gizli sayılmaz (imzaların uzunluğu zaten bilinir). Python yorumlayıcısı
    tam sabit zaman garanti etmez; üretimde C ile yazılmış `hmac.compare_digest` kullanılır.
    """
    if len(a) != len(b):
        return False
    difference = 0
    for x, y in zip(a, b, strict=True):
        difference |= x ^ y
    return difference == 0
