"""İşletmenin yerel saati: "şimdi" sunucunun saat diliminden bağımsızdır.

Bulut sunucuların çoğu UTC'de çalışır; İstanbul'daki bir berber için 15:00, UTC'de 12:00'dir.
Bu yüzden tüm "şimdi" hesapları işletmenin saat dilimiyle (varsayılan Europe/Istanbul) yapılır
ve slot motoruna saat dilimsiz (naive) yerel saat olarak verilir.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

# Türkiye Eylül 2016'dan beri yıl boyu UTC+3 kullanır. Sistemde tzdata yoksa bu sabit yedek kullanılır.
_YEDEK: dict[str, tzinfo] = {"Europe/Istanbul": timezone(timedelta(hours=3), "+03")}


def saat_dilimi(ad: str) -> tzinfo:
    """IANA adından saat dilimi; bilinmeyen adda anlaşılır bir ValueError verir."""
    try:
        return ZoneInfo(ad)
    except (ZoneInfoNotFoundError, ValueError) as hata:
        if ad in _YEDEK:
            return _YEDEK[ad]
        raise ValueError(f"Bilinmeyen saat dilimi: {ad!r} (sistemde tzdata kurulu mu?)") from hata


def yerel_saat(ad: str, utc_saat: Callable[[], datetime] | None = None) -> Callable[[], datetime]:
    """Dakikaya yuvarlanmış, saat dilimsiz yerel "şimdi" döndüren bir fonksiyon üretir.

    utc_saat: testlerde sabit bir an vermek için; saat dilimli (aware) datetime döndürmelidir.
    """
    bolge = saat_dilimi(ad)
    kaynak = utc_saat or (lambda: datetime.now(timezone.utc))

    def simdi() -> datetime:
        return kaynak().astimezone(bolge).replace(tzinfo=None, second=0, microsecond=0)

    return simdi
