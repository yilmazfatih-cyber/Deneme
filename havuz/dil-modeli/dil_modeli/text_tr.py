"""Türkçe'ye uygun büyük/küçük harf çevirme.

Python'un `str.upper()` / `str.lower()` işlevleri Türkçe'de yanlıştır: "i".upper() "I" verir
(doğrusu "İ"), "I".lower() "i" verir (doğrusu "ı"). Bu pakette harf çevirme yalnız buradaki
işlevlerle yapılır; tests/test_rules.py başka yerde `.upper()` / `.lower()` kullanımını yakalar.

Genişletme: Derlemi küçük harfe çevirmek gibi bir ön işleme ekleyecekseniz bu işlevleri kullanın.
"""

from __future__ import annotations

_UPPER = str.maketrans({"i": "İ", "ı": "I"})
_LOWER = str.maketrans({"İ": "i", "I": "ı"})


def upper_tr(text: str) -> str:
    """Türkçe kurallarıyla büyük harf: i -> İ, ı -> I."""
    return text.translate(_UPPER).upper()  # tr-kural-muaf


def lower_tr(text: str) -> str:
    """Türkçe kurallarıyla küçük harf: İ -> i, I -> ı."""
    return text.translate(_LOWER).lower()  # tr-kural-muaf
