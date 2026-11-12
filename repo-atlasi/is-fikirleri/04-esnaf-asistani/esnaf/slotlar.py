"""Randevu slot motoru: çalışma saatleri, hizmet süreleri, çakışmalar ve tatiller.

Saf fonksiyonlardır; veritabanı ya da saat okumaz. "Şimdi" ve dolu aralıklar
parametre olarak gelir, bu yüzden testler deterministiktir.

Izgara: aday saatler her çalışma aralığının kendi açılışından adim_dk adımlarla üretilir
(09:45'te açılan ve 30 dk adımlı bir salonda 09:45, 10:15, …). Kapanış 24:00 olabilir;
60 dk'lık 23:00 seansı gece yarısında biter ve geçerlidir.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from .yapilandirma import Hizmet, Isletme

_DAKIKA = timedelta(minutes=1)


@dataclass(frozen=True)
class Dolu:
    """Mevcut bir randevunun kapladığı aralık."""

    kaynak: str
    baslangic: datetime
    bitis: datetime


def bos_kaynak(isletme: Isletme, bas: datetime, bit: datetime, dolu: list[Dolu]) -> str | None:
    """[bas, bit) aralığında boş olan ilk kaynağı (personel/koltuk/saha) döndürür."""
    for kaynak in isletme.kaynaklar:
        if not any(d.kaynak == kaynak and d.baslangic < bit and bas < d.bitis for d in dolu):
            return kaynak
    return None


def _gun_basi(an: datetime) -> datetime:
    return datetime.combine(an.date(), datetime.min.time())


def _acilis(isletme: Isletme, bas: datetime, bit: datetime) -> int | None:
    """[bas, bit) tamamen bir çalışma aralığının içindeyse o aralığın açılış dakikasını döndürür."""
    if bas.date() in isletme.tatiller:
        return None
    bas_dk = (bas - _gun_basi(bas)) // _DAKIKA
    bit_dk = (bit - _gun_basi(bas)) // _DAKIKA  # gece yarısında biten seans: 1440
    for acilis, kapanis in isletme.saatler[bas.weekday()]:
        if acilis <= bas_dk and bit_dk <= kapanis:
            return acilis
    return None


def _ufuk_icinde(isletme: Isletme, bas: datetime, simdi: datetime) -> bool:
    en_erken = simdi + timedelta(minutes=isletme.en_erken_dk)
    return bas >= en_erken and bas.date() <= simdi.date() + timedelta(days=isletme.en_gec_gun)


def uygun_kaynak(isletme: Isletme, hizmet: Hizmet, bas: datetime, dolu: list[Dolu], simdi: datetime) -> str | None:
    """Belirli bir başlangıç saati uygunsa kaynağı, değilse None döndürür (rezervasyon anında yeniden denetim)."""
    bit = bas + timedelta(minutes=hizmet.sure_dk)
    acilis = _acilis(isletme, bas, bit)
    if acilis is None or bas.second or bas.microsecond or not _ufuk_icinde(isletme, bas, simdi):
        return None
    if ((bas - _gun_basi(bas)) // _DAKIKA - acilis) % isletme.adim_dk:  # aralığın ızgarasına uymuyor
        return None
    return bos_kaynak(isletme, bas, bit, dolu)


def _gun_adaylari(isletme: Isletme, gun: date) -> Iterator[datetime]:
    """Her çalışma aralığının açılışından kapanışına kadar adim_dk aralıklı aday saatler."""
    gun_basi = datetime.combine(gun, datetime.min.time())
    for acilis, kapanis in isletme.saatler[gun.weekday()]:
        for dakika in range(acilis, kapanis, isletme.adim_dk):
            yield gun_basi + timedelta(minutes=dakika)


def bos_slotlar(
    isletme: Isletme,
    hizmet: Hizmet,
    dolu: list[Dolu],
    simdi: datetime,
    baslangic: date | None = None,
    adet: int = 6,
    tek_gun: bool = False,
    seyrek_dk: int = 0,
) -> list[tuple[datetime, str]]:
    """baslangic gününden itibaren en fazla `adet` boş (saat, kaynak) çifti döndürür.

    seyrek_dk > 0 ise öneriler arasında en az o kadar dakika bırakılır (10:00, 11:00, ...).
    """
    gun = max(baslangic or simdi.date(), simdi.date())
    son_gun = gun if tek_gun else simdi.date() + timedelta(days=isletme.en_gec_gun)
    sonuc: list[tuple[datetime, str]] = []
    while gun <= son_gun and len(sonuc) < adet:
        for an in _gun_adaylari(isletme, gun):
            kaynak = uygun_kaynak(isletme, hizmet, an, dolu, simdi)
            if kaynak and (not sonuc or an - sonuc[-1][0] >= timedelta(minutes=seyrek_dk)):
                sonuc.append((an, kaynak))
                if len(sonuc) >= adet:
                    break
        gun += timedelta(days=1)
    return sonuc
