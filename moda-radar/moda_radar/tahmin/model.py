"""Sürüm 0 olasılık modeli: açık, belgelenmiş, elle ayarlı logit kuralı (docs/PLAN.md bölüm 6).

Hedef: ``P(raf payı ≥ eşik)``; ufuk = podyum sezonu + segment gecikmesi (``sezon.ufuk_sezonu``).

Logit uzayında::

    z = g · [ K_PAY·(ln(1 + 100·pay) − ln(1 + 100·PAY_REF)) + K_MARKA·(ln(1 + marka) − ln(1 + MARKA_REF)) ]
        + YON_ETKISI[yön] + K_UYUM·ln(kırp(raf/eşik, 1/8, 4))        (yalnız segmentte geçmiş raf payı varsa)
    olasılık = kırp(σ(z), 0,05, 0,95)

- Temel olasılık 0,5: tipik bir sinyal (pay %5, 5 marka, yön düz, segment geçmişi yok) σ(0) = 0,5 verir;
  pay ve marka çeşitliliği log ölçekte artırır, referansın altı azaltır.
- ``g = min(1, güven / GUVEN_TAM)``: düşük güvenli (ör. yalnız rapor kaynaklı) sinyalin podyum etkisi kırpılır.
- Yön, podyum payı zaman serisinden (önceki sezona oran) hesaplanır.
- Segment uyumu: segmentin bilinen en son raf payı eşikteyse nötr; eşiğin iki katında +0,83, yarısında −0,83
  (raf payının sezondan sezona log ölçekte sürmesi; perakendede en güçlü tek öngörücü).
- Sinyal yoksa olasılık 0,5, ``kaynak_sayisi = 0``.

Katsayılar el ile seçildi (sürüm 0); sürüm 1 bunları geriye test verisiyle lojistik regresyonla öğrenecek.
"""

from __future__ import annotations

import math

from moda_radar.sema import GozlemKaydi, SegmentDosyasi, SinyalKaydi, TahminKaydi, Yon
from moda_radar.tahmin import gecikme as gk
from moda_radar.tahmin import sezon as sz

K_PAY = 0.6
K_MARKA = 0.3
PAY_REF = 0.05
MARKA_REF = 5
K_UYUM = 1.2
UYUM_ALT, UYUM_UST = 0.125, 4.0
GUVEN_TAM = 0.6
YON_ETKISI = {Yon.GIRIS: 0.3, Yon.YUKSELIS: 0.4, Yon.ZIRVE: 0.0, Yon.DUZ: 0.0, Yon.CIKIS: -0.6}
YUKSELIS_ORANI = 1.2
CIKIS_ORANI = 0.8
ALT_SINIR, UST_SINIR = 0.05, 0.95
ESIK_RAF_PAYI = 0.04

YON_ADI = {
    Yon.GIRIS: "yeni giriş",
    Yon.YUKSELIS: "yükseliş",
    Yon.ZIRVE: "zirve",
    Yon.DUZ: "yatay seyir",
    Yon.CIKIS: "çıkış",
}


def _sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))


def _yuzde(x: float) -> str:
    return f"%{x * 100:.1f}".replace(".", ",")


def _sayi(x: float) -> str:
    return f"{x:.1f}".replace(".", ",")


def birlesik_sinyal(kayitlar: list[SinyalKaydi]) -> dict | None:
    """Bir sezonun aynı değere ait sinyallerini güven ağırlıklı birleştirir."""
    if not kayitlar:
        return None
    toplam_g = sum(max(k.guven, 1e-6) for k in kayitlar)
    pay = sum(k.podyum_payi * max(k.guven, 1e-6) for k in kayitlar) / toplam_g
    return {
        "pay": pay,
        "marka": max(k.marka_sayisi for k in kayitlar),
        "guven": max(k.guven for k in kayitlar),
        "n": len(kayitlar),
    }


def yon_hesapla(seri: dict[str, float], sezon: str) -> Yon:
    """Podyum payı serisinden (sezon → pay) hedef sezonun yönü."""
    simdi = seri.get(sezon, 0.0)
    onceki = seri.get(sz.ekle(sezon, -1), 0.0)
    daha_onceki = seri.get(sz.ekle(sezon, -2), 0.0)
    if simdi <= 0:
        return Yon.CIKIS if onceki > 0 else Yon.DUZ
    if onceki <= 0:
        return Yon.GIRIS
    oran = simdi / onceki
    if oran >= YUKSELIS_ORANI:
        return Yon.YUKSELIS
    if oran <= CIKIS_ORANI:
        return Yon.CIKIS
    if daha_onceki > 0 and onceki / daha_onceki >= YUKSELIS_ORANI:
        return Yon.ZIRVE
    return Yon.DUZ


def _segment_gecmisi(gozlemler, ulke, segment, kategori, eksen, deger) -> tuple[float | None, int]:
    """Segment rafında aynı değerin bilinen en son raf payı ve kayıt sayısı."""
    ilgili = [
        g
        for g in gozlemler
        if g.ulke == ulke
        and g.segment == segment
        and g.kategori == kategori
        and g.nitelik_ekseni == eksen
        and g.nitelik_degeri == deger
        and g.raf_payi is not None
    ]
    if not ilgili:
        return None, 0
    en_son = max(ilgili, key=lambda g: (g.son_gorulme, g.ilk_gorulme))
    return en_son.raf_payi, len(ilgili)


def _segment_tanimi(segmentler: SegmentDosyasi, segment: str):
    for s in segmentler.segmentler:
        if s.kod == segment:
            return s
    raise ValueError(f"segment bulunamadı: {segment!r}")


