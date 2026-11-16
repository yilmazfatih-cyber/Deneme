"""Tarih/saat araçları: şimdiki zaman, iki tarih arası gün, tarihe gün ekleme.

Küçük modeller bugünün tarihini BİLMEZ ve tarih aritmetiğinde sık yanılır; bu araçlar verir.
Saat dışarıdan verilir (`saat` parametresi) ki testler belirlenimci olsun.
Kabul edilen tarih yazımları: 2026-11-16, 16.11.2026, 16/11/2026, "16 Kasım 2026".
Kim kullanır: ajan (hazır araç), mcp sunucusu.
Genişletme: yeni tarih biçimi → `tarih_coz`'a ekleyin ve testine örnek yazın.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from yz.arac.tanim import Arac
from yz.metin import kucuk_tr

GUNLER = ("Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar")
AYLAR = (
    "ocak", "şubat", "mart", "nisan", "mayıs", "haziran",
    "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık",
)  # fmt: skip


def tarih_coz(metin: str) -> date:
    """Türkçe ya da ISO yazılmış tarihi çözer; anlaşılmazsa `ValueError`."""
    try:
        return _tarih_coz(metin.strip())
    except ValueError as hata:
        if "YYYY-AA-GG" in str(hata):
            raise
        raise ValueError(f"Geçersiz tarih: {metin!r} ({hata}). Biçim: YYYY-AA-GG.") from None


def _tarih_coz(duz: str) -> date:
    eslesme = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", duz)
    if eslesme:
        return date(int(eslesme[1]), int(eslesme[2]), int(eslesme[3]))
    eslesme = re.fullmatch(r"(\d{1,2})[./](\d{1,2})[./](\d{4})", duz)
    if eslesme:
        return date(int(eslesme[3]), int(eslesme[2]), int(eslesme[1]))
    eslesme = re.fullmatch(r"(\d{1,2})\s+([^\W\d_]+)\s+(\d{4})", duz)
    if eslesme and kucuk_tr(eslesme[2]) in AYLAR:
        return date(int(eslesme[3]), AYLAR.index(kucuk_tr(eslesme[2])) + 1, int(eslesme[1]))
    raise ValueError(f"Tarih anlaşılamadı: {duz!r}. Biçim: YYYY-AA-GG (ör. 2026-11-16).")


def _yaz(gun: date) -> str:
    return f"{gun.isoformat()} ({GUNLER[gun.weekday()]})"


def zaman_araclari(
    saat: Callable[[], datetime] | None = None, saat_dilimi: str = "Europe/Istanbul"
) -> list[Arac]:
    """Tarih/saat araçlarını kurar. `saat` verilmezse sistem saati kullanılır."""
    bolge = ZoneInfo(saat_dilimi)

    def suan() -> datetime:
        return saat() if saat is not None else datetime.now(bolge)

    def simdi() -> str:
        """Bugünün tarihini, haftanın gününü ve şu anki saati verir."""
        an = suan()
        return f"{_yaz(an.date())}, saat {an:%H:%M} ({saat_dilimi})"

    def tarih_farki(baslangic: str, bitis: str) -> str:
        """İki tarih arasındaki gün sayısını verir (bitis - baslangic).

        Args:
            baslangic: İlk tarih, ör. 2026-01-01.
            bitis: İkinci tarih, ör. 2026-03-15.
        """
        fark = (tarih_coz(bitis) - tarih_coz(baslangic)).days
        return f"{fark} gün"

    def tarih_ekle(tarih: str, gun: int) -> str:
        """Tarihe gün ekler; eksi sayı geriye gider. Sonucu haftanın günüyle verir.

        Args:
            tarih: Başlangıç tarihi, ör. 2026-11-16 ya da "bugün".
            gun: Eklenecek gün sayısı, ör. 30 ya da -7.
        """
        bugun_mu = kucuk_tr(tarih.strip()) in ("bugün", "bugun", "today")
        baslangic = suan().date() if bugun_mu else tarih_coz(tarih)
        return _yaz(baslangic + timedelta(days=gun))

    return [Arac(simdi), Arac(tarih_farki), Arac(tarih_ekle)]
