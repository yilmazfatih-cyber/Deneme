"""E-posta başlıkları: Türkçe metin için RFC 2047 "encoded-word", adres biçimi, katlama, enjeksiyon
koruması.

    "Toplantı özeti"  →  "=?utf-8?b?VG9wbGFudMSxIMO2emV0aQ==?="   (her kodlu sözcük ≤ 75 karakter)
    ("Ayşe Yılmaz", "ayse@ornek.test") → "=?utf-8?b?QXnFn2UgWcSxbG1heg==?= <ayse@ornek.test>"
Başlık enjeksiyonu: konu ya da ad alanına "\\r\\nBcc: kurban@…" sokulursa ileti GİZLİCE başka
alıcılara gidebilir. Bu yüzden başlık değerinde CR/LF olması `HeaderInjectionError` verir (sessizce
silinmez).
Genişletme: Q-kodlama (=XX) üretmek gerekirse `encode_word`'e bir `q` seçeneği ekleyin; çözücü zaten
tanır.
"""

from __future__ import annotations

import base64
import binascii
import codecs
import re

_ENCODED_WORD_RE = re.compile(r"=\?([^?\s]+)\?([bBqQ])\?([^?\s]*)\?=")
_ADDRESS_RE = re.compile(r"[^\s@<>()\[\],;:\"\\]+@[A-Za-z0-9.\-]+")
_SPECIALS = set('()<>[]:;@\\,."')
WORD_BYTES = 45  # 45 bayt → 60 base64 karakteri → "=?utf-8?b?" + 60 + "?=" = 72 ≤ 75


class HeaderInjectionError(ValueError):
    """Başlık değeri satır sonu içeriyor (başlık enjeksiyonu girişimi)."""


def check_value(value: str) -> str:
    if "\r" in value or "\n" in value or "\x00" in value:
        raise HeaderInjectionError(
            "Başlık değeri satır sonu ya da NUL içeremez (enjeksiyon engellendi)."
        )
    return value


def encode_word(text: str) -> str:
    """Yazdırılabilir ASCII ise olduğu gibi; değilse UTF-8 B-kodlu sözcükler (harf ortasından
    bölmeden).
    """
    check_value(text)
    if text.isascii() and text.isprintable() and "=?" not in text:
        return text
    words, chunk = [], ""
    for char in text:
        if len((chunk + char).encode("utf-8")) > WORD_BYTES:
            words.append(chunk)
            chunk = ""
        chunk += char
    words.append(chunk)
    return " ".join(f"=?utf-8?b?{base64.b64encode(w.encode()).decode()}?=" for w in words)


def _decode_q(text: str) -> bytes:
    raw = text.replace("_", " ").encode("ascii", "replace")
    return re.sub(rb"=([0-9A-Fa-f]{2})", lambda m: bytes([int(m.group(1), 16)]), raw)


def _decode_one(match: re.Match[str]) -> str:
    charset, kind, payload = match.group(1).split("*")[0], match.group(2).lower(), match.group(3)
    try:
        data = (
            base64.b64decode(payload + "=" * (-len(payload) % 4))
            if kind == "b"
            else _decode_q(payload)
        )
        codecs.lookup(charset)
    except (binascii.Error, LookupError, ValueError):
        return match.group(0)  # çözülemeyen sözcük olduğu gibi kalır
    return data.decode(charset, errors="replace")


def decode_words(value: str) -> str:
    """Kodlu sözcükleri çözer; iki kodlu sözcük arasındaki boşluk yok sayılır (RFC 2047 §6.2)."""
    value = re.sub(r"(\?=)\s+(?==\?)", r"\1", value)
    return _ENCODED_WORD_RE.sub(_decode_one, value)


def format_address(name: str, address: str) -> str:
    check_value(name)
    check_value(address)
    if not _ADDRESS_RE.fullmatch(address):
        raise ValueError(f"Geçersiz e-posta adresi: {address!r}")
    if not name:
        return address
    if not name.isascii():
        return f"{encode_word(name)} <{address}>"
    if _SPECIALS & set(name):
        escaped = name.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}" <{address}>'
    return f"{name} <{address}>"


def fold(name: str, value: str, width: int = 78) -> str:
    """ "Ad: değer" satırını boşluklardan bölerek ≤ width karakterlik satırlara katlar (devam satırı
    boşlukla).
    """
    check_value(value)
    lines: list[str] = []
    current = f"{name}:"
    for word in value.split(" "):
        if len(current) + 1 + len(word) > width and current.strip() and current != f"{name}:":
            lines.append(current)
            current = ""
        current += f" {word}"
    lines.append(current)
    return "\r\n".join(lines)
