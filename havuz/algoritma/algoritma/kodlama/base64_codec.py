"""Base64 (RFC 4648): baytları 64 güvenli karakterle metne çevirir ve geri çözer; URL-güvenli sürüm.

Fikir:
    Her 3 bayt (24 bit) 6'şar bitlik 4 parçaya bölünür; her parça 64 harfli alfabeden bir
    karakterdir (A–Z, a–z, 0–9, "+", "/"). Sonda 1 ya da 2 bayt artarsa eksik bitler 0 ile
    doldurulur ve çıktı "=" ile 4'ün katına tamamlanır. Çıktı girdiden %33 büyüktür.
    Çözme tersini yapar ve GEÇERSİZ girdiyi reddeder: alfabe dışı karakter, yanlış dolgu, dolgu
    bitlerinin sıfır olmaması (aynı baytların tek bir doğru kodlaması olsun diye).
    URL-güvenli sürümde "+" → "-", "/" → "_" kullanılır.
    Not: Base64 bir şifreleme DEĞİLDİR; yalnız gösterimdir.

Karmaşıklık: kodlama ve çözme O(n); yer O(n)
Ne zaman: ikili veriyi metin taşıyan kanallarda (JSON, e-posta, URL, veri URI'si) göndermek.
Ne zaman değil: Python'da `base64` modülü (C ile yazılmış) kullanın; bu dosya biçimi gösterir ve
    başka dile taşınacak sürümün başvurusudur (testler stdlib ile eşliği denetler).
Bağımlılık: yok
Genişletme: Base32 için 5 bayt → 8 karakter gruplarıyla aynı yapı (alfabe 32 harf).

Örnek:
    >>> b64encode(b"Merhaba"), b64decode("TWVyaGFiYQ==")
    ('TWVyaGFiYQ==', b'Merhaba')
    >>> b64encode("çğ".encode(), url_safe=True)
    'w6fEnw=='
"""

from __future__ import annotations

_STANDARD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
_URL_SAFE = _STANDARD[:62] + "-_"


def b64encode(data: bytes, url_safe: bool = False) -> str:
    """Baytları Base64 metnine çevirir (dolgulu)."""
    alphabet = _URL_SAFE if url_safe else _STANDARD
    out: list[str] = []
    for i in range(0, len(data), 3):
        chunk = data[i : i + 3]
        value = int.from_bytes(chunk + b"\x00" * (3 - len(chunk)), "big")  # 24 bit
        chars = [alphabet[(value >> shift) & 0x3F] for shift in (18, 12, 6, 0)]
        keep = len(chunk) + 1  # 1 bayt → 2 karakter, 2 → 3, 3 → 4
        out.append("".join(chars[:keep]) + "=" * (4 - keep))
    return "".join(out)


def b64decode(text: str, url_safe: bool = False) -> bytes:
    """Base64 metnini çözer; geçersiz girdide ne olduğunu söyleyen ValueError."""
    alphabet = _URL_SAFE if url_safe else _STANDARD
    index = {char: i for i, char in enumerate(alphabet)}
    if len(text) % 4:
        raise ValueError("Base64 metninin uzunluğu 4'ün katı olmalı (dolgu '=' eksik olabilir)")
    out = bytearray()
    for i in range(0, len(text), 4):
        group = text[i : i + 4]
        padding = len(group) - len(group.rstrip("="))
        if padding > 2 or (padding and i + 4 != len(text)) or "=" in group.rstrip("="):
            raise ValueError(f"{i}. konumda geçersiz '=' dolgusu")
        value = 0
        for char in group[: 4 - padding]:
            if char not in index:
                raise ValueError(f"Base64 alfabesinde olmayan karakter: {char!r}")
            value = value << 6 | index[char]
        value <<= 6 * padding
        raw = value.to_bytes(3, "big")
        if padding and int.from_bytes(raw[3 - padding :], "big"):
            raise ValueError("dolgu bitleri sıfır değil: kodlama kanonik değil")
        out += raw[: 3 - padding]
    return bytes(out)
