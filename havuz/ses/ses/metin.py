"""Türkçe'ye duyarlı harf dönüşümü ve küçük metin yardımcıları.

Neden var: Python'un `str.lower()` / `str.upper()` işlevleri Türkçe'de yanlıştır ("I".lower() → "i",
"i".upper() → "I"). Pakette harf dönüşümü YALNIZ buradaki `kucuk_tr` / `buyuk_tr` ile yapılır;
protokol sözcükleri (JSON alanı, dosya uzantısı, HTTP başlığı) için `kucuk_ascii` kullanılır.
Kural testi: tests/test_kurallar.py. Kaynak: havuz/yz/yz/metin.py (kopyalandı, kısaltıldı).
Genişletme: yeni bir harf kuralı gerekirse tablolara ekleyin ve tests/test_metin.py'ye örnek yazın.
"""

from __future__ import annotations

import unicodedata

_KUCUK_TABLO = str.maketrans({"I": "ı", "İ": "i"})
_BUYUK_TABLO = str.maketrans({"i": "İ", "ı": "I"})
_SAPKA_TABLO = str.maketrans("âîûÂÎÛ", "aiuAİU")


def kucuk_tr(metin: str) -> str:
    """Türkçe kurala göre küçük harfe çevirir ("IŞIK" → "ışık", "İZMİR" → "izmir")."""
    return unicodedata.normalize("NFC", metin).translate(_KUCUK_TABLO).lower()


def buyuk_tr(metin: str) -> str:
    """Türkçe kurala göre büyük harfe çevirir ("ışık" → "IŞIK", "izmir" → "İZMİR")."""
    return unicodedata.normalize("NFC", metin).translate(_BUYUK_TABLO).upper()


def kucuk_ascii(metin: str) -> str:
    """Protokol sözcükleri için düz küçük harf ("WAV" → "wav"). Türkçe metinde KULLANMAYIN."""
    return metin.lower()


def sapkasiz(metin: str) -> str:
    """Şapkalı harfleri düzler ("kâr" → "kar", "hâlâ" → "hala"). Ölçümde yazım farkını siler."""
    return metin.translate(_SAPKA_TABLO)


def bas_harf_buyuk_mu(sozcuk: str) -> bool:
    """Sözcüğün ilk harfi büyük mü? ("Dünya" → True, "dünya" → False, "3." → False)."""
    return bool(sozcuk) and sozcuk[0].isalpha() and sozcuk[0] == buyuk_tr(sozcuk[0])
