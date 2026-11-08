"""Sayısal olay tespiti: fiyat/hacim verisinden "iz bırakmış" aralıkları çıkarır ve katsayılarını hesaplar.

Üç tür olay bulunur:
* `yukselis` / `dusus`: 20 işlem günlük pencere getirisinin en uç değerleri (örtüşmeyen, hisse başına en fazla 3+3)
* `sok`: tek günde |getiri| > 3 standart sapma (günlük) ya da endekse göre > %8 sapma
* `hacim`: 60 günlük z-skoru > 3 olan hacim patlaması

Sektör olayları: sektördeki hisselerin eşit ağırlıklı ortalamasında aynı tarama.
Endeks (kuresel/yerel_makro ayrımı metinle yapılır) için XU100'de aynı tarama, kapsam `yerel_makro`.
Metin alanları boş kalır; anlamı dil modeli (alt ajan) ya da kullanıcı `bilgi-yukle` ile doldurur.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..veri.saatlik import SaatlikVeriSeti
from .sema import SEKTORLER, Olay


def gunluk(vs: SaatlikVeriSeti, sembol: str) -> pd.DataFrame | None:
    df = vs.saatlik(sembol)
    if df.empty:
        return None
    gun = pd.Series(pd.to_datetime(df.index.date), index=df.index)
    g = pd.DataFrame(
        {
            "acilis": df["acilis"].groupby(gun).first(),
            "yuksek": df["yuksek"].groupby(gun).max(),
            "dusuk": df["dusuk"].groupby(gun).min(),
            "kapanis": df["kapanis"].groupby(gun).last(),
            "hacim": df["hacim"].groupby(gun).sum(),
        }
    )
    return g


def _katsayilar(k: pd.Series, h: pd.Series, endeks: pd.Series, bas: int, bit: int) -> dict[str, float | None]:
    def guvenli(x: float) -> float | None:
        return None if x is None or not np.isfinite(x) else float(x)

    g = k.pct_change()
    getiri = k.iloc[bit] / k.iloc[bas] - 1
    e = endeks.reindex(k.index).ffill()
    endeks_g = e.iloc[bit] / e.iloc[bas] - 1 if e.notna().iloc[bas] and e.notna().iloc[bit] else np.nan
    oyn = g.iloc[max(0, bas - 20) : bas].std() if bas > 5 else np.nan
    hz = np.nan
    if bas > 60:
        onc = h.iloc[bas - 60 : bas]
        if onc.std() > 0:
            hz = (h.iloc[bas : bit + 1].mean() - onc.mean()) / onc.std()
    takip5 = k.iloc[bit + 5] / k.iloc[bit] - 1 if bit + 5 < len(k) else np.nan
    takip20 = k.iloc[bit + 20] / k.iloc[bit] - 1 if bit + 20 < len(k) else np.nan
    mom = k.iloc[bas] / k.iloc[bas - 20] - 1 if bas >= 20 else np.nan
    return {
        "getiri": guvenli(getiri),
        "endekse_gore": guvenli(getiri - endeks_g),
        "oynaklik_oncesi": guvenli(oyn),
        "hacim_z": guvenli(hz),
        "takip_5g": guvenli(takip5),
        "takip_20g": guvenli(takip20),
        "mom20_oncesi": guvenli(mom),
    }


def seride_olaylar(
    k: pd.Series, h: pd.Series, endeks: pd.Series, kapsam: str, hisse: str | None, sektor: str | None, uc: int = 3
) -> list[Olay]:
    olaylar: list[Olay] = []
    n = len(k)
    if n < 40:
        return olaylar
    g = k.pct_change()
    r20 = (k / k.shift(20) - 1)

    def ekle(bas: int, bit: int, tur: str, baslik: str) -> None:
        ks = _katsayilar(k, h, endeks, bas, bit)
        olaylar.append(
            Olay(
                kapsam=kapsam, hisse=hisse, sektor=sektor, baslangic=str(k.index[bas].date()), bitis=str(k.index[bit].date()),
                tur=tur, baslik=baslik, anlam="(sayısal tespit; anlam henüz yazılmadı)", kaynak_tipi="sayisal", guven=0.3, **ks,
            )  # fmt: skip
        )

    # Uç 20 günlük pencereler (örtüşmeyen)
    for tur, isaret in (("yukselis", 1), ("dusus", -1)):
        s = (r20 * isaret).dropna()
        for _ in range(uc):
            if s.empty or s.max() < 0.10:  # %10'dan küçük hareket olay değil
                break
            i = int(k.index.get_loc(s.idxmax()))
            bas = i - 20
            ekle(bas, i, tur, f"20 günde {r20.iloc[i]:+.0%}")
            s = s[(s.index < k.index[bas]) | (s.index > k.index[i] + pd.Timedelta(days=30))]
    # Tek gün şoklar
    std = g.rolling(60).std()
    e_g = endeks.reindex(k.index).ffill().pct_change()
    sok = ((g.abs() > 3 * std) & (g.abs() > 0.05)) | ((g - e_g).abs() > 0.08)
    for i in np.flatnonzero(sok.to_numpy()):
        if i == 0:
            continue
        ekle(i - 1, i, "sok", f"tek günde {g.iloc[i]:+.1%} (endeks {e_g.iloc[i]:+.1%})")
    # Hacim patlaması
    hz = (h - h.rolling(60).mean()) / h.rolling(60).std()
    for i in np.flatnonzero((hz > 3).to_numpy()):
        if i == 0 or sok.iloc[i]:
            continue
        ekle(i - 1, i, "hacim", f"hacim z={hz.iloc[i]:.1f}, fiyat {g.iloc[i]:+.1%}")
    return olaylar


def tum_olaylar(vs: SaatlikVeriSeti, piyasa, hisseler: list[str], haric: tuple[str, ...] = ("TERA",)) -> list[Olay]:
    endeks_df = gunluk(vs, piyasa.gosterge)
    endeks = endeks_df["kapanis"] if endeks_df is not None else pd.Series(dtype=float)
    olaylar: list[Olay] = []
    sektor_k: dict[str, list[pd.Series]] = {}
    sektor_h: dict[str, list[pd.Series]] = {}
    for h in hisseler:
        if any(h.upper().startswith(x) for x in haric):
            continue
        g = gunluk(vs, piyasa.sembol(h))
        if g is None:
            continue
        sek = SEKTORLER.get(h.upper())
        olaylar += seride_olaylar(g["kapanis"], g["hacim"], endeks, "sirket", h.upper(), sek)
        if sek:
            sektor_k.setdefault(sek, []).append(g["kapanis"] / g["kapanis"].iloc[0])
            sektor_h.setdefault(sek, []).append(g["hacim"] / g["hacim"].mean())
    for sek, seriler in sektor_k.items():
        if len(seriler) < 2:
            continue
        k = pd.concat(seriler, axis=1).mean(axis=1)
        hh = pd.concat(sektor_h[sek], axis=1).mean(axis=1)
        olaylar += seride_olaylar(k, hh, endeks, "sektor", None, sek, uc=2)
    if endeks_df is not None:
        olaylar += seride_olaylar(endeks_df["kapanis"], endeks_df["hacim"], endeks_df["kapanis"], "yerel_makro", None, None, uc=3)
    return olaylar


def bugunku_durum(vs: SaatlikVeriSeti, piyasa, hisse: str) -> dict[str, float | None]:
    """Benzerlik aramasında kullanılacak bugünkü katsayılar (son 20 gün = 'aralık')."""
    g = gunluk(vs, piyasa.sembol(hisse))
    e = gunluk(vs, piyasa.gosterge)
    if g is None or len(g) < 45:
        return {}
    k, h = g["kapanis"], g["hacim"]
    endeks = e["kapanis"] if e is not None else k
    n = len(k) - 1
    ks = _katsayilar(k, h, endeks, n - 20, n)
    return {a: ks[a] for a in ("getiri", "endekse_gore", "oynaklik_oncesi", "hacim_z", "mom20_oncesi")}
