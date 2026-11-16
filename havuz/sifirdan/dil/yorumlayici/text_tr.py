"""Türkçe büyük/küçük harf dönüşümü (i ↔ İ, ı ↔ I).

Python'un `str.upper()`'ı "i"yi "I" yapar, `"İ".lower()` ise "i\u0307" (i + birleşik nokta) verir;
ikisi de Türkçe için yanlıştır. Bu iki işlev önce Türkçe'ye özgü harfleri çevirir, kalanını
Python'a bırakır. Asıl kaynak: havuz STANDARTLAR.md §3 (`upper_tr`); her mini sistem kendi kopyasını
taşır. Genişletme: Azerice gibi başka bir dil için ayrı bir tablo ekleyin.
"""

from __future__ import annotations

_UPPER = str.maketrans({"i": "İ", "ı": "I"})
_LOWER = str.maketrans({"I": "ı", "İ": "i"})


def upper_tr(text: str) -> str:
    """'istanbul ılık' -> 'İSTANBUL ILIK'."""
    return text.translate(_UPPER).upper()  # tr-güvenli: i/ı önceden çevrildi


def lower_tr(text: str) -> str:
    """'İSTANBUL ILIK' -> 'istanbul ılık'."""
    return text.translate(_LOWER).lower()  # tr-güvenli: I/İ önceden çevrildi
