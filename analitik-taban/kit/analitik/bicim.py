"""Türkçe sayı, yüzde ve süre biçimleri; kısa Markdown tablolar.

Çıktılar hem insanın okuyacağı rapora hem de modele gider; bu yüzden kısa ve tutarlıdır:
12.430 · %18,6 · -%3,2 · +2,1 puan · 3 dk 10 sn.
"""

from __future__ import annotations

import math
from typing import Iterable, Optional, Sequence

BOS = "–"


def _gecersiz(x) -> bool:
    return x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x)))


def sayi(x, ondalik: int = 0) -> str:
    """12430 -> '12.430'; 18.64 (ondalik=1) -> '18,6'; None/NaN -> '–'."""
    if _gecersiz(x):
        return BOS
    metin = f"{x:,.{ondalik}f}"
    metin = metin.replace(",", "_").replace(".", ",").replace("_", ".")
    if metin.startswith("-") and metin.strip("-0,.") == "":
        metin = metin[1:]
    return metin


def yuzde(oran, ondalik: int = 1, isaret: bool = False) -> str:
    """0.186 -> '%18,6'; -0.032 -> '-%3,2'; isaret=True ise 0.05 -> '+%5,0'."""
    if _gecersiz(oran):
        return BOS
    deger = oran * 100
    govde = sayi(abs(deger), ondalik)
    sifir = govde.strip("0,.") == ""
    if deger < 0 and not sifir:
        return "-%" + govde
    if isaret and deger > 0 and not sifir:
        return "+%" + govde
    return "%" + govde


def puan(fark, ondalik: int = 1) -> str:
    """Yüzde puan farkı: 0.023 -> '+2,3 puan'."""
    if _gecersiz(fark):
        return BOS
    deger = fark * 100
    govde = sayi(abs(deger), ondalik)
    if govde.strip("0,.") == "":
        return "0 puan"
    return ("+" if deger > 0 else "-") + govde + " puan"


def degisim(yeni, eski, ondalik: int = 1) -> str:
    """İki değer arasındaki göreli değişim: (110, 100) -> '+%10,0'. Eski 0 ise '–'."""
    if _gecersiz(yeni) or _gecersiz(eski) or eski == 0:
        return BOS
    return yuzde((yeni - eski) / abs(eski), ondalik, isaret=True)


def sure(saniye) -> str:
    """45 -> '45 sn'; 190 -> '3 dk 10 sn'; 7500 -> '2 sa 5 dk'; 129600 -> '1,5 gün'."""
    if _gecersiz(saniye):
        return BOS
    s = float(saniye)
    if s < 60:
        return f"{sayi(s)} sn"
    if s < 3600:
        dk, sn = divmod(int(round(s)), 60)
        return f"{dk} dk" if sn == 0 or dk >= 10 else f"{dk} dk {sn} sn"
    if s < 86400:
        sa, kalan = divmod(int(round(s)), 3600)
        dk = kalan // 60
        return f"{sa} sa" if dk == 0 else f"{sa} sa {dk} dk"
    return f"{sayi(s / 86400, 1)} gün"


def kisalt(metin, uzunluk: int = 60) -> str:
    metin = " ".join(str(metin).split())
    return metin if len(metin) <= uzunluk else metin[: uzunluk - 1].rstrip() + "…"


_KIVILCIM = "▁▂▃▄▅▆▇█"


def kivilcim(degerler: Iterable) -> str:
    """Küçük eğilim çizgisi: [1, 5, 3] -> '▁█▄'. Eksik değer boşluk olur."""
    liste = list(degerler)
    gecerli = [v for v in liste if not _gecersiz(v)]
    if not gecerli:
        return ""
    alt, ust = min(gecerli), max(gecerli)
    aralik = ust - alt
    cikti = []
    for v in liste:
        if _gecersiz(v):
            cikti.append(" ")
        elif aralik == 0:
            cikti.append(_KIVILCIM[3])
        else:
            cikti.append(_KIVILCIM[int(round((v - alt) / aralik * (len(_KIVILCIM) - 1)))])
    return "".join(cikti)


def _sayisal_mi(hucre: str) -> bool:
    h = hucre.strip()
    if not h or h == BOS:
        return True
    h = h.lstrip("+-").lstrip("%").replace(".", "").replace(",", "")
    h = h.replace(" puan", "").replace(" sn", "").replace(" dk", "").replace(" sa", "").replace(" gün", "")
    h = h.replace(" ", "")
    return h.isdigit()


def tablo(basliklar: Sequence[str], satirlar: Sequence[Sequence], hizala: Optional[str] = None) -> str:
    """Hizalı Markdown tablo. `hizala` her sütun için 'l' / 'r'; verilmezse sayısal sütunlar sağa yaslanır."""
    hucreler = [[str(h) for h in basliklar]] + [[BOS if c is None else str(c) for c in s] for s in satirlar]
    sutun = len(basliklar)
    for s in hucreler:
        if len(s) < sutun:
            s.extend([""] * (sutun - len(s)))
    if hizala is None:
        hizala = ""
        for i in range(sutun):
            veriler = [s[i] for s in hucreler[1:]]
            hizala += "r" if veriler and all(_sayisal_mi(v) for v in veriler) else "l"
    genislik = [max(3, max(len(s[i]) for s in hucreler)) for i in range(sutun)]

    def satir(s):
        parcalar = []
        for i in range(sutun):
            parcalar.append(s[i].rjust(genislik[i]) if hizala[i] == "r" else s[i].ljust(genislik[i]))
        return "| " + " | ".join(parcalar) + " |"

    ayirac = (
        "| "
        + " | ".join(("-" * (genislik[i] - 1) + ":") if hizala[i] == "r" else "-" * genislik[i] for i in range(sutun))
        + " |"
    )
    return "\n".join([satir(hucreler[0]), ayirac] + [satir(s) for s in hucreler[1:]])
