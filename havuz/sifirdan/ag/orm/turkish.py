"""Türkçe büyük/küçük harf dönüşümü (str.lower/upper İ/ı'yı yanlış çevirir).

    "İSTANBUL".lower()  → "i̇stanbul" (i + birleşen nokta: arama tutmaz!)
    lower_tr("İSTANBUL") → "istanbul";  upper_tr("ılık") → "ILIK"
Kim kullanır: `orm/query.py` (`icontains` için SQLite'a `tr_lower` işlevi olarak kaydedilir).
Kaynak: havuz STANDARTLAR §3 ("Python'da kendi upper_tr yardımcımız"); kopya, bağımsızlık için
burada.
Genişletme: Azerice de aynı kuralı kullanır; başka diller için ayrı işlev yazın, buna dal eklemeyin.
"""

from __future__ import annotations


def lower_tr(text: str | None) -> str | None:
    if text is None:
        return None
    return text.replace("I", "ı").replace("İ", "i").lower()


def upper_tr(text: str) -> str:
    return text.replace("i", "İ").replace("ı", "I").upper()
