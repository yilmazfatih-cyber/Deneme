"""Karar kuralı sürüm 0 (docs/PLAN.md bölüm 8). Açık ve okunur; eşikler `content/esikler.json`'dan gelir.

Sıra önemlidir; ilk tutan kural kararı verir:

1. GIRME  — yön çıkış; ya da segment uyumu < uyum_alt; ya da marj < marj_taban;
            ya da rakip ≥ rakip_yogun ve marj < segment marj hedefi ("yoğun rekabet, dar marj").
2. BEKLE  — sinyal yok ya da çelişkili (podyum var, talep yok; eksenler zıt yönde);
            ya da zamanlama "erken" ve stok riski yüksek.
3. YATIR  — ivme ≥ yatir_ivme, yön giriş/yükseliş, zamanlama "zamanında", marj ≥ hedef, risk ≤ orta.
4. DENE   — ivme dene_ivme_alt–yatir_ivme aralığında ya da zamanlama "erken"; ya da ivme yüksek ama YATIR'ın
            bir koşulu eksik. %10–20 deneme partisi.
5. BEKLE  — kalan durum: ivme < dene_ivme_alt.
"""

from __future__ import annotations

from typing import Literal

from moda_radar.sema import Karar, YatirimBoyutlari, Yon

SinyalDurumu = Literal["tutarli", "celiskili", "yok"]
YUKSELEN = (Yon.GIRIS, Yon.YUKSELIS)
YON_ADI = {"giris": "giriş", "yukselis": "yükseliş", "zirve": "zirve", "cikis": "çıkış", "duz": "düz"}
ZAMAN_ADI = {"erken": "erken", "zamaninda": "zamanında", "gec": "geç"}
RISK_ADI = {"dusuk": "düşük", "orta": "orta", "yuksek": "yüksek"}


def _s(x: float) -> str:
    """Türkçe ondalık: 0.6 → 0,60."""
    return f"{x:.2f}".replace(".", ",")


def _y(x: float) -> str:
    return f"%{x:.0f}"


def _neden(b: YatirimBoyutlari, e: dict, segment_kodu: str, sinyal: SinyalDurumu) -> tuple[Karar, str, list[str]]:
    """(karar, neden kodu, gerekçe cümleleri)."""
    hedef = e["marj_hedef"][segment_kodu]
    ivme = f"Trend ivmesi {_s(b.trend_ivmesi)}, yön {YON_ADI[b.trend_yonu.value]}."

    if b.trend_yonu == Yon.CIKIS:
        return Karar.GIRME, "cikis", [ivme, "Nitelik çıkış evresinde; yeni stok indirime kalır."]
    if b.segment_uyumu < e["uyum_alt"]:
        return (
            Karar.GIRME,
            "uyum",
            [
                f"Segment uyumu {_s(b.segment_uyumu)}, eşik {_s(e['uyum_alt'])} altında.",
                "Bu kombinasyon segmentin rafına uymuyor.",
            ],
        )
    if b.marj_yuzde < e["marj_taban"]:
        return Karar.GIRME, "marj_taban", [f"Marj {_y(b.marj_yuzde)}, taban {_y(e['marj_taban'])} altında.", ivme]
    if b.rakip_sayisi >= e["rakip_yogun"] and b.marj_yuzde < hedef:
        return (
            Karar.GIRME,
            "rekabet",
            [
                f"{b.rakip_sayisi} rakipte var; marj {_y(b.marj_yuzde)}, hedef {_y(hedef)} altında.",
                "Yoğun rekabette dar marj fiyat savaşına girer.",
            ],
        )

    if sinyal == "yok":
        return Karar.BEKLE, "sinyal_yok", ["Bu nitelik için sinyal yok; olasılık bilgi taşımıyor.", ivme]
    if sinyal == "celiskili":
        return Karar.BEKLE, "celiskili", [ivme, "Sinyaller çelişkili; podyum ve talep aynı yönü göstermiyor."]
    if b.zamanlama == "erken" and b.stok_riski == "yuksek":
        return Karar.BEKLE, "erken_riskli", [ivme, "Zamanlama erken ve stok riski yüksek."]

    eksikler = []
    if b.trend_ivmesi < e["yatir_ivme"]:
        eksikler.append(f"ivme {_s(e['yatir_ivme'])} altında")
    if b.trend_yonu not in YUKSELEN:
        eksikler.append(f"yön {YON_ADI[b.trend_yonu.value]}")
    if b.zamanlama != "zamaninda":
        eksikler.append(f"zamanlama {ZAMAN_ADI[b.zamanlama]}")
    if b.marj_yuzde < hedef:
        eksikler.append(f"marj {_y(b.marj_yuzde)} hedef {_y(hedef)} altında")
    if b.stok_riski == "yuksek":
        eksikler.append("stok riski yüksek")
    if not eksikler:
        return (
            Karar.YATIR,
            "yatir",
            [
                ivme,
                f"Zamanlama uygun, marj {_y(b.marj_yuzde)} hedef {_y(hedef)} üstünde, stok riski {RISK_ADI[b.stok_riski]}.",
            ],
        )

    parti = e["deneme_partisi_yuzde"]
    deneme = f"%{parti['alt']:g}–{parti['ust']:g} deneme partisi önerilir."
    if e["dene_ivme_alt"] <= b.trend_ivmesi or b.zamanlama == "erken":
        return Karar.DENE, "dene", [ivme, f"YATIR için eksik: {', '.join(eksikler)}.", deneme]
    return Karar.BEKLE, "ivme_dusuk", [ivme, f"İvme {_s(e['dene_ivme_alt'])} altında; deneme için erken."]


