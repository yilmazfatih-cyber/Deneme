"""Beş yatırım boyutu (PLAN bölüm 8). Her boyut ayrı hesaplanır; birleştirilmez (ilke 6).

1. Trend ivmesi = tahmin.olasilik, yön = tahmin.yon
2. Segment uyumu = ürünün siluet / kumaş / desen / detay değerlerinin segment profiliyle uyumu (uzman önseli)
3. Zamanlama = trendin segment rafına varış sezonu (tahmin.ufuk_sezon) ile satın alma takvimi karşılaştırması
4. Marj = (hedef fiyat − adet maliyeti) / hedef fiyat · 100
5. Stok riski = moda rengi mi temel renk mi, olasılık ve rakip yoğunluğu
"""

from __future__ import annotations

import math
import re
from datetime import date
from typing import Literal

from moda_radar.sema import SEZON_DESENI, SegmentTanimi, TahminKaydi, YatirimBoyutlari
from moda_radar.yatirim import ayar, segment_profili

AY_ADLARI = (
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
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


# --- Sezon ve takvim -------------------------------------------------------------------------------------------


def sezon_sirasi(sezon: str) -> int:
    """SS27 → 2027·2, FW27 → 2027·2+1. Sezonlar arası fark sezon cinsinden çıkar."""
    if not SEZON_DESENI.match(sezon):
        raise ValueError(f"sezon biçimi tanınmadı: {sezon}")
    return (2000 + int(sezon[2:])) * 2 + (0 if sezon.startswith("SS") else 1)


def sezon_ekle(sezon: str, n: int) -> str:
    """sezon_ekle("SS27", -3) == "FW25"."""
    yil, kalan = divmod(sezon_sirasi(sezon) + n, 2)
    return f"{'SS' if kalan == 0 else 'FW'}{yil % 100:02d}"


def siradaki_sezon(bugun: date) -> str:
    """Sipariş penceresi açık ya da en yakın olan sezon (Haziran–Kasım → gelecek SS, Aralık–Mayıs → FW)."""
    yy = bugun.year % 100
    if 6 <= bugun.month <= 11:
        return f"SS{yy + 1:02d}"
    if bugun.month == 12:
        return f"FW{yy + 1:02d}"
    return f"FW{yy:02d}"


def siparis_penceresi(sezon: str, takvim: dict) -> tuple[date, date]:
    """Sezonun Türkiye satın alma (sipariş) penceresi: SS için önceki yıl Eylül–Kasım, FW için Mart–Mayıs."""
    t = takvim[sezon[:2]]
    yil = 2000 + int(sezon[2:]) + t["yil_farki"]
    son_ay = t["son_ay"]
    son = date(yil, son_ay, 28) if son_ay == 2 else date(yil, son_ay, 30 if son_ay in (4, 6, 9, 11) else 31)
    return date(yil, t["bas_ay"], 1), son


def pencere_metni(sezon: str, takvim: dict) -> str:
    bas, son = siparis_penceresi(sezon, takvim)
    return f"{AY_ADLARI[bas.month - 1]}–{AY_ADLARI[son.month - 1]} {son.year}"


def zamanlama_hesapla(
    tahmin: TahminKaydi, hedef_sezon: str, bugun: date, takvim: dict
) -> tuple[Literal["erken", "zamaninda", "gec"], str]:
    """Trendin segment rafına varışı (ufuk_sezon) ile hedef satış sezonunun sipariş penceresini karşılaştırır.

    - Sipariş penceresi kapandıysa: gec.
    - Trend bu segmente hedef sezondan en az bir sezon sonra varıyorsa: erken (raf henüz hazır değil).
    - Trend hedef sezondan en az bir sezon önce varmışsa: gec (rakipler rafta, zirve geçiyor).
    - Aynı sezonsa: zamaninda.
    """
    _, son = siparis_penceresi(hedef_sezon, takvim)
    pencere = pencere_metni(hedef_sezon, takvim)
    gecikme = f"podyum→raf gecikmesi {tahmin.gecikme_sezon:g} sezon ({tahmin.gecikme_kaynagi})"
    if bugun > son:
        return "gec", f"{hedef_sezon} sipariş penceresi ({pencere}) kapandı; {gecikme}."
    try:
        fark = sezon_sirasi(tahmin.ufuk_sezon) - sezon_sirasi(hedef_sezon)
    except ValueError:
        return "zamaninda", f"Ufuk sezonu okunamadı ({tahmin.ufuk_sezon}); sipariş penceresi {pencere}."
    if fark >= 1:
        return (
            "erken",
            f"Trend bu segmente {tahmin.ufuk_sezon}'de varıyor, {hedef_sezon}'den {fark} sezon sonra; {gecikme}.",
        )
    if fark <= -1:
        return (
            "gec",
            f"Trend bu segmente {tahmin.ufuk_sezon}'de vardı, {hedef_sezon}'den {-fark} sezon önce; {gecikme}.",
        )
    return "zamaninda", f"Trend {hedef_sezon} rafıyla örtüşüyor; sipariş penceresi {pencere}; {gecikme}."


# --- Renk -------------------------------------------------------------------------------------------------------


def hex_lab(hex_: str) -> tuple[float, float, float]:
    """sRGB (D65) → CIELAB. Yalnız nötr/moda rengi ayrımı için; renk bilimi modülünün yerini tutmaz."""
    rgb = [int(hex_[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    x = (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047
    y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
    z = (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883

    def f(t: float) -> float:
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116

    fx, fy, fz = f(x), f(y), f(z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def renk_ailesi(hex_: str | None, kural: dict) -> Literal["notr", "moda", "bilinmiyor"]:
    """Temel (nötr) renk mi moda rengi mi. Nötr: düşük kroma (beyaz-gri-siyah), lacivert, toprak (bej-taba-kahve)."""
    if not hex_ or not HEX.match(hex_):
        return "bilinmiyor"
    L, a, b = hex_lab(hex_)
    kroma = math.hypot(a, b)
    ton = math.degrees(math.atan2(b, a)) % 360
    if kroma <= kural["kroma_ust"]:
        return "notr"
    lv = kural["lacivert"]
    if L <= lv["L_ust"] and lv["ton_alt"] <= ton <= lv["ton_ust"] and kroma <= lv["kroma_ust"]:
        return "notr"
    tp = kural["toprak"]
    if tp["ton_alt"] <= ton <= tp["ton_ust"] and kroma <= tp["kroma_ust"]:
        return "notr"
    return "moda"


# --- Boyutlar ---------------------------------------------------------------------------------------------------


def segment_uyumu(urun: dict, segment_kodu: str, agirliklar: dict[str, float]) -> float:
    toplam = sum(agirliklar.values())
    puan = sum(
        w * segment_profili.deger(segment_kodu, eksen, urun.get(eksen, "bilinmiyor")) for eksen, w in agirliklar.items()
    )
    return round(puan / toplam, 3)


def _kategori_anahtari(kategori: str) -> str:
    return kategori.replace("-", "_")


def hedef_fiyat_bul(segment: SegmentTanimi, maliyet: dict | None, kategori: str) -> tuple[float, str]:
    if maliyet and segment.kod in maliyet.get("hedef_satis_fiyati", {}):
        b = maliyet["hedef_satis_fiyati"][segment.kod]
        return (b["alt"] + b["ust"]) / 2, f"segment hedef fiyat bandının ortası ({b['alt']:g}–{b['ust']:g} TL)"
    k = _kategori_anahtari(kategori)
    alt, ust = segment.fiyat_bandi_try.get(f"{k}_alt"), segment.fiyat_bandi_try.get(f"{k}_ust")
    if alt is None or ust is None:
        raise ValueError(f"{segment.kod} için {kategori} fiyat bandı yok; hedef fiyat verin")
    return (alt + ust) / 2, f"segment fiyat bandının ortası ({alt:g}–{ust:g} TL)"


def maliyet_bul(urun: dict, segment_kodu: str, maliyet: dict) -> tuple[float, str]:
    """Kumaş bandının ortası + desen ve detay ek maliyeti."""
    kumas = urun.get("kumas_gorunumu", "bilinmiyor")
    tablo = maliyet["kumas_maliyeti"]
    if kumas in tablo:
        b = tablo[kumas][segment_kodu]
        taban, aciklama = (b["alt"] + b["ust"]) / 2, f"{kumas} bandı ortası {b['alt']:g}–{b['ust']:g} TL"
    else:
        ortalar = [(t[segment_kodu]["alt"] + t[segment_kodu]["ust"]) / 2 for t in tablo.values()]
        taban, aciklama = sum(ortalar) / len(ortalar), "kumaş bilinmiyor, kumaş ortalaması"
    seviyeler = maliyet["ek_maliyet_seviyeleri"][segment_kodu]
    ek = 0.0
    for alan, eksen in (("desen_ek_maliyet", "desen"), ("detay_ek_maliyet", "detay")):
        seviye = maliyet[alan].get(urun.get(eksen, "bilinmiyor"), "dusuk")
        if seviye != "yok":
            ek += seviyeler[seviye]
            aciklama += f" + {eksen} {seviye} {seviyeler[seviye]:g} TL"
    return taban + ek, f"tahmini bant: {aciklama}"


def stok_riski_hesapla(
    aile: str, olasilik: float, yon: str, rakip: int | None, esikler: dict
) -> tuple[Literal["dusuk", "orta", "yuksek"], str]:
    sira = ["dusuk", "orta", "yuksek"]
    alt = esikler["stok_riski"]["moda_rengi_ivme_alt"]
    if aile == "notr":
        seviye, neden = 0, "temel renk"
    elif olasilik < alt:
        seviye, neden = 2, f"moda rengi ve olasılık {olasilik:.2f} < {alt:.2f}".replace(".", ",")
    else:
        seviye, neden = 1, "moda rengi" if aile == "moda" else "renk ailesi bilinmiyor"
    if rakip is not None and rakip >= esikler["rakip_yogun"]:
        seviye = max(seviye + 1, 1)
        neden += f"; {rakip} rakipte var (yoğun)"
    elif rakip is None:
        neden += "; rakip sayısı bilinmiyor"
    else:
        neden += f"; {rakip} rakip"
    if yon == "zirve":
        seviye += 1
        neden += "; yön zirve"
    return sira[min(seviye, 2)], neden  # type: ignore[return-value]


def hesapla_ayrintili(
    tahmin: TahminKaydi,
    urun: dict,
    segment: SegmentTanimi,
    maliyet: dict | None = None,
    hedef_fiyat: float | None = None,
    maliyet_adet: float | None = None,
    rakip_sayisi: int | None = None,
    bugun: date | None = None,
    esikler: dict | None = None,
) -> tuple[YatirimBoyutlari, dict]:
    """Beş boyutu ve her birinin açıklamasını döner."""
    e = esikler or ayar.esikler()
    bugun = bugun or date.today()
    kategori = urun.get("kategori", tahmin.kategori)

    uyum = segment_uyumu(urun, segment.kod, e["uyum_agirliklari"])
    zaman, zaman_aciklama = zamanlama_hesapla(tahmin, urun.get("sezon", tahmin.sezon), bugun, e["satin_alma_takvimi"])

    if hedef_fiyat is None:
        fiyat, fiyat_kaynagi = hedef_fiyat_bul(segment, maliyet, kategori)
    else:
        fiyat, fiyat_kaynagi = float(hedef_fiyat), "kullanıcı"
    if fiyat <= 0:
        raise ValueError("hedef fiyat pozitif olmalı")
    if maliyet_adet is not None:
        mal, mal_kaynagi = float(maliyet_adet), "kullanıcı"
    elif maliyet is not None:
        mal, mal_kaynagi = maliyet_bul(urun, segment.kod, maliyet)
    else:
        raise ValueError(f"{kategori} için maliyet bandı yok (content/maliyet/{kategori}.json); maliyet verin")
    marj = round((fiyat - mal) / fiyat * 100, 1)

    aile = urun.get("renk_ailesi") or renk_ailesi(urun.get("renk_hex"), e["notr_renk"])
    risk, risk_aciklama = stok_riski_hesapla(aile, tahmin.olasilik, tahmin.yon.value, rakip_sayisi, e)

    b = YatirimBoyutlari(
        trend_ivmesi=round(tahmin.olasilik, 3),
        trend_yonu=tahmin.yon,
        segment_uyumu=uyum,
        zamanlama=zaman,
        marj_yuzde=marj,
        stok_riski=risk,
        rakip_sayisi=rakip_sayisi or 0,
    )
    ayrinti = {
        "hedef_fiyat": round(fiyat, 2),
        "hedef_fiyat_kaynagi": fiyat_kaynagi,
        "maliyet": round(mal, 2),
        "maliyet_kaynagi": mal_kaynagi,
        "marj_hedef": e["marj_hedef"][segment.kod],
        "zamanlama_aciklama": zaman_aciklama,
        "renk_ailesi": aile,
        "stok_aciklama": risk_aciklama,
        "rakip_bilinmiyor": rakip_sayisi is None,
        "uyum_aciklama": "uzman önseli segment profili (veriyle güncellenecek)",
    }
    return b, ayrinti


def hesapla(
    tahmin: TahminKaydi,
    urun: dict,
    segment: SegmentTanimi,
    maliyet: dict | None = None,
    hedef_fiyat: float | None = None,
    maliyet_adet: float | None = None,
    rakip_sayisi: int | None = None,
    bugun: date | None = None,
    esikler: dict | None = None,
) -> YatirimBoyutlari:
    return hesapla_ayrintili(tahmin, urun, segment, maliyet, hedef_fiyat, maliyet_adet, rakip_sayisi, bugun, esikler)[0]