def segment_gecikmesi(sinyaller, gozlemler, segmentler: SegmentDosyasi, segment: str, kategori: str | None = None):
    """``gecikme.olc`` sarmalayıcısı: segmentin önseliyle ölçer."""
    tanim = _segment_tanimi(segmentler, segment)
    return gk.olc(sinyaller, gozlemler, segment, dict(tanim.gecikme_onsel), kategori=kategori)


def tahmin_et(
    sezon: str,
    ulke: str,
    segment: str,
    kategori: str,
    eksen: str,
    deger: str,
    sinyaller: list[SinyalKaydi],
    gozlemler: list[GozlemKaydi],
    segmentler: SegmentDosyasi,
    model_surumu: str = "v0",
    *,
    esik_raf_payi: float = ESIK_RAF_PAYI,
    gecikme: tuple | None = None,
) -> TahminKaydi:
    """Bir nitelik değerinin segmentte ufuk sezonunda raf payı ≥ eşik olma olasılığı.

    ``gecikme``: önceden hesaplanmış ``gecikme.olc`` sonucu (toplu tahminde tekrar ölçmemek için).
    """
    sz.ayristir(sezon)
    if gecikme is None:
        gecikme = segment_gecikmesi(sinyaller, gozlemler, segmentler, segment, kategori)
    else:
        _segment_tanimi(segmentler, segment)
    gecikme_sezon, gecikme_kaynagi = float(gecikme[0]), gecikme[1]
    ufuk = sz.ufuk_sezonu(sezon, gecikme_sezon)
    raf_donemi = sz.raf_donemi(sezon, gecikme_sezon)
    gecikme_cumlesi = (
        f"Segment gecikmesi {_sayi(gecikme_sezon)} sezon ({gecikme_kaynagi}); beklenen raf dönemi {raf_donemi}."
    )

    degere_ait = [s for s in sinyaller if s.nitelik_ekseni == eksen and s.nitelik_degeri == deger]
    bu_sezon = [s for s in degere_ait if s.sezon == sezon]
    ortak = {
        "sezon": sezon,
        "ulke": ulke,
        "segment": segment,
        "kategori": kategori,
        "nitelik_ekseni": eksen,
        "nitelik_degeri": deger,
        "esik_raf_payi": esik_raf_payi,
        "ufuk_sezon": ufuk,
        "gecikme_sezon": max(gecikme_sezon, 0.0),
        "gecikme_kaynagi": gecikme_kaynagi,
        "model_surumu": model_surumu,
    }
    if not bu_sezon:
        return TahminKaydi(
            **ortak,
            olasilik=0.5,
            yon=Yon.DUZ,
            kaynak_sayisi=0,
            gerekce=f"Bu nitelik için podyum sinyali yok. {gecikme_cumlesi}",
        )

    seri: dict[str, float] = {}
    for s_ in sz.sirala({s.sezon for s in degere_ait}):
        seri[s_] = birlesik_sinyal([s for s in degere_ait if s.sezon == s_])["pay"]
    b = birlesik_sinyal(bu_sezon)
    yon = yon_hesapla(seri, sezon)
    g = min(1.0, b["guven"] / GUVEN_TAM)
    podyum = K_PAY * (math.log1p(100 * b["pay"]) - math.log1p(100 * PAY_REF)) + K_MARKA * (
        math.log1p(b["marka"]) - math.log1p(MARKA_REF)
    )
    z = g * podyum + YON_ETKISI[yon]
    raf, raf_n = _segment_gecmisi(gozlemler, ulke, segment, kategori, eksen, deger)
    if raf is not None:
        z += K_UYUM * math.log(min(max(raf / esik_raf_payi, UYUM_ALT), UYUM_UST))
    olasilik = min(max(_sigmoid(z), ALT_SINIR), UST_SINIR)

    guven_notu = " (düşük güvenli kaynak, etkisi kırpıldı)" if g < 1 else ""
    c1 = f"Podyum payı {_yuzde(b['pay'])}, {b['marka']} markada görüldü{guven_notu}; önceki sezona göre {YON_ADI[yon]}."
    c3 = (
        f"Segment rafında bilinen son pay {_yuzde(raf)}."
        if raf is not None
        else "Segment rafında bu değer için geçmiş kayıt yok."
    )
    return TahminKaydi(
        **ortak,
        olasilik=round(olasilik, 4),
        yon=yon,
        kaynak_sayisi=b["n"] + raf_n,
        gerekce=f"{c1} {gecikme_cumlesi} {c3}",
    )


def toplu_tahmin(
    sezon: str,
    ulke: str,
    segment: str,
    kategori: str,
    sinyaller: list[SinyalKaydi],
    gozlemler: list[GozlemKaydi],
    segmentler: SegmentDosyasi,
    model_surumu: str = "v0",
    *,
    eksen: str | None = None,
    esik_raf_payi: float = ESIK_RAF_PAYI,
) -> list[TahminKaydi]:
    """Sezonun tüm sinyalleri (isteğe bağlı tek eksen) için tahmin; olasılığa göre azalan sırada."""
    gecikme = segment_gecikmesi(sinyaller, gozlemler, segmentler, segment, kategori)
    anahtarlar = sorted(
        {
            (s.nitelik_ekseni, s.nitelik_degeri)
            for s in sinyaller
            if s.sezon == sezon and (eksen is None or s.nitelik_ekseni == eksen)
        }
    )
    sonuc = [
        tahmin_et(
            sezon,
            ulke,
            segment,
            kategori,
            e,
            d,
            sinyaller,
            gozlemler,
            segmentler,
            model_surumu,
            esik_raf_payi=esik_raf_payi,
            gecikme=gecikme,
        )
        for e, d in anahtarlar
    ]
    return sorted(sonuc, key=lambda t: (-t.olasilik, t.nitelik_ekseni, t.nitelik_degeri))
