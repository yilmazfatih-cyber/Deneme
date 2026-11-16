"""Türkçe metin yardımcıları: büyük/küçük harf, ASCII'ye indirgeme, sıralama anahtarı.

Python'ın ``str.upper()`` / ``str.lower()`` işlevleri Türkçe için YANLIŞ sonuç verir
("i".upper() → "I", "I".lower() → "i", "İ".lower() → "i̇"). Bu pakette büyük/küçük harf
dönüşümü HER ZAMAN buradaki ``upper_tr`` / ``lower_tr`` ile yapılır; kural testi
(``tests/test_rules.py``) çıplak ``.upper()`` / ``.lower()`` çağrısını yakalar.
Genişletme: yeni bir harf eşlemesi gerekiyorsa aşağıdaki tablolara ekleyin; başka yerde tablo
kurmayın.
"""

from __future__ import annotations

import re

_UPPER_MAP = str.maketrans({"i": "İ", "ı": "I"})
_LOWER_MAP = str.maketrans({"I": "ı", "İ": "i"})

# Türkçe harfleri en yakın ASCII harfe indirger (eşleştirme ve dosya adı üretimi için).
_ASCII_MAP = str.maketrans(
    {
        "ç": "c", "Ç": "C", "ğ": "g", "Ğ": "G", "ı": "i", "İ": "I", "ö": "o", "Ö": "O",
        "ş": "s", "Ş": "S", "ü": "u", "Ü": "U", "â": "a", "Â": "A", "î": "i", "Î": "I",
        "û": "u", "Û": "U",
    }
)  # fmt: skip

# Türk alfabesinin sırası; q, w, x alfabede yoktur ama yabancı sözcükler için araya yerleştirilir.
_ALPHABET_ORDER = "abcçdefgğhıijklmnoöpqrsştuüvwxyz"
_ORDER_INDEX = {ch: i for i, ch in enumerate(_ALPHABET_ORDER)}

_NON_ALNUM = re.compile(r"[^0-9a-z]+")
_SPACES = re.compile(r"\s+")


def upper_tr(text: str) -> str:
    """Türkçe kurallarıyla büyük harfe çevirir: i → İ, ı → I."""
    return text.translate(_UPPER_MAP).upper()  # tr-ok: eşleme önce uygulandı


def lower_tr(text: str) -> str:
    """Türkçe kurallarıyla küçük harfe çevirir: I → ı, İ → i."""
    return text.translate(_LOWER_MAP).lower()  # tr-ok: eşleme önce uygulandı


def capitalize_tr(word: str) -> str:
    """Sözcüğün ilk harfini büyük, kalanını küçük yapar (Türkçe kurallarıyla)."""
    if not word:
        return word
    return upper_tr(word[0]) + lower_tr(word[1:])


def title_tr(text: str) -> str:
    """Her sözcüğün ilk harfini büyütür; boşluk ve tireyle ayrılan parçalar ayrı sözcük sayılır."""
    parts = re.split(r"([\s\-]+)", text)
    return "".join(
        part if re.fullmatch(r"[\s\-]+", part) else capitalize_tr(part) for part in parts
    )


def fold_ascii(text: str) -> str:
    """Türkçe harfleri ASCII karşılığına indirger: "Şırnak" → "Sirnak"."""
    return text.translate(_ASCII_MAP)


def squeeze_spaces(text: str) -> str:
    """Baştaki ve sondaki boşluğu atar, aradaki boşluk dizilerini tek boşluğa indirir."""
    return _SPACES.sub(" ", text).strip()


def match_key(text: str) -> str:
    """Eşleştirme anahtarı: küçük harf + ASCII + yalnız harf/rakam ("A.Ş." ile "aş" eşleşir)."""
    return _NON_ALNUM.sub("", fold_ascii(lower_tr(text)))


def slug_tr(text: str) -> str:
    """Dosya adı ve kimlik için güvenli biçim: "Şanlıurfa Merkez" → "sanliurfa-merkez"."""
    return _NON_ALNUM.sub("-", fold_ascii(lower_tr(text))).strip("-")


def sort_key_tr(text: str) -> tuple[int, ...]:
    """Türk alfabesine göre sıralama anahtarı: ``sorted(adlar, key=sort_key_tr)``.

    Alfabe dışı karakterler (rakam, boşluk, noktalama) harflerden önce gelir.
    """
    lowered = lower_tr(text)
    return tuple(_ORDER_INDEX.get(ch, -1000 + min(ord(ch), 999)) for ch in lowered)
