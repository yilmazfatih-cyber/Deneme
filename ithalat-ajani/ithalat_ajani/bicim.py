"""Türkçe sayı biçimi (binlik nokta, ondalık virgül) ve Türkiye saati."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

TRT = timezone(timedelta(hours=3), "TRT")  # Türkiye: UTC+3, yaz saati yok


def sayi(x: float, basamak: int = 0) -> str:
    metin = f"{x:,.{basamak}f}"
    return metin.replace(",", "\0").replace(".", ",").replace("\0", ".")


def tl(x: float) -> str:
    tam = abs(x) >= 100 or abs(x - round(x)) < 0.05
    return f"{sayi(x, 0 if tam else 1)} TL"


def usd(x: float) -> str:
    return f"{sayi(x, 0 if abs(x) >= 100 else 2)} $"


def yuzde(x: float, basamak: int | None = 0) -> str:
    """basamak=None: tam sayıysa ondalıksız, değilse bir ondalık (%0,5; %21,5; %30)."""
    deger = x * 100
    if basamak is None:
        basamak = 0 if abs(deger - round(deger)) < 0.05 else 1
    return f"%{sayi(deger, basamak)}"


def kat(x: float) -> str:
    return sayi(x, 2)


def tr_saati(an: datetime | None = None) -> datetime:
    """Zamanı Türkiye saatine çevirir (saat dilimsizse yerel saat sayılır); saniye hassasiyeti."""
    an = an or datetime.now().astimezone()
    if an.tzinfo is None:
        an = an.astimezone()
    return an.astimezone(TRT).replace(microsecond=0)
