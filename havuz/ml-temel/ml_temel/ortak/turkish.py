"""Türkçe'ye duyarlı metin yardımcıları: büyük/küçük harf, aksan sadeleştirme, alfabetik sıra.

Sorun: Python'un `str.lower()` / `str.upper()` yöntemleri Türkçe'nin noktalı/noktasız i kuralını
bilmez: "ISPARTA".lower() → "isparta" (yanlış; doğrusu "ısparta"), "İ".lower() → "i̇" (i + ayrı
nokta işareti), "izmir".upper() → "IZMIR" (yanlış; doğrusu "İZMİR"). Bu yüzden pakette `.lower()`
ve `.upper()` doğrudan ÇAĞRILMAZ (kural testi: tests/test_rules.py); yerine:

  lower_tr / upper_tr   Türkçe metin için
  lower_ascii           "NaN", "TRUE" gibi İngilizce anahtar sözcükleri karşılaştırmak için

Kim kullanır: `onisleme.text` (belirteçleme), `tablo.csv_reader`, raporlar.
Genişletme: yeni bir harf eşlemesi gerekiyorsa aşağıdaki tablolara ekleyin ve testini yazın.
"""

from __future__ import annotations

import unicodedata

_LOWER_TR = str.maketrans({"I": "ı", "İ": "i"})
_UPPER_TR = str.maketrans({"i": "İ", "ı": "I"})
_ASCII_LOWER = str.maketrans("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz")
_FOLD = str.maketrans(
    "çğıöşüâîûÇĞİÖŞÜÂÎÛ",
    "cgiosuaiuCGIOSUAIU",
)
_ALPHABET = "abcçdefgğhıijklmnoöprsştuüvyz"
_ORDER = {letter: position for position, letter in enumerate(_ALPHABET)}


def lower_tr(text: str) -> str:
    """Türkçe kuralıyla küçük harf: I → ı, İ → i (ayrık nokta işareti bırakmaz)."""
    return unicodedata.normalize("NFC", text).translate(_LOWER_TR).lower()  # kural-izni: tr


def upper_tr(text: str) -> str:
    """Türkçe kuralıyla büyük harf: i → İ, ı → I."""
    return unicodedata.normalize("NFC", text).translate(_UPPER_TR).upper()  # kural-izni: tr


def lower_ascii(text: str) -> str:
    """Yalnız A–Z harflerini küçültür; İngilizce anahtar sözcük karşılaştırması içindir."""
    return text.translate(_ASCII_LOWER)


def fold_ascii_tr(text: str) -> str:
    """Türkçe harfleri ASCII karşılığına indirger (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u).

    "Turkce karaktersiz" yazılmış metinlerle doğru yazılmışları aynı belirtece düşürmek içindir.
    """
    return unicodedata.normalize("NFC", text).translate(_FOLD)


def sort_key_tr(text: str) -> tuple[tuple[int, int], ...]:
    """Türk alfabesine göre sıralama anahtarı: `sorted(kelimeler, key=sort_key_tr)`.

    ç, c'den hemen sonra; ı, i'den önce gelir. Alfabe dışı karakterler harflerden sonra,
    kendi kod noktası sırasıyla dizilir.
    """
    lowered = lower_tr(text)
    return tuple((_ORDER.get(char, len(_ALPHABET)), ord(char)) for char in lowered)
