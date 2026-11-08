"""Segment gecikmesi: podyum → raf, sezon cinsinden (ADR-003, ilke 4).

Yöntem (sürüm 0): her (eksen, değer) için niteliğin podyumda ilk görüldüğü sezonun defile tarihi ile segment
rafında ilk görülmesi arasındaki gün farkı sezona çevrilir. Yalnız *yeni girişler* sayılır: defile tarihinden önce
segment rafında zaten bulunan değerler (ör. her sezon satılan siyah) eşleşmeye girmez, çünkü onların raf tarihi
podyumdan bağımsızdır. Eşleşme sayısına göre önselle birleştirilir:

- n ≥ 8 → medyan, kaynak ``"olculen"``
- 3 ≤ n ≤ 7 → ``w·medyan + (1 − w)·önsel_mod``, ``w = n / (n + 8)``, kaynak ``"karma"``
- n < 3 → önselin modu, kaynak ``"onsel"``

Sürüm 1'de bunun yerine raf payı ve podyum payı serileri arasında çapraz korelasyon kullanılacak.
"""

from __future__ import annotations

import statistics
from typing import Literal

from moda_radar.sema import GozlemKaydi, SinyalKaydi
from moda_radar.tahmin import sezon as sz

OLCULEN_ESIGI = 8
KARMA_ESIGI = 3
ONSEL_AGIRLIGI = 8  # w = n / (n + 8)

GecikmeKaynagi = Literal["olculen", "onsel", "karma"]


def eslesmeler(
    sinyaller: list[SinyalKaydi],
    gozlemler: list[GozlemKaydi],
    segment: str,
    kategori: str | None = None,
) -> list[dict]:
    """Her yeni giriş için (eksen, değer, podyum sezonu, gecikme_sezon) kayıtları."""
    ilk_sezon: dict[tuple[str, str], str] = {}
    for s in sinyaller:
        if s.podyum_payi <= 0:
            continue
        anahtar = (s.nitelik_ekseni, s.nitelik_degeri)
        onceki = ilk_sezon.get(anahtar)
        if onceki is None or sz.fark(s.sezon, onceki) > 0:
            ilk_sezon[anahtar] = s.sezon

    ilk_raf: dict[tuple[str, str], object] = {}
    for g in gozlemler:
        if g.segment != segment or (kategori is not None and g.kategori != kategori):
            continue
        anahtar = (g.nitelik_ekseni, g.nitelik_degeri)
        if anahtar not in ilk_raf or g.ilk_gorulme < ilk_raf[anahtar]:
            ilk_raf[anahtar] = g.ilk_gorulme

    sonuc = []
    for anahtar, podyum_sezonu in ilk_sezon.items():
        raf = ilk_raf.get(anahtar)
        if raf is None:
            continue
        defile = sz.defile_tarihi(podyum_sezonu)
        if raf < defile:
            continue  # rafta zaten vardı: yeni giriş değil
        sonuc.append(
            {
                "eksen": anahtar[0],
                "deger": anahtar[1],
                "podyum_sezonu": podyum_sezonu,
                "gecikme_sezon": sz.gunden_sezona((raf - defile).days),
            }
        )
    return sonuc


def olc(
    sinyaller: list[SinyalKaydi],
    gozlemler: list[GozlemKaydi],
    segment: str,
    onsel: dict,
    kategori: str | None = None,
) -> tuple[float, GecikmeKaynagi, dict]:
    """Segment gecikmesini ölçer; ``(gecikme_sezon, kaynak, ayrinti)`` döner.

    ``onsel``: ``{"alt", "ust", "mod"}`` (``content/segmentler.json``). ``ayrinti``: ``n``, ``medyan``, ``q1``, ``q3``,
    ``onsel_mod``, ``agirlik`` (verinin ağırlığı).
    """
    mod = float(onsel["mod"])
    gecikmeler = sorted(e["gecikme_sezon"] for e in eslesmeler(sinyaller, gozlemler, segment, kategori))
    n = len(gecikmeler)
    ayrinti: dict = {"n": n, "medyan": None, "q1": None, "q3": None, "onsel_mod": mod, "agirlik": 0.0}
    if n:
        ayrinti["medyan"] = round(statistics.median(gecikmeler), 3)
        if n >= 2:
            q = statistics.quantiles(gecikmeler, n=4, method="inclusive")
            ayrinti["q1"], ayrinti["q3"] = round(q[0], 3), round(q[2], 3)
        else:
            ayrinti["q1"] = ayrinti["q3"] = ayrinti["medyan"]
    if n >= OLCULEN_ESIGI:
        ayrinti["agirlik"] = 1.0
        return float(ayrinti["medyan"]), "olculen", ayrinti
    if n >= KARMA_ESIGI:
        w = n / (n + ONSEL_AGIRLIGI)
        ayrinti["agirlik"] = round(w, 3)
        return round(w * ayrinti["medyan"] + (1 - w) * mod, 3), "karma", ayrinti
    return mod, "onsel", ayrinti
