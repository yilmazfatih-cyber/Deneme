"""Türkçe'ye duyarlı metin yardımcıları: büyük/küçük harf ve Unicode biçim birliği (NFC).

Kim kullanır: sınıf (klasör) adları, etiket istemleri, dosya adı süzgeçleri.
Python'un `str.lower()` / `str.upper()` çağrıları Türkçe'de yanlıştır ("I".lower() == "i",
"İ".lower() iki karakter üretir). Bu yüzden paketin başka hiçbir yerinde bu çağrılar kullanılmaz;
`tests/test_rules.py` bunu denetler. ASCII tanımlayıcılar (uzantı, lisans kodu) için `lower_ascii`.
Kaynak: `havuz/ince-ayar/ince_ayar/text_tr.py` (kısaltılıp uyarlandı).

macOS dosya adlarını çoğu kez ayrışık (NFD) yazar: "çanta" klasörü "c" + birleşen çengel olarak gelir
ve Windows'tan gelen "çanta" ile aynı sınıf sayılmaz. `nfc` bunu düzeltir; sınıf adları hep NFC'dir.

Genişletme: yeni bir dönüşüm gerekiyorsa buraya ekleyin ve `tests/test_text_tr.py` içine örnek yazın.
"""

from __future__ import annotations

import unicodedata


def lower_tr(text: str) -> str:
    """Türkçe küçük harf: I → ı, İ → i."""
    return text.replace("I", "ı").replace("İ", "i").lower()


def upper_tr(text: str) -> str:
    """Türkçe büyük harf: i → İ, ı → I."""
    return text.replace("i", "İ").replace("ı", "I").upper()


def lower_ascii(text: str) -> str:
    """Yalnız ASCII tanımlayıcılar için (dosya uzantısı, biçim adı, lisans kodu)."""
    return text.lower()


def nfc(text: str) -> str:
    """Unicode NFC biçimi: ayrışık (NFD) harfleri tek karaktere birleştirir."""
    return unicodedata.normalize("NFC", text)
