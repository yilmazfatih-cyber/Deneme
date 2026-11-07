"""Saatlik çubuklardan özellik ve ödül üretimi.

Zaman kuralı: t çubuğunun özellikleri yalnız t ve öncesinden gelir. Karar t kapanışında verilir,
emir t+1 çubuğunun AÇILIŞINDAN dolar, pozisyon t+1 KAPANIŞINDA kapanır. Gerçekleşen getiri bu
yüzden kapanış(t+1)/açılış(t+1) - 1'dir; "kapanıştan kapanışa" alınsaydı açılış boşluğu
sahte kâr olarak sayılırdı.

Ödül = gerçekleşen getiri - gidiş-dönüş maliyet (spread + kayma + komisyon, iki kez).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..ayarlar import Piyasa

SEANS_SAATLERI = list(range(10, 18))
OZELLIK_ADLARI = (
    [f"getiri_gecikme_{k}" for k in range(1, 7)]
    + ["getiri_1g", "getiri_5g", "oynaklik_24", "aralik", "hacim_z", "ort50_sapma", "gun_boslugu", "gosterge_1g"]
    + [f"saat_{s}" for s in SEANS_SAATLERI]
)


def gidis_donus_maliyet(piyasa: Piyasa) -> float:
    tek = (piyasa.spread_bps + piyasa.kayma_bps) / 10_000 + piyasa.komisyon_orani
    return 2 * tek


def ozellik_tablosu(df: pd.DataFrame, gosterge: pd.DataFrame | None = None) -> pd.DataFrame:
    """Her satırı bir karar anı (çubuk kapanışı) olan özellik tablosu + ham ileri getiri."""
    k = df["kapanis"]
    g = k.pct_change()
    out = pd.DataFrame(index=df.index)
    for lag in range(1, 7):
        out[f"getiri_gecikme_{lag}"] = g.shift(lag - 1)
    out["getiri_1g"] = k / k.shift(8) - 1
    out["getiri_5g"] = k / k.shift(40) - 1
    out["oynaklik_24"] = g.rolling(24).std()
    out["aralik"] = (df["yuksek"] - df["dusuk"]) / k
    hacim = df["hacim"].rolling(40)
    out["hacim_z"] = (df["hacim"] - hacim.mean()) / hacim.std().replace(0, np.nan)
    out["ort50_sapma"] = k / k.rolling(50).mean() - 1
    gun = pd.Series(df.index.date, index=df.index)
    onceki_gun_kapanis = k.groupby(gun).transform("last").shift(1)
    out["gun_boslugu"] = (df["acilis"] / onceki_gun_kapanis - 1).where(gun != gun.shift(1), 0.0)
    if gosterge is not None and not gosterge.empty:
        gk = gosterge["kapanis"].reindex(df.index, method="ffill")
        out["gosterge_1g"] = gk / gk.shift(8) - 1
    else:
        out["gosterge_1g"] = 0.0
    saat = df.index.hour
    for s in SEANS_SAATLERI:
        out[f"saat_{s}"] = (saat == s).astype(float)
    # İleri getiri: sonraki çubuğun açılışından kapanışına. Son satırın hedefi yok.
    out["ileri_getiri"] = (df["kapanis"].shift(-1) / df["acilis"].shift(-1) - 1)
    out["ileri_zaman"] = pd.Series(df.index, index=df.index).shift(-1)
    return out


def egitim_seti(tablo: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, pd.DatetimeIndex]:
    """NaN'sız satırları (X, ileri getiri, zaman) olarak döndürür."""
    t = tablo.dropna(subset=[*OZELLIK_ADLARI, "ileri_getiri"])
    t = t[t["ileri_zaman"].dt.date == t.index.date]  # gün sonu çubuğu: ertesi güne taşıma yok
    X = t[OZELLIK_ADLARI].to_numpy(dtype=float)
    X = np.clip(X, -10, 10)
    return X, t["ileri_getiri"].to_numpy(dtype=float), t.index