def karar_ver(
    b: YatirimBoyutlari, esikler: dict, segment_kodu: str, sinyal_durumu: SinyalDurumu = "tutarli"
) -> tuple[Karar, str]:
    """Karar ve en fazla üç cümlelik gerekçe."""
    karar, _, cumleler = _neden(b, esikler, segment_kodu, sinyal_durumu)
    return karar, " ".join(cumleler[:3])


def degistirecek_sinyal(
    b: YatirimBoyutlari,
    karar: Karar,
    esikler: dict | None = None,
    segment_kodu: str | None = None,
    sinyal_durumu: SinyalDurumu = "tutarli",
) -> str:
    """Bu kararı değiştirecek gözlenebilir sinyal (tek cümle)."""
    neden = None
    if esikler is not None and segment_kodu is not None:
        neden = _neden(b, esikler, segment_kodu, sinyal_durumu)[1]
    yatir = _s(esikler["yatir_ivme"]) if esikler else "0,60"
    dene = _s(esikler["dene_ivme_alt"]) if esikler else "0,45"
    if karar == Karar.YATIR:
        return "Talep ivmesi iki hafta üst üste negatife dönerse ya da yön zirveye geçerse DENE'ye iner."
    if karar == Karar.DENE:
        return f"Deneme partisi ilk iki haftada güçlü satar ve ivme {yatir}'ı geçerse YATIR'a çıkar; {dene} altına düşerse BEKLE'ye iner."
    if karar == Karar.BEKLE:
        if neden in ("sinyal_yok", "celiskili"):
            return f"Arama ve sosyal talep podyumu doğrular, ivme {dene}'i geçerse DENE'ye çıkar."
        if neden == "erken_riskli":
            return "Trend bir üst segmentin rafında görülür ve rakip sayısı azsa DENE'ye çıkar."
        return f"İvme {dene}'i geçerse DENE'ye çıkar."
    # GIRME
    if neden == "uyum":
        return "Segment rafında bu kombinasyon görülmeye başlarsa (≥ 2 marka) yeniden değerlendirilir."
    if neden in ("rekabet", "marj_taban"):
        return "Maliyet düşer ya da rakip sayısı eşiğin altına inerse marj yeniden hesaplanıp DENE'ye çıkabilir."
    return "Yön iki ardışık ölçümde yeniden yükselişe dönerse BEKLE'ye çıkar."
