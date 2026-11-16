"""ChaCha20, Poly1305 ve AEAD_CHACHA20_POLY1305 (RFC 8439) — sıfırdan.

ChaCha20: 256 bit anahtar + 96 bit tek-kullanımlık sayı (nonce) + 32 bit blok sayacından, "çeyrek
tur" (topla-döndür-XOR) işlemleriyle 64 baytlık anahtar akışı blokları üretir; şifreleme = metin XOR
anahtar akışı.
Poly1305: tek kullanımlık 256 bit anahtarla, iletiyi 2^130 − 5 asal cisminde bir polinom olarak
değerlendiren MAC.
AEAD: Poly1305 anahtarı ChaCha20'nin 0. bloğundan türetilir; şifreli metin + ek veri (AAD) birlikte
doğrulanır.
UYARI: aynı (anahtar, nonce) çifti İKİ KEZ kullanılırsa gizlilik de bütünlük de çöker. Nonce'u
sayaçla ya da rastgele (96 bit) üretin ve asla yinelemeyin.
EĞİTSELDİR: üretimde platform kitaplığı (ör. `cryptography` paketi, libsodium) kullanın; bu sürüm
yavaştır ve yan kanallara karşı korunmaz.
Genişletme: XChaCha20 (192 bit nonce) için HChaCha20 alt anahtar türetmesi eklenebilir.
"""

from __future__ import annotations

import struct

from kripto_egitim.mac import constant_time_equal

MASK32 = 0xFFFFFFFF
_CONSTANTS = struct.unpack("<4I", b"expand 32-byte k")
_P1305 = (1 << 130) - 5


class AuthenticationError(ValueError):
    """Etiket tutmadı: veri değiştirilmiş ya da yanlış anahtar/nonce."""


def _rotl(value: int, count: int) -> int:
    return ((value << count) | (value >> (32 - count))) & MASK32


def quarter_round(a: int, b: int, c: int, d: int) -> tuple[int, int, int, int]:
    """RFC 8439 §2.1: dört 32 bitlik sözcüğü karıştırır."""
    a = (a + b) & MASK32
    d = _rotl(d ^ a, 16)
    c = (c + d) & MASK32
    b = _rotl(b ^ c, 12)
    a = (a + b) & MASK32
    d = _rotl(d ^ a, 8)
    c = (c + d) & MASK32
    b = _rotl(b ^ c, 7)
    return a, b, c, d


def _qr(state: list[int], i: int, j: int, k: int, m: int) -> None:
    state[i], state[j], state[k], state[m] = quarter_round(state[i], state[j], state[k], state[m])


def chacha20_block(key: bytes, counter: int, nonce: bytes) -> bytes:
    """Tek bir 64 baytlık anahtar akışı bloğu (RFC 8439 §2.3)."""
    if len(key) != 32 or len(nonce) != 12:
        raise ValueError("Anahtar 32, nonce 12 bayt olmalı.")
    initial = [
        *_CONSTANTS,
        *struct.unpack("<8I", key),
        counter & MASK32,
        *struct.unpack("<3I", nonce),
    ]
    state = list(initial)
    for _ in range(10):  # 20 tur = 10 × (sütun turu + köşegen turu)
        _qr(state, 0, 4, 8, 12)
        _qr(state, 1, 5, 9, 13)
        _qr(state, 2, 6, 10, 14)
        _qr(state, 3, 7, 11, 15)
        _qr(state, 0, 5, 10, 15)
        _qr(state, 1, 6, 11, 12)
        _qr(state, 2, 7, 8, 13)
        _qr(state, 3, 4, 9, 14)
    return struct.pack("<16I", *((x + y) & MASK32 for x, y in zip(state, initial, strict=True)))


def chacha20_xor(key: bytes, counter: int, nonce: bytes, data: bytes) -> bytes:
    """Şifreleme ve çözme aynı işlemdir: veri XOR anahtar akışı (RFC 8439 §2.4)."""
    blocks = -(-len(data) // 64)
    if counter < 0 or counter + blocks > 2**32:
        raise ValueError("Blok sayacı taşar; ileti bu nonce için çok uzun.")
    out = bytearray()
    for index in range(blocks):
        stream = chacha20_block(key, counter + index, nonce)
        chunk = data[index * 64 : (index + 1) * 64]
        out += bytes(x ^ y for x, y in zip(chunk, stream, strict=False))
    return bytes(out)


def poly1305_mac(message: bytes, key: bytes) -> bytes:
    """Tek kullanımlık Poly1305 etiketi (RFC 8439 §2.5). Anahtar ASLA iki iletide kullanılmaz."""
    if len(key) != 32:
        raise ValueError("Poly1305 anahtarı 32 bayt olmalı.")
    r = int.from_bytes(key[:16], "little") & 0x0FFFFFFC0FFFFFFC0FFFFFFC0FFFFFFF  # "kelepçeleme"
    s = int.from_bytes(key[16:], "little")
    accumulator = 0
    for offset in range(0, len(message), 16):
        block = message[offset : offset + 16] + b"\x01"  # her bloğa bir üst bit eklenir
        accumulator = (accumulator + int.from_bytes(block, "little")) * r % _P1305
    return ((accumulator + s) & ((1 << 128) - 1)).to_bytes(16, "little")


def poly1305_key_gen(key: bytes, nonce: bytes) -> bytes:
    """AEAD için tek kullanımlık Poly1305 anahtarı: ChaCha20'nin 0. bloğunun ilk 32 baytı."""
    return chacha20_block(key, 0, nonce)[:32]


def _pad16(data: bytes) -> bytes:
    return b"\x00" * (-len(data) % 16)


def _mac_data(aad: bytes, ciphertext: bytes) -> bytes:
    lengths = struct.pack("<QQ", len(aad), len(ciphertext))
    return aad + _pad16(aad) + ciphertext + _pad16(ciphertext) + lengths


def aead_encrypt(
    key: bytes, nonce: bytes, plaintext: bytes, aad: bytes = b""
) -> tuple[bytes, bytes]:
    """(şifreli metin, 16 baytlık etiket) döndürür. `aad` şifrelenmez ama etikete katılır."""
    one_time_key = poly1305_key_gen(key, nonce)
    ciphertext = chacha20_xor(key, 1, nonce, plaintext)
    return ciphertext, poly1305_mac(_mac_data(aad, ciphertext), one_time_key)


def aead_decrypt(
    key: bytes, nonce: bytes, ciphertext: bytes, tag: bytes, aad: bytes = b""
) -> bytes:
    """Önce etiketi doğrular, ANCAK tutarsa çözer; tutmazsa `AuthenticationError`."""
    one_time_key = poly1305_key_gen(key, nonce)
    expected = poly1305_mac(_mac_data(aad, ciphertext), one_time_key)
    if not constant_time_equal(expected, tag):
        raise AuthenticationError("Etiket doğrulanamadı: veri değiştirilmiş olabilir.")
    return chacha20_xor(key, 1, nonce, ciphertext)
