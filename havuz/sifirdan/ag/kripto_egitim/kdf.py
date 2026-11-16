"""Anahtar türetme: PBKDF2 (RFC 8018) ve HKDF (RFC 5869) — sıfırdan.

PBKDF2: paroladan anahtar. HMAC'i binlerce kez zincirleyerek kaba kuvvet denemesini pahalılaştırır.
Tuz (salt) her kullanıcıya özgü ve rastgele olmalıdır; yoksa aynı parolalar aynı özeti verir ve
hazır tablolarla kırılır.
HKDF: zaten yüksek entropili bir sırdan (ör. Diffie-Hellman çıktısı) birden çok bağımsız anahtar
türetir. Parola için DEĞİLDİR (yavaşlatma yapmaz).
EĞİTSELDİR: üretimde `hashlib.pbkdf2_hmac` (ya da `hashlib.scrypt`) kullanın; saf Python sürümü çok
yavaştır.
Genişletme: scrypt/Argon2 gibi bellek-zor türeticiler buraya eklenebilir; `hashlib` ile farksal test
yazın.
"""

from __future__ import annotations

from kripto_egitim.mac import HashFactory, Hmac, hmac_digest
from kripto_egitim.sha import sha256


def pbkdf2_hmac(
    password: bytes,
    salt: bytes,
    iterations: int,
    dklen: int | None = None,
    digestmod: HashFactory = sha256,
) -> bytes:
    """PBKDF2-HMAC. `hashlib.pbkdf2_hmac("sha256", password, salt, iterations, dklen)` ile aynı
    çıktı.
    """
    if iterations < 1:
        raise ValueError("Yineleme sayısı en az 1 olmalı.")
    base = Hmac(password, digestmod=digestmod)  # parola anahtarlı iç/dış durumlar bir kez kurulur
    hlen = base.digest_size
    length = dklen if dklen is not None else hlen
    if length < 1 or length > (2**32 - 1) * hlen:
        raise ValueError("İstenen anahtar uzunluğu geçersiz.")
    blocks: list[bytes] = []
    for index in range(1, -(-length // hlen) + 1):  # tavan bölme: kaç blok gerekiyor
        mac = base.copy()
        mac.update(salt + index.to_bytes(4, "big"))
        u = mac.digest()
        accumulated = int.from_bytes(u, "big")
        for _ in range(iterations - 1):
            mac = base.copy()
            mac.update(u)
            u = mac.digest()
            accumulated ^= int.from_bytes(u, "big")  # T_i = U_1 ⊕ U_2 ⊕ … ⊕ U_c
        blocks.append(accumulated.to_bytes(hlen, "big"))
    return b"".join(blocks)[:length]


def hkdf_extract(salt: bytes | None, ikm: bytes, digestmod: HashFactory = sha256) -> bytes:
    """HKDF-Extract: PRK = HMAC(tuz, girdi anahtar malzemesi). Tuz yoksa özet uzunluğunda sıfırlar
    kullanılır.
    """
    if not salt:
        salt = b"\x00" * digestmod().digest_size
    return hmac_digest(salt, ikm, digestmod)


def hkdf_expand(prk: bytes, info: bytes, length: int, digestmod: HashFactory = sha256) -> bytes:
    """HKDF-Expand: T(i) = HMAC(PRK, T(i-1) ‖ info ‖ i); çıktı T(1) ‖ T(2) ‖ … kesilir."""
    hlen = digestmod().digest_size
    if length < 1 or length > 255 * hlen:
        raise ValueError(f"HKDF en fazla {255 * hlen} bayt üretebilir.")
    previous = b""
    output = b""
    counter = 1
    while len(output) < length:
        previous = hmac_digest(prk, previous + info + bytes([counter]), digestmod)
        output += previous
        counter += 1
    return output[:length]


def hkdf(
    ikm: bytes, salt: bytes | None, info: bytes, length: int, digestmod: HashFactory = sha256
) -> bytes:
    """Extract + Expand tek çağrıda."""
    return hkdf_expand(hkdf_extract(salt, ikm, digestmod), info, length, digestmod)
