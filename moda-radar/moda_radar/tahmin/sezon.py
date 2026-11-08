"""Sezon kodu yardımcıları.

Sözleşmeler:
- Sezon kodu ``SS27`` / ``FW27``. Sıra: ... FW26 < SS27 < FW27 < SS28 ... (yarım yıl = 1 sezon).
- Defile takvimi: SS defileleri önceki yılın Eylül/Ekim'i (``SS27`` → 2026-09-15),
  FW defileleri aynı yılın Şubat/Mart'ı (``FW27`` → 2027-02-20).
- Türkiye perakende takvimi: ``SSyy`` raf sezonu Ocak–Haziran (yeni ürün girişi Ocak–Mart),
  ``FWyy`` raf sezonu Temmuz–Aralık (yeni ürün girişi Temmuz–Eylül).
- Gecikme, podyum sezonunun defile tarihinden raf girişine kadar geçen süredir; birimi sezon (182,625 gün).
  Örn. lüks segmentte 1 sezon gecikme: SS27 defilesi (Eylül 2026) → SS27 rafı (Mart 2027).
"""

from __future__ import annotations

from datetime import date, timedelta

from moda_radar.sema import SEZON_DESENI

SEZON_GUN = 182.625
"""Bir sezonun (yarım yılın) gün karşılığı."""

AYLAR = (
    "",
    "Ocak",
    "Şubat",
    "Mart",
    "Nisan",
    "Mayıs",
    "Haziran",
    "Temmuz",
    "Ağustos",
    "Eylül",
    "Ekim",
    "Kasım",
    "Aralık",
)


def ayristir(sezon: str) -> tuple[int, str]:
    """``"SS27"`` → ``(2027, "SS")``."""
    if not isinstance(sezon, str) or not SEZON_DESENI.match(sezon):
        raise ValueError(f"geçersiz sezon kodu: {sezon!r} (SS27 veya FW27 biçiminde olmalı)")
    return 2000 + int(sezon[2:]), sezon[:2]


def _sira(sezon: str) -> int:
    yil, tur = ayristir(sezon)
    return yil * 2 + (0 if tur == "SS" else 1)


def _koddan(sira: int) -> str:
    yil, kalan = divmod(sira, 2)
    if not 2000 <= yil <= 2099:
        raise ValueError("sezon 2000–2099 aralığı dışında")
    return f"{'SS' if kalan == 0 else 'FW'}{yil % 100:02d}"


def sirala(sezonlar) -> list[str]:
    """Sezonları takvim sırasına dizer (FW26 < SS27 < FW27)."""
    return sorted(sezonlar, key=_sira)


def fark(baslangic: str, bitis: str) -> int:
    """``fark("SS25", "SS27") == 4``; bitiş önce ise negatif."""
    return _sira(bitis) - _sira(baslangic)


def ekle(sezon: str, n: int) -> str:
    """``ekle("SS27", 2) == "SS28"``; ``n`` negatif olabilir."""
    return _koddan(_sira(sezon) + int(n))


def defile_tarihi(sezon: str) -> date:
    """Podyum sezonunun temsili defile tarihi (moda haftaları ortası)."""
    yil, tur = ayristir(sezon)
    if tur == "SS":
        return date(yil - 1, 9, 15)
    return date(yil, 2, 20)


def gunden_sezona(gun: float) -> float:
    return gun / SEZON_GUN


def raf_tarihi(sezon: str, gecikme_sezon: float) -> date:
    """Defile tarihi + gecikme: beklenen raf girişi (ham, takvime oturtulmamış)."""
    return defile_tarihi(sezon) + timedelta(days=round(gecikme_sezon * SEZON_GUN))


def _takvime_oturt(t: date) -> tuple[str, int]:
    """Ham tarihi Türkiye perakende giriş penceresine oturtur: (raf sezonu, ay)."""
    y, m = t.year, t.month
    if m <= 3:
        return f"SS{y % 100:02d}", m
    if m <= 5:
        return f"SS{y % 100:02d}", 3  # geç SS girişi: Mart dalgası
    if m == 6:
        return f"FW{y % 100:02d}", 7
    if m <= 9:
        return f"FW{y % 100:02d}", m
    if m <= 11:
        return f"FW{y % 100:02d}", 9  # geç FW girişi: Eylül dalgası
    return f"SS{(y + 1) % 100:02d}", 1


def raf_donemi(sezon: str, gecikme_sezon: float) -> str:
    """Beklenen raf dönemi, ör. ``raf_donemi("SS27", 1) == "SS27-Mart"``."""
    raf_sezon, ay = _takvime_oturt(raf_tarihi(sezon, gecikme_sezon))
    return f"{raf_sezon}-{AYLAR[ay]}"


def ufuk_sezonu(sezon: str, gecikme_sezon: float) -> str:
    """Tahminin ufku: podyum sezonu + gecikme sonrasında düşülen raf sezonu (``raf_donemi`` ön eki)."""
    return raf_donemi(sezon, gecikme_sezon).split("-")[0]


def raf_penceresi(raf_sezon: str) -> tuple[date, date]:
    """Raf sezonunun takvim aralığı: SSyy → Ocak–Haziran, FWyy → Temmuz–Aralık."""
    yil, tur = ayristir(raf_sezon)
    if tur == "SS":
        return date(yil, 1, 1), date(yil, 6, 30)
    return date(yil, 7, 1), date(yil, 12, 31)
