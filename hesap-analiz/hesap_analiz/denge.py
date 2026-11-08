"""Kişi bazında alacak / verecek dengesi."""

from __future__ import annotations

import pandas as pd


def kisi_dengesi(tablo: pd.DataFrame) -> pd.DataFrame:
    """Her kişi için gönderilen, alınan, net ve zaman bilgisi.

    net > 0 : o kişiden sana gelen fazla (sen borçlu olabilirsin ya da o sana ödedi)
    net < 0 : senin ona gönderdiğin fazla (alacaklı olabilirsin)
    Yorum kullanıcıya bırakılır; araç yalnızca akışı gösterir.
    """
    k = tablo[(tablo["karsi_taraf_turu"] == "kisi") & (tablo["karsi_taraf"] != "")]
    if k.empty:
        return pd.DataFrame(columns=[
            "kisi", "gonderilen", "alinan", "net", "islem_sayisi", "ilk_islem", "son_islem", "durum", "onay",
        ])
    g = k.groupby("karsi_taraf")
    ozet = pd.DataFrame({
        "gonderilen": g["tutar"].apply(lambda s: -s[s < 0].sum()),
        "alinan": g["tutar"].apply(lambda s: s[s > 0].sum()),
        "islem_sayisi": g.size(),
        "ilk_islem": g["tarih"].min(),
        "son_islem": g["tarih"].max(),
        "onay": g["karsi_taraf_onay"].agg(lambda s: "onaylı" if (s == "onaylı").all() else "bekliyor"),
    })
    ozet["net"] = ozet["alinan"] - ozet["gonderilen"]
    ozet["durum"] = ozet["net"].map(
        lambda n: "Sen fazla gönderdin" if n < -0.005 else ("Sana fazla geldi" if n > 0.005 else "Dengede")
    )
    ozet = ozet.reset_index().rename(columns={"karsi_taraf": "kisi"})
    ozet = ozet.sort_values(["net", "gonderilen"], key=abs, ascending=False)
    return ozet[["kisi", "gonderilen", "alinan", "net", "islem_sayisi", "ilk_islem", "son_islem", "durum", "onay"]]


def kisi_zaman_cizelgesi(tablo: pd.DataFrame) -> pd.DataFrame:
    """Kişi × ay bazında net akış; 'Mart'ta verdim Haziran'da geldi' görünür."""
    k = tablo[(tablo["karsi_taraf_turu"] == "kisi") & (tablo["karsi_taraf"] != "")].copy()
    if k.empty:
        return pd.DataFrame()
    k["ay"] = k["tarih"].dt.to_period("M").astype(str)
    piv = k.pivot_table(index="karsi_taraf", columns="ay", values="tutar", aggfunc="sum", fill_value=0.0)
    piv["toplam"] = piv.sum(axis=1)
    return piv.sort_values("toplam", key=abs, ascending=False).reset_index().rename(columns={"karsi_taraf": "kisi"})
