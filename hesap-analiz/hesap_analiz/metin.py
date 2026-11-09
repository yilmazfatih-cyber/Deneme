"""Türkçe metin yardımcıları: büyük harf, sadeleştirme, gürültü ayıklama."""

from __future__ import annotations

import re
import unicodedata

_TR_BUYUK = str.maketrans("iıçğöşü", "İIÇĞÖŞÜ")
_TR_SADE = str.maketrans("İIÇĞÖŞÜçğöşüı", "IICGOSUcgosui")


def buyuk(metin: str) -> str:
    """Türkçe kurallarla büyük harf (i → İ, ı → I)."""
    return (metin or "").translate(_TR_BUYUK).upper()


def sade(metin: str) -> str:
    """Karşılaştırma için: büyük harf, Türkçe karakterler ASCII'ye, tek boşluk."""
    m = buyuk(metin).translate(_TR_SADE)
    m = unicodedata.normalize("NFKD", m)
    m = "".join(c for c in m if not unicodedata.combining(c))
    m = re.sub(r"[^A-Z0-9 ]+", " ", m)
    return re.sub(r"\s+", " ", m).strip()


_IBAN = re.compile(r"\bTR\d{2}(?:\s?\d{4}){5}\s?\d{2}\b|\bTR\d{24}\b", re.I)
_UZUN_SAYI = re.compile(r"\b\d{6,}\b")
_TARIH = re.compile(r"\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b")
_SAAT = re.compile(r"\b\d{1,2}:\d{2}(?::\d{2})?\b")
_TUTAR = re.compile(r"\b\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\b\s*(?:TL|TRY|₺)?", re.I)
_KART_MASKE = re.compile(r"\b\d{4,6}\*{2,}\d{2,4}\b|\*{4,}\d{4}")

# Açıklamalarda sık geçen, karşı tarafı anlatmayan kelimeler
GURULTU = {
    "EFT", "FAST", "HAVALE", "TRANSFER", "GELEN", "GIDEN", "GONDEREN", "ALICI",
    "ALAN", "HESAP", "HESABA", "HESAPTAN", "IBAN", "REF", "REFERANS", "NO", "ISLEM",
    "ACIKLAMA", "ODEME", "ODEMESI", "TUTAR", "TL", "TRY", "POS", "HARCAMA",
    "KREDI", "KARTI", "KART", "INTERNET", "MOBIL", "SUBE", "ATM", "PARA", "YATIRMA",
    "CEKME", "CEKIM", "TAKSIT", "TAKSITLI", "PESIN", "UCRET", "UCRETI", "KOMISYON",
    "BSMV", "KDV", "MASRAF", "VIRMAN", "OTOMATIK", "TALIMAT", "TALIMATI", "DUZENLI",
    "AD", "SOYAD", "UNVAN", "SN", "SAYIN", "VE", "ILE", "DEN", "DAN", "ICIN",
    "GONDERIM", "ALIM", "SATIS", "BANKASI", "BANKA", "AS", "A", "S", "LTD", "STI",
    "TIC", "SAN", "TICARET", "SANAYI", "ANONIM", "SIRKETI", "LIMITED", "TURKIYE",
    "TR", "ISTANBUL", "ANKARA", "IZMIR", "MERKEZ", "ONLINE", "E", "TICARET",
    "GUNLUK", "AYLIK", "KARSILIGI", "BORC", "ALACAK", "IADE", "IADESI",
}


def gurultu_ayikla(metin: str) -> str:
    """IBAN, uzun sayı, tarih, saat, tutar ve kart maskelerini siler."""
    m = metin or ""
    for desen in (_IBAN, _KART_MASKE, _TUTAR, _TARIH, _SAAT, _UZUN_SAYI):
        m = desen.sub(" ", m)
    return re.sub(r"\s+", " ", m).strip()


def anlamli_kelimeler(metin: str) -> list[str]:
    """Gürültü ve rakamlar atıldıktan sonra kalan harf kelimeleri (sade biçimde)."""
    s = sade(gurultu_ayikla(metin))
    return [k for k in s.split() if k.isalpha() and len(k) > 1 and k not in GURULTU]


def iban_bul(metin: str) -> str:
    """Açıklamadaki ilk IBAN'ı boşluksuz büyük harfle döndürür; yoksa boş metin."""
    m = _IBAN.search(metin or "")
    return re.sub(r"\s+", "", m.group(0)).upper() if m else ""


def iban_maskele(iban: str) -> str:
    """Rapor ve dosyalarda IBAN'ın tamamı yerine TR12 **** 1234 biçimi."""
    return f"{iban[:4]} **** {iban[-4:]}" if len(iban) >= 8 else iban
