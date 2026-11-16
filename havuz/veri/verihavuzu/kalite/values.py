"""Değer yardımcıları: eksik değer işaretleri ve Türkçe/İngilizce yazılmış sayıları okuma.

Sayı okuma kuralları (``parse_number``):
  "1234" · "-12.5" · "12,5" · "1.234,56" (Türkçe binlik) · "1,234.56" (İngilizce binlik) ·
  "1 234,56" (boşluklu binlik) · baştaki/sondaki boşluk ve bölünmez boşluk hoş görülür.
  TEK ayırıcı varsa o ayırıcı ONDALIK sayılır: "1.234" = 1,234 (bin iki yüz otuz dört DEĞİL).
  Bu belirsizlik gerçektir; sütunun geri kalanına bakarak karar veren kod bunu bilmelidir.
Kullanan: ``profile``, ``checks``, ``clean``, ``drift``.
Genişletme: yeni bir sayı yazımı için ``_PATTERNS`` listesine (desen, binlik, ondalık) ekleyin.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Any

from verihavuzu.text import lower_tr

MISSING_MARKERS = frozenset({"", "null", "none", "nan", "na", "n/a", "-", "yok", "?", "#n/a"})

_PATTERNS = [
    (re.compile(r"[+-]?\d+"), None, None),
    (re.compile(r"[+-]?\d+\.\d+"), None, "."),
    (re.compile(r"[+-]?\d+,\d+"), None, ","),
    (re.compile(r"[+-]?\d{1,3}(\.\d{3})+(,\d+)?"), ".", ","),
    (re.compile(r"[+-]?\d{1,3}(,\d{3})+(\.\d+)?"), ",", "."),
    (re.compile(r"[+-]?\d{1,3}( \d{3})+(,\d+)?"), " ", ","),
]


def is_missing(value: Any) -> bool:
    """None ya da yaygın bir "boş" işareti mi ("", "NULL", "-", "yok", "N/A", "nan"…)?"""
    if value is None:
        return True
    if isinstance(value, str):
        return lower_tr(value.replace("\u00a0", " ").strip()) in MISSING_MARKERS
    return False


def parse_number(text: str) -> Decimal | None:
    """Sayı metnini ``Decimal``e çevirir; sayı değilse ``None``."""
    value = text.replace("\u00a0", " ").strip()
    for pattern, thousands, decimal in _PATTERNS:
        if pattern.fullmatch(value):
            if thousands:
                value = value.replace(thousands, "")
            if decimal == ",":
                value = value.replace(",", ".")
            try:
                return Decimal(value)
            except InvalidOperation:  # pragma: no cover - desenler bunu engeller
                return None
    return None


def decimal_places(text: str) -> int:
    """Metindeki ondalık basamak sayısı ("1.234,50" → 2, "12" → 0)."""
    number = parse_number(text)
    if number is None:
        return 0
    exponent = number.as_tuple().exponent
    return -exponent if isinstance(exponent, int) and exponent < 0 else 0


def canonical_number(text: str) -> str | None:
    """Sayıyı düz yazıma çevirir: "1.234,50" → "1234.50" (ondalık basamak sayısı korunur)."""
    number = parse_number(text)
    return None if number is None else format(number, "f")
