"""Base64 ve Base32 (RFC 4648) — sıfırdan, SIKI çözme ile.

Ne yapar: baytları metne (ve geri) çevirir. Base64 her 3 baytı 4 karaktere, Base32 her 5 baytı 8
karaktere yazar.
Neden sıkı: `base64.b64decode` "QR==" gibi kanonik olmayan girdileri de kabul eder (son karakterin
kullanılmayan bitleri sıfır değil). İmza taşıyan biçimlerde (JWT) bu, aynı imzanın birden çok
yazılışına (değiştirilebilirlik) yol açar. Bu çözücüler yalnız kanonik girdiyi kabul eder.
Kim kullanır: `jwt.py` (base64url), `otp.py` (Base32 gizli anahtarlar).
EĞİTSELDİR: üretimde `base64` modülü (+ gerekiyorsa kanoniklik denetimi) kullanın.
Genişletme: yeni bir alfabe (ör. Base32hex) için `_B32` benzeri bir sabit ve iki ince sarmalayıcı
ekleyin.
"""

from __future__ import annotations

_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
_B64_URL = _B64[:62] + "-_"
_B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"


class DecodeError(ValueError):
    """Girdi seçilen alfabede kanonik bir kodlama değil."""


def _encode(data: bytes, alphabet: str, bits: int, group: int, pad: bool) -> str:
    """Ortak kodlayıcı: veriyi `bits`lik parçalara böler; `group` karakterlik öbeğe '=' ile
    tamamlar.
    """
    value = int.from_bytes(data, "big")
    total_bits = len(data) * 8
    chars = -(-total_bits // bits)  # tavan bölme
    value <<= chars * bits - total_bits  # son parçayı sağdan sıfırla doldur
    mask = (1 << bits) - 1
    out = [alphabet[(value >> (bits * (chars - 1 - i))) & mask] for i in range(chars)]
    text = "".join(out)
    if pad and len(text) % group:
        text += "=" * (group - len(text) % group)
    return text


def _decode(text: str, alphabet: str, bits: int, group: int, padded: bool) -> bytes:
    """Ortak sıkı çözücü: yabancı karakter, yanlış dolgu ya da sıfır olmayan artık bit hata
    verir.
    """
    if padded:
        if len(text) % group:
            raise DecodeError("Dolgulu girdinin uzunluğu öbek boyunun katı olmalı.")
        stripped = text.rstrip("=")
        if "=" in stripped:
            raise DecodeError("'=' yalnız sonda bulunabilir.")
    else:
        if "=" in text:
            raise DecodeError("Dolgusuz biçimde '=' bulunamaz.")
        stripped = text
    lookup = {c: i for i, c in enumerate(alphabet)}
    value = 0
    for char in stripped:
        index = lookup.get(char)
        if index is None:
            raise DecodeError(f"Alfabe dışı karakter: {char!r}")
        value = (value << bits) | index
    total_bits = len(stripped) * bits
    nbytes = total_bits // 8
    extra = total_bits - nbytes * 8
    if extra >= bits:  # bir karakter tek başına bir bayt bile taşıyamıyorsa uzunluk geçersizdir
        raise DecodeError("Girdi uzunluğu geçersiz.")
    if value & ((1 << extra) - 1):
        raise DecodeError("Kanonik olmayan kodlama: artık bitler sıfır değil.")
    if padded and len(text) - len(stripped) != (-len(stripped)) % group:
        raise DecodeError("Dolgu karakteri sayısı yanlış.")
    return (value >> extra).to_bytes(nbytes, "big")


def b64encode(data: bytes, urlsafe: bool = False, pad: bool = True) -> str:
    return _encode(data, _B64_URL if urlsafe else _B64, 6, 4, pad)


def b64decode(text: str, urlsafe: bool = False, padded: bool = True) -> bytes:
    return _decode(text, _B64_URL if urlsafe else _B64, 6, 4, padded)


def b64url_encode(data: bytes) -> str:
    """JWT'nin kullandığı biçim: URL-güvenli alfabe, dolgusuz."""
    return _encode(data, _B64_URL, 6, 4, pad=False)


def b64url_decode(text: str) -> bytes:
    return _decode(text, _B64_URL, 6, 4, padded=False)


def b32encode(data: bytes, pad: bool = True) -> str:
    return _encode(data, _B32, 5, 8, pad)


def b32decode(text: str, padded: bool = True) -> bytes:
    return _decode(text, _B32, 5, 8, padded)


def normalize_base32_secret(text: str) -> bytes:
    """Kullanıcının yazdığı TOTP anahtarını çözer: boşluk/tire atılır, küçük harf büyütülür, dolgu
    eklenir.

    Base32 alfabesi yalnız ASCII'dir; bu yüzden `str.upper()` burada Türkçe `i/İ` sorununa yol açmaz
    (ASCII dışı her karakter zaten reddedilir).
    """
    cleaned = "".join(ch for ch in text if ch not in " -\t").rstrip("=")
    if not cleaned.isascii():
        raise DecodeError("Anahtar yalnız A–Z ve 2–7 karakterlerinden oluşmalı.")
    return b32decode(cleaned.upper(), padded=False)
