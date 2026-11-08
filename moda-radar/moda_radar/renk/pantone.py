"""Pantone TCX eşleme (ADR-001).

Tablo `content/pantone/tcx.json` bir kez yüklenir ve Lab değerleri önbelleğe alınır. Eşleme ΔE2000 iledir;
güven sınıfı `PantoneEslesme.guven` özelliğindedir (≤ 3 eşleşme, 3-5 yakın, > 5 yaklaşık). İkinci aday her zaman verilir.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np

from moda_radar.renk import uzay
from moda_radar.sema import TCX_DESENI, Lab, PantoneEslesme

TABLO_YOLU = Path(__file__).resolve().parents[2] / "content" / "pantone" / "tcx.json"

AILELER = (
    "kirmizi",
    "turuncu",
    "sari",
    "yesil",
    "mavi",
    "mor",
    "pembe",
    "kahverengi",
    "notr-acik",
    "notr-koyu",
    "siyah",
    "beyaz",
)


@dataclass(frozen=True)
class _Tablo:
    kodlar: tuple[str, ...]
    hexler: tuple[str, ...]
    adlar: tuple[str | None, ...]
    lab: np.ndarray  # (N, 3)
    indeks: dict[str, int]


@lru_cache(maxsize=4)
def tablo(yol: Path = TABLO_YOLU) -> _Tablo:
    """TCX tablosunu yükler; Lab değerleri bir kez hesaplanır."""
    veri = json.loads(Path(yol).read_text(encoding="utf-8"))
    renkler = veri["renkler"]
    kodlar = tuple(r["kod"] for r in renkler)
    hexler = tuple(r["hex"].upper() for r in renkler)
    adlar = tuple(r.get("ad") for r in renkler)
    rgb = np.array([uzay.hex_to_rgb(h) for h in hexler], dtype=np.float64)
    lab = uzay.rgb_dizi_to_lab(rgb)
    lab.setflags(write=False)
    return _Tablo(kodlar, hexler, adlar, lab, {k: i for i, k in enumerate(kodlar)})


def _eslesme(t: _Tablo, i: int, de: float) -> PantoneEslesme:
    return PantoneEslesme(kod=t.kodlar[i], hex=t.hexler[i], delta_e=round(float(de), 4), ad=t.adlar[i])


def en_yakin(lab: Lab, n: int = 2) -> list[PantoneEslesme]:
    """ΔE2000'e göre en yakın n TCX rengi (artan ΔE)."""
    t = tablo()
    de = uzay.delta_e2000_toplu(lab, t.lab)
    n = max(1, min(n, len(de)))
    secilen = np.argpartition(de, n - 1)[:n] if n < len(de) else np.arange(len(de))
    secilen = secilen[np.argsort(de[secilen], kind="stable")]
    return [_eslesme(t, int(i), de[i]) for i in secilen]


def esle(hex_: str) -> tuple[PantoneEslesme, PantoneEslesme]:
    """Hex → (birinci aday, ikinci aday)."""
    bir, iki = en_yakin(uzay.hex_to_lab(hex_), n=2)
    return bir, iki


def kod_ile(kod: str) -> PantoneEslesme | None:
    """'17-1564 TCX' (ya da '17-1564') → tablodaki kayıt (ΔE = 0); yoksa None."""
    k = kod.strip().upper()
    if not k.endswith(" TCX"):
        k = f"{k} TCX"
    if not TCX_DESENI.match(k):
        return None
    t = tablo()
    i = t.indeks.get(k)
    if i is None:
        return None
    return _eslesme(t, i, 0.0)


def kod_lab(kod: str) -> Lab | None:
    """TCX kodunun Lab değeri; yoksa None."""
    e = kod_ile(kod)
    return uzay.hex_to_lab(e.hex) if e else None


def aile(lab: Lab) -> str:
    """Lab ton açısı (h°) ve kromaya (C*) göre kaba ton ailesi.

    Sınırlar sRGB referans renkleri ve moda kullanımına göre elle ayarlanmıştır (ör. sRGB maviyi Lab'de h≈306°'dedir,
    deve tüyü/bej sarı değil kahverengi/nötr sayılır). Karar kodla verilir; aile yalnızca gruplama ve okunabilirlik içindir.
    """
    L, a, b = lab.L, lab.a, lab.b
    C = math.hypot(a, b)
    h = math.degrees(math.atan2(b, a)) % 360

    # Akromatik ve neredeyse akromatik
    if L < 20 and C < 12:
        return "siyah"
    if C < 8 or (C < 18 and L >= 75 and 40 <= h < 115):  # griler; krem/bej/ekru
        if L >= 93 and C < 5:
            return "beyaz"
        return "notr-acik" if L >= 55 else "notr-koyu"

    # Kahverengi: sıcak tonlarda koyu ve orta kroma; deve tüyü/taba (orta L, düşük C)
    if 20 <= h < 100:
        derin_kirmizi = h < 45 and C >= 40
        if not derin_kirmizi and ((L < 50 and C < 55) or (50 <= L < 75 and C < 35 and h >= 40)):
            return "kahverengi"

    if h >= 345 or h < 20:
        return "pembe" if L >= 55 else "kirmizi"
    if h < 50:
        return "pembe" if (L >= 75 and C < 40) else "kirmizi"
    if h < 80:
        return "turuncu"
    if h < 110:
        return "sari" if L >= 60 else "yesil"
    if h < 195:
        return "yesil"
    if h < 312:
        return "mavi"
    return "mor" if L < 60 else "pembe"
