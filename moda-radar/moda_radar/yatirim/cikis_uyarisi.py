"""Çıkış uyarısı: yönü "çıkış" olan nitelikler için elde stokun indirim zamanlaması (PLAN bölüm 8).

Kart kararından ayrı bir listedir. Olasılık düştükçe indirime daha erken girilir; zamanlama ve oranlar
`content/esikler.json` → `cikis` bölümünden gelir.
"""

from __future__ import annotations

from moda_radar.sema import TahminKaydi, Yon
from moda_radar.yatirim import ayar


def listele(tahminler: list[TahminKaydi], esikler: dict | None = None) -> list[dict]:
    e = (esikler or ayar.esikler())["cikis"]
    satirlar = []
    for t in tahminler:
        if t.yon != Yon.CIKIS:
            continue
        if t.olasilik < e["erken_olasilik_ust"]:
            evre = "erken"
        elif t.olasilik < e["orta_olasilik_ust"]:
            evre = "orta"
        else:
            evre = "olagan"
        donem = t.ufuk_sezon[:2] if t.ufuk_sezon[:2] in ("SS", "FW") else t.sezon[:2]
        ay = e["indirim_ayi"][donem][evre]
        oran = e["indirim_yuzde"][evre]
        if evre == "erken":
            oneri = (
                f"{t.ufuk_sezon}: elde stok için {ay} {oran} indirime gir; sezon sonunu bekleme. Yeni sipariş verme."
            )
        elif evre == "orta":
            oneri = f"{t.ufuk_sezon}: {ay} {oran} indirim planla. Tekrar sipariş verme."
        else:
            oneri = f"{t.ufuk_sezon}: {ay} {oran}; tekrar siparişi küçült."
        satirlar.append(
            {
                "sezon": t.sezon,
                "segment": t.segment,
                "kategori": t.kategori,
                "nitelik_ekseni": t.nitelik_ekseni,
                "nitelik_degeri": t.nitelik_degeri,
                "olasilik": t.olasilik,
                "ufuk_sezon": t.ufuk_sezon,
                "evre": evre,
                "indirim_zamani": ay,
                "oneri": oneri,
                "kaynak_sayisi": t.kaynak_sayisi,
            }
        )
    return sorted(satirlar, key=lambda s: (s["olasilik"], s["nitelik_ekseni"], s["nitelik_degeri"]))
