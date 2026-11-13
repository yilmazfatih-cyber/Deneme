"""Ağ katmanı panelleri: `veri/ag/*.csv.gz` ham tablolarından (tarih × hisse) geniş tablolar ve hisse evreni.

Getiri kaynağı İş Yatırım düzeltilmiş kapanışıdır (bedelsiz/bedelli/temettü düzeltmeli; Yahoo düzeltmesi bazı bölünmeleri kaçırıyor).
Gün içi getiri (açılış→kapanış) Yahoo'nun aynı gün açılış/kapanışından, gece getirisi ikisinin farkından hesaplanır.
Sektör, hissenin üye olduğu BIST sektör endeksinden (TradingView taramasındaki `indexes` alanı) gelir.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from ..dosya.kaynaklar import HARIC

# BIST sektör endeksi → kısa Türkçe sektör adı (öncelik sırasıyla: önce özgül olan)
SEKTOR_ENDEKS = [
    ("XBANK", "banka"), ("XSGRT", "sigorta"), ("XFINK", "leasing_faktoring"), ("XAKUR", "araci_kurum"), ("XYORT", "yatirim_ortakligi"),
    ("XGMYO", "gyo"), ("XSPOR", "spor"), ("XILTM", "telekom"), ("XMADN", "madencilik"), ("XULAS", "ulastirma"), ("XTRZM", "turizm"),
    ("XINSA", "insaat"), ("XELKT", "elektrik"), ("XTCRT", "ticaret"), ("XBLSM", "bilisim"), ("XKMYA", "kimya_petrol"), ("XGIDA", "gida"),
    ("XMESY", "metal_esya_makine"), ("XMANA", "ana_metal"), ("XTAST", "tas_toprak"), ("XTEKS", "tekstil"), ("XKAGT", "kagit_orman"),
    ("XHOLD", "holding"), ("XUTEK", "teknoloji"), ("XUSIN", "sanayi_diger"), ("XUHIZ", "hizmet_diger"), ("XUMAL", "mali_diger"),
]  # fmt: skip
ANA_GRUP = {
    "banka": "mali", "sigorta": "mali", "leasing_faktoring": "mali", "araci_kurum": "mali", "yatirim_ortakligi": "mali", "mali_diger": "mali",
    "gyo": "gyo", "holding": "holding",
    "kimya_petrol": "sanayi", "gida": "sanayi", "metal_esya_makine": "sanayi", "ana_metal": "sanayi", "tas_toprak": "sanayi", "tekstil": "sanayi",
    "kagit_orman": "sanayi", "sanayi_diger": "sanayi", "madencilik": "sanayi",
    "elektrik": "hizmet", "ticaret": "hizmet", "ulastirma": "hizmet", "turizm": "hizmet", "insaat": "hizmet", "telekom": "hizmet", "spor": "hizmet",
    "hizmet_diger": "hizmet", "bilisim": "teknoloji", "teknoloji": "teknoloji",
}  # fmt: skip
TV_SEKTOR = {
    "Finance": "mali_diger", "Process Industries": "sanayi_diger", "Producer Manufacturing": "metal_esya_makine", "Consumer Non-Durables": "gida",
    "Non-Energy Minerals": "ana_metal", "Utilities": "elektrik", "Consumer Services": "hizmet_diger", "Consumer Durables": "sanayi_diger",
    "Technology Services": "bilisim", "Distribution Services": "ticaret", "Retail Trade": "ticaret", "Electronic Technology": "teknoloji",
    "Industrial Services": "insaat", "Commercial Services": "hizmet_diger", "Transportation": "ulastirma", "Health Technology": "sanayi_diger",
    "Health Services": "hizmet_diger", "Energy Minerals": "kimya_petrol", "Communications": "telekom", "Miscellaneous": "diger",
}  # fmt: skip


@dataclass
class Panel:
    K: pd.DataFrame  # düzeltilmiş kapanış
    R: pd.DataFrame  # günlük getiri (kapanış→kapanış)
    GI: pd.DataFrame  # gün içi getiri (açılış→kapanış)
    GECE: pd.DataFrame  # gece getirisi (kapanış→açılış)
    HTL: pd.DataFrame  # TL işlem hacmi
    PD: pd.DataFrame  # piyasa değeri (TL)
    HAO: pd.DataFrame  # halka açık piyasa değeri (TL)
    AOF: pd.DataFrame  # ağırlıklı ortalama fiyat (düzeltilmiş)
    DOLAR: pd.DataFrame  # dolar bazlı fiyat
    xu100: pd.Series  # XU100 günlük getiri
    evren: pd.DataFrame  # hisse başına sabit bilgiler
    ek: dict = field(default_factory=dict)

    @property
    def hisseler(self) -> list[str]:
        return list(self.R.columns)


def _endeksler(v) -> set[str]:
    if not isinstance(v, str) or not v.startswith("["):
        return set()
    try:
        return {str(x.get("proname", "")).split(":")[-1] for x in json.loads(v)}
    except Exception:  # noqa: BLE001
        return set()


def evren_kur(tv: pd.DataFrame) -> pd.DataFrame:
    """Hisse evreni: sektör (BIST sektör endeksi üyeliğinden), ana grup, pazar/endeks grubu, halka açıklık, halka arz günü."""
    d = tv[tv["type"].astype(str).str.lower() == "stock"].copy()
    d["hisse"] = d["hisse"].astype(str).str.upper()
    d = d[~d["hisse"].isin(HARIC)].drop_duplicates("hisse").set_index("hisse")
    uye = d["indexes"].map(_endeksler) if "indexes" in d.columns else pd.Series([set()] * len(d), index=d.index)

    def sektor(h: str) -> str:
        for kod, ad in SEKTOR_ENDEKS:
            if kod in uye[h]:
                return ad
        return TV_SEKTOR.get(str(d.at[h, "sector"]), "diger")

    def grup(h: str) -> str:
        u = uye[h]
        if "XU030" in u:
            return "bist30"
        if "XU100" in u:
            return "bist100_30"
        if "XYLDZ" in u:
            return "yildiz_diger"
        if "XBANA" in u:
            return "ana_pazar"
        return "alt_pazar"

    out = pd.DataFrame(index=d.index)
    out["ad"] = d["description"].astype(str).str.slice(0, 60)
    out["sektor"] = [sektor(h) for h in d.index]
    out["ana"] = out["sektor"].map(ANA_GRUP).fillna("diger")
    out["grup"] = [grup(h) for h in d.index]
    out["bist100"] = [int("XU100" in uye[h]) for h in d.index]
    out["bist30"] = [int("XU030" in uye[h]) for h in d.index]
    out["halka_arz_endeksi"] = [int("XHARZ" in uye[h]) for h in d.index]
    out["katilim"] = [int("XKTUM" in uye[h]) for h in d.index]
    out["pd_tv"] = pd.to_numeric(d["market_cap_basic"], errors="coerce")
    out["halka_aciklik_tv"] = pd.to_numeric(d.get("float_shares_percent_current"), errors="coerce") / 100
    if "ipo_offer_date" in d.columns:
        out["halka_arz"] = pd.to_datetime(pd.to_numeric(d["ipo_offer_date"], errors="coerce"), unit="s", errors="coerce").dt.strftime("%Y-%m-%d")
    return out


def _genis(df: pd.DataFrame, deger: str) -> pd.DataFrame:
    g = df.pivot_table(index="tarih", columns="hisse", values=deger, aggfunc="last")
    g.index = pd.to_datetime(g.index)
    return g.sort_index()


def panel_yukle(klasor: str | Path = "veri/ag", min_gun: int = 60, asiri: float = 0.25) -> Panel:
    """Ham tablolardan panel. `min_gun`: en az bu kadar getirisi olan hisseler; |getiri| > `asiri` veri hatası sayılır (NaN)."""
    klasor = Path(klasor)
    isy = pd.read_csv(klasor / "isy_panel.csv.gz")
    isy["hisse"] = isy["hisse"].astype(str).str.upper()
    isy = isy[~isy["hisse"].isin(HARIC)]
    K = _genis(isy, "HGDG_KAPANIS")
    R = K.pct_change(fill_method=None)
    R = R.where(R.abs() <= asiri)
    tut = R.columns[R.notna().sum() >= min_gun]
    K, R = K[tut], R[tut]
    HTL = _genis(isy, "HGDG_HACIM").reindex(columns=tut)
    PD = _genis(isy, "PD").reindex(columns=tut)
    HAO = _genis(isy, "HAO_PD").reindex(columns=tut)
    AOF = _genis(isy, "HGDG_AOF").reindex(columns=tut)
    DOLAR = _genis(isy, "DOLAR_BAZLI_FIYAT").reindex(columns=tut)
    xu = isy.groupby("tarih")["END_DEGER"].median()
    xu.index = pd.to_datetime(xu.index)
    xu100 = xu.sort_index().pct_change()
    yh = pd.read_csv(klasor / "gunluk_panel.csv.gz", usecols=["hisse", "tarih", "acilis", "kapanis", "yuksek", "dusuk"])
    yh["hisse"] = yh["hisse"].astype(str).str.upper()
    yh["gi"] = yh["kapanis"] / yh["acilis"] - 1
    GI = _genis(yh, "gi").reindex(index=R.index, columns=tut)
    GI = GI.where(GI.abs() <= asiri)
    GECE = (1 + R) / (1 + GI) - 1
    GECE = GECE.where(GECE.abs() <= asiri)
    tv = pd.read_csv(klasor / "tv_tarama.csv")
    ev = evren_kur(tv).reindex(tut)
    ev["sektor"] = ev["sektor"].fillna("diger")
    ev["ana"] = ev["ana"].fillna("diger")
    ev["grup"] = ev["grup"].fillna("alt_pazar")
    ev["ilk_gun"] = R.apply(lambda s: s.first_valid_index()).map(lambda t: t.strftime("%Y-%m-%d") if pd.notna(t) else None)
    ev["gun"] = R.notna().sum()
    son = PD.ffill().iloc[-1]
    ev["pd_son"] = son
    ev["hao_son"] = HAO.ffill().iloc[-1]
    ev["halka_aciklik"] = (ev["hao_son"] / ev["pd_son"]).clip(0, 1)
    ev["hacim_60g"] = HTL.tail(60).mean()
    return Panel(K=K, R=R, GI=GI, GECE=GECE, HTL=HTL, PD=PD, HAO=HAO, AOF=AOF, DOLAR=DOLAR, xu100=xu100.reindex(R.index), evren=ev)


def seriler_yukle(klasor: str | Path = "veri/ag") -> pd.DataFrame:
    """Uzun dönem günlük seriler (sektör endeksleri, madenler, küresel): geniş kapanış tablosu (tarih × sembol).
    BIST endekslerinde 27 Temmuz 2020'deki iki sıfır atılması düzeltilir (öncesi 100'e bölünür)."""
    d = pd.read_csv(Path(klasor) / "seriler_gunluk.csv.gz")
    g = d.pivot_table(index="tarih", columns="sembol", values="kapanis", aggfunc="last")
    g.index = pd.to_datetime(g.index)
    g = g.sort_index()
    for c in g.columns:
        if c.endswith(".IS") and c.startswith("X"):
            s = g[c].dropna()
            oran = s / s.shift(1)
            kirik = oran[(oran < 0.02) & (oran.index > "2020-07-01") & (oran.index < "2020-08-15")]
            if len(kirik):
                t = kirik.index[0]
                g.loc[g.index < t, c] = g.loc[g.index < t, c] / 100.0
    return g


def saatlik_yukle(klasor: str | Path = "veri/ag", hisseler: list[str] | None = None) -> pd.DataFrame:
    """Payların ham saatlik çubukları (uzun tablo): hisse, zaman, gun, saat ('09:30'...'17:30'), acilis, kapanis, hacim, tl_hacim."""
    h = pd.read_csv(Path(klasor) / "hisse_saatlik.csv.gz")
    h["hisse"] = h["hisse"].astype(str).str.upper()
    if hisseler is not None:
        h = h[h["hisse"].isin(set(hisseler))]
    h = h[~h["hisse"].isin(HARIC)]
    h["gun"] = h["zaman"].str.slice(0, 10)
    h["saat"] = h["zaman"].str.slice(11, 16)
    h["tl_hacim"] = h["hacim"] * h["kapanis"]
    return h


def saat_getirileri(h: pd.DataFrame, P: Panel | None = None) -> pd.DataFrame:
    """Gün × saat dilimi getirileri (uzun tablo). Dilimler: 'gece' (önceki kapanış→açılış), '09:30' (açılış seansı + 10:00–10:30),
    '10:30' … '16:30' (saatlik), '17:30' (17:30–18:00, yalnız çubuğun olduğu günler). Dilim getirisi = çubuk kapanışı / önceki nokta − 1;
    gün içi zincir açılıştan başlar. `P` verilirse gece getirisi panelden (düzeltilmiş) alınır."""
    h = h.sort_values(["hisse", "zaman"])
    onceki = h.groupby(["hisse", "gun"])["kapanis"].shift(1)
    h = h.assign(getiri=np.where(onceki.isna(), h["kapanis"] / h["acilis"] - 1, h["kapanis"] / onceki - 1))
    h = h[h["getiri"].abs() <= 0.25]
    out = h[["hisse", "gun", "saat", "getiri", "tl_hacim"]]
    if P is not None:
        g = P.GECE.stack().rename("getiri").reset_index()
        g.columns = ["gun", "hisse", "getiri"]
        g["gun"] = g["gun"].dt.strftime("%Y-%m-%d")
        g = g[g["hisse"].isin(set(h["hisse"])) & g["gun"].isin(set(h["gun"]))]
        g["saat"] = "gece"
        g["tl_hacim"] = np.nan
        out = pd.concat([out, g[["hisse", "gun", "saat", "getiri", "tl_hacim"]]], ignore_index=True)
    return out
