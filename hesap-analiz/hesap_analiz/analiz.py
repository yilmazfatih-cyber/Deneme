"""Basit finansal analizler: aylık akış, kategori dağılımı, düzenli ödemeler, en büyükler."""

from __future__ import annotations

import pandas as pd


def aylik_akis(tablo: pd.DataFrame) -> pd.DataFrame:
    t = tablo.copy()
    t["ay"] = t["tarih"].dt.to_period("M").astype(str)
    g = t.groupby("ay")
    a = pd.DataFrame({
        "gelen": g["tutar"].apply(lambda s: s[s > 0].sum()),
        "giden": g["tutar"].apply(lambda s: -s[s < 0].sum()),
        "islem_sayisi": g.size(),
    })
    a["net"] = a["gelen"] - a["giden"]
    a["birikimli_net"] = a["net"].cumsum()
    return a.reset_index()


def kategori_dagilimi(tablo: pd.DataFrame) -> pd.DataFrame:
    g = tablo.groupby(["kategori", "yon"])["tutar"].agg(toplam="sum", adet="size").reset_index()
    g["toplam"] = g["toplam"].abs()
    toplam_giden = g.loc[g["yon"] == "giden", "toplam"].sum() or 1.0
    toplam_gelen = g.loc[g["yon"] == "gelen", "toplam"].sum() or 1.0
    g["pay_yuzde"] = [
        round(100 * t / (toplam_giden if y == "giden" else toplam_gelen), 1)
        for t, y in zip(g["toplam"], g["yon"])
    ]
    return g.sort_values(["yon", "toplam"], ascending=[True, False]).reset_index(drop=True)


def kategori_aylik(tablo: pd.DataFrame) -> pd.DataFrame:
    t = tablo[tablo["yon"] == "giden"].copy()
    if t.empty:
        return pd.DataFrame()
    t["ay"] = t["tarih"].dt.to_period("M").astype(str)
    t["tutar"] = t["tutar"].abs()
    piv = t.pivot_table(index="kategori", columns="ay", values="tutar", aggfunc="sum", fill_value=0.0)
    piv["toplam"] = piv.sum(axis=1)
    return piv.sort_values("toplam", ascending=False).reset_index()


def duzenli_odemeler(tablo: pd.DataFrame, en_az_tekrar: int = 3, tutar_toleransi: float = 0.15) -> pd.DataFrame:
    """Aynı karşı tarafa, yakın tutarla, yaklaşık aylık aralıkla giden ödemeler."""
    t = tablo[(tablo["yon"] == "giden") & (tablo["karsi_taraf"] != "")].copy()
    if t.empty:
        return pd.DataFrame()
    t["tutar_abs"] = t["tutar"].abs()
    satirlar = []
    for (kt, kat), grup in t.groupby(["karsi_taraf", "kategori"]):
        if len(grup) < en_az_tekrar:
            continue
        grup = grup.sort_values("tarih")
        medyan = grup["tutar_abs"].median()
        yakin = grup[(grup["tutar_abs"] - medyan).abs() <= medyan * tutar_toleransi]
        if len(yakin) < en_az_tekrar:
            continue
        gunler = yakin["tarih"].diff().dt.days.dropna()
        if gunler.empty:
            continue
        ort_aralik = gunler.median()
        if 6 <= ort_aralik <= 8:
            periyot = "haftalık"
        elif 25 <= ort_aralik <= 35:
            periyot = "aylık"
        elif 85 <= ort_aralik <= 95:
            periyot = "üç aylık"
        elif 350 <= ort_aralik <= 380:
            periyot = "yıllık"
        else:
            continue
        satirlar.append({
            "karsi_taraf": kt,
            "kategori": kat,
            "periyot": periyot,
            "tipik_tutar": round(medyan, 2),
            "tekrar": len(yakin),
            "ilk": yakin["tarih"].min(),
            "son": yakin["tarih"].max(),
            "yillik_tahmin": round(medyan * {"haftalık": 52, "aylık": 12, "üç aylık": 4, "yıllık": 1}[periyot], 2),
        })
    if not satirlar:
        return pd.DataFrame()
    return pd.DataFrame(satirlar).sort_values("yillik_tahmin", ascending=False).reset_index(drop=True)


def en_buyuk_karsi_taraflar(tablo: pd.DataFrame, n: int = 15) -> pd.DataFrame:
    t = tablo[tablo["karsi_taraf"] != ""]
    g = t.groupby(["karsi_taraf", "karsi_taraf_turu"])["tutar"].agg(
        gelen=lambda s: s[s > 0].sum(), giden=lambda s: -s[s < 0].sum(), adet="size"
    ).reset_index()
    g["hacim"] = g["gelen"] + g["giden"]
    return g.sort_values("hacim", ascending=False).head(n).reset_index(drop=True)


def genel_ozet(tablo: pd.DataFrame) -> dict:
    gelen = tablo.loc[tablo["tutar"] > 0, "tutar"].sum()
    giden = -tablo.loc[tablo["tutar"] < 0, "tutar"].sum()
    kart = tablo[tablo["hesap_turu"] == "kart"]
    ay_sayisi = max(1, tablo["tarih"].dt.to_period("M").nunique())
    return {
        "Dönem başı": tablo["tarih"].min().date().isoformat() if len(tablo) else "",
        "Dönem sonu": tablo["tarih"].max().date().isoformat() if len(tablo) else "",
        "Ay sayısı": ay_sayisi,
        "İşlem sayısı": int(len(tablo)),
        "Toplam gelen": round(gelen, 2),
        "Toplam giden": round(giden, 2),
        "Net": round(gelen - giden, 2),
        "Aylık ortalama gelen": round(gelen / ay_sayisi, 2),
        "Aylık ortalama giden": round(giden / ay_sayisi, 2),
        "Kart harcaması": round(-kart.loc[kart["tutar"] < 0, "tutar"].sum(), 2),
        "Kaynak dosya sayısı": int(tablo["kaynak"].nunique()),
        "Banka sayısı": int(tablo["banka"].nunique()),
    }
