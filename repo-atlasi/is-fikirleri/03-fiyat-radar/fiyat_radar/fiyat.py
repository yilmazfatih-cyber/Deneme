"""Türkçe fiyat biçimleri. Para birimi kuruş cinsinden tamsayıyla tutulur (kayan nokta hatası olmaz).

"1.299,90 TL", "₺1.299,90", "1 299,90 TL", "1299,9 TL", "1.299 TL" ve JSON-LD'deki "1299.90" aynı değere çözülür
(ayar dosyası ve yapılandırılmış veri için). Sayfa metninde hangi biçimlerin fiyat sayıldığı ayristir.py'dedir.
Sıfır, negatif, sonsuz ve NaN değerler fiyat sayılmaz (None döner).
"""

import re
from decimal import Decimal, InvalidOperation

# Bölünmez boşluk (U+00A0) ve dar bölünmez boşluk (U+202F): biçimlenmiş sayılarda binlik ayırıcı olarak görülür.
BOSLUKLAR = "\u00a0\u202f"
# Rakam grupları; boşlukla ayrılan grup ancak tam 3 haneliyse binlik sayılır ("2.399,90 2.799,90" birleşmez).
_SAYI = re.compile(rf"\d+(?:[.,]\d+|[ {BOSLUKLAR}]\d{{3}}(?!\d))*")
TL_KODLARI = frozenset({"TRY", "TL", "₺"})  # ₺: Türk lirası işareti


def tl_coz(deger) -> Decimal | None:
    """Fiyat olduğu bilinen bir metni ya da sayıyı Decimal'e çevirir; okunamazsa ya da pozitif değilse None."""
    if deger is None or isinstance(deger, bool):
        return None
    if isinstance(deger, (int, float, Decimal)):
        ham = str(deger)
    else:
        m = _SAYI.search(str(deger))
        if not m:
            return None
        ham = re.sub(rf"[ {BOSLUKLAR}]", "", m.group(0))
        if "," in ham and "." in ham:  # hangisi sondaysa ondalık ayırıcı odur
            ham = ham.replace(".", "").replace(",", ".") if ham.rfind(",") > ham.rfind(".") else ham.replace(",", "")
        elif "," in ham:  # Türkçede virgül ondalıktır; "1,299" gibi 3 haneli kuyruk ise binliktir
            tam, _, kuyruk = ham.rpartition(",")
            ham = f"{tam.replace(',', '')}.{kuyruk}" if len(kuyruk) <= 2 else ham.replace(",", "")
        elif "." in ham:  # "1.299" binlik, "1299.90" ondalık
            tam, _, kuyruk = ham.rpartition(".")
            ham = ham.replace(".", "") if len(kuyruk) == 3 else f"{tam.replace('.', '')}.{kuyruk}"
    try:
        sayi = Decimal(ham)
    except InvalidOperation:
        return None
    if not sayi.is_finite() or sayi <= 0:
        return None
    return sayi.quantize(Decimal("0.01"))


def kurus(deger) -> int | None:
    tl = tl_coz(deger)
    return None if tl is None else int(tl * 100)


def tl_mi(para_birimi: str | None) -> bool:
    """Para birimi belirtilmemişse ya da TRY/TL/₺ ise True."""
    return not para_birimi or str(para_birimi).strip().upper() in TL_KODLARI


def tl_yaz(kurus_degeri: int | None) -> str:
    if kurus_degeri is None:
        return "—"
    tl, kr = divmod(abs(kurus_degeri), 100)
    return f"{'-' if kurus_degeri < 0 else ''}{tl:,}".replace(",", ".") + f",{kr:02d} TL"


def yuzde_yaz(oran: float) -> str:
    """Türkçe yazım: yüzde işareti önde, ondalık virgül: %7,7"""
    return f"%{oran:.1f}".replace(".", ",")
