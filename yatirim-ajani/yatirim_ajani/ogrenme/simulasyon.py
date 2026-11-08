"""Strateji simülatörü: saatlik veriden günlük iki "bacak", maliyetli portföy, ödül.

Her işlem günü t iki bacağa bölünür:
    GÜNDÜZ bacağı: açılış(t) → kapanış(t)        (seans içi)
    GECE bacağı:   kapanış(t) → açılış(t+1)      (geceyi taşıma)
Bir strateji, her bacak için hisse ağırlıkları (toplamı ≤ 1, kalan nakit) üretir ve bunu yalnız
o bacağın BAŞLANGICINA kadar görünen bilgiyle yapar. Maliyet, ardışık bacaklar arasındaki ağırlık
değişiminin tek yön maliyetiyle çarpımıdır; pozisyonu taşımak bedavadır, değiştirmek değildir.

Ödül (RL dilinde): odul = log(W_T / W_0) - ceza * max_dusus. Strateji ya da model seçimi yalnız
seçim penceresindeki ödüle göre yapılır; raporlanan "bugünkü para" üç biçimde verilir:
    tum_donem      : tüm geçmiş (geriye bakışlı; seçim bu veriye bakılarak yapıldıysa şişkindir)
    test_gunleri   : yalnız rastgele test günleri (modelin görmediği günler)
    ileriye_yuruyen: ilk 12 ay seçim/eğitim, kalan dönem ölçüm (en dürüst "bugün ne olurdu")
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import numpy as np
import pandas as pd

from ..ayarlar import Piyasa
from ..veri.bolme import Bolme
from ..veri.saatlik import SaatlikVeriSeti

BACAKLAR = ("gunduz", "gece")


@dataclass
class Panel:
    """Günlük panel: satır = gün, sütun = hisse."""

    acilis: pd.DataFrame  # günün ilk açılışı
    kapanis: pd.DataFrame  # günün son kapanışı
    gunduz: pd.DataFrame  # kapanış/açılış - 1
    gece: pd.DataFrame  # ertesi açılış/kapanış - 1 (son gün NaN)
    gunler: pd.DatetimeIndex

    @property
    def hisseler(self) -> list[str]:
        return list(self.kapanis.columns)


def panel_kur(vs: SaatlikVeriSeti, piyasa: Piyasa, hisseler: list[str], haric: tuple[str, ...] = ("TERA",)) -> Panel:
    ac, kap = {}, {}
    for h in hisseler:
        if any(h.upper().startswith(x) for x in haric):
            continue
        df = vs.saatlik(piyasa.sembol(h))
        if df.empty:
            continue
        gun = pd.Series(pd.to_datetime(df.index.date), index=df.index)
        ac[h] = df["acilis"].groupby(gun).first()
        kap[h] = df["kapanis"].groupby(gun).last()
    acilis = pd.DataFrame(ac).sort_index()
    kapanis = pd.DataFrame(kap).sort_index()
    # Hisselerin ortak günleri: eksik gün olan hisse o gün nakit sayılır (NaN → 0 getiri, 0 ağırlık)
    gunduz = kapanis / acilis - 1
    gece = acilis.shift(-1) / kapanis - 1
    return Panel(acilis, kapanis, gunduz, gece, pd.DatetimeIndex(kapanis.index))


# ----------------------------------------------------------------------------------------------
# Stratejiler: (panel, t) → (gunduz_agirlik[t], gece_agirlik[t]); yalnız t'ye kadar görünen bilgi.
# Gündüz bacağı için karar t günü açılışında (yani t-1 kapanışına kadar veri), gece için t kapanışında.
# Basitlik için her strateji bir Series çifti döndürür; NaN'lar 0 sayılır.
# ----------------------------------------------------------------------------------------------
Strateji = Callable[[Panel, int], tuple[pd.Series, pd.Series]]


def _esit(hisseler: list[str], secim: pd.Series | None = None) -> pd.Series:
    w = pd.Series(0.0, index=hisseler)
    if secim is None:
        w[:] = 1.0 / len(hisseler)
    elif secim.any():
        w[secim[secim].index] = 1.0 / int(secim.sum())
    return w


def s_al_tut(p: Panel, t: int) -> tuple[pd.Series, pd.Series]:
    w = _esit(p.hisseler)
    return w, w


def s_gece(p: Panel, t: int) -> tuple[pd.Series, pd.Series]:
    return pd.Series(0.0, index=p.hisseler), _esit(p.hisseler)


def s_gunduz(p: Panel, t: int) -> tuple[pd.Series, pd.Series]:
    return _esit(p.hisseler), pd.Series(0.0, index=p.hisseler)


def _momentum(p: Panel, t: int, pencere: int = 20) -> pd.Series | None:
    if t < pencere:
        return None
    return p.kapanis.iloc[t] / p.kapanis.iloc[t - pencere] - 1


def s_gece_momentum(p: Panel, t: int) -> tuple[pd.Series, pd.Series]:
    m = _momentum(p, t)
    sifir = pd.Series(0.0, index=p.hisseler)
    if m is None:
        return sifir, sifir
    return sifir, _esit(p.hisseler, m > 0)


def s_trend_50(p: Panel, t: int) -> tuple[pd.Series, pd.Series]:
    """Kapanış 50 günlük ortalamanın üstündeyse tut (gece dahil); günlük yeniden denge."""
    sifir = pd.Series(0.0, index=p.hisseler)
    if t < 50:
        return sifir, sifir
    ort = p.kapanis.iloc[t - 49 : t + 1].mean()
    secim = p.kapanis.iloc[t] > ort
    # gündüz bacağı kararı t açılışında: t-1 bilgisiyle
    ort_onceki = p.kapanis.iloc[t - 50 : t].mean()
    secim_onceki = p.kapanis.iloc[t - 1] > ort_onceki
    return _esit(p.hisseler, secim_onceki), _esit(p.hisseler, secim)


def s_haftalik_momentum(p: Panel, t: int, n: int = 10) -> tuple[pd.Series, pd.Series]:
    """Her hafta başı 20 günlük momentumu en yüksek n hisseye eşit ağırlık; hafta boyu tutulur."""
    sifir = pd.Series(0.0, index=p.hisseler)
    if t < 21:
        return sifir, sifir
    # Karar en son pazartesi (ya da ilk işlem günü) açılışında, t-1 kapanış bilgisiyle verilmiş sayılır.
    k = t
    while k > 21 and p.gunler[k].weekday() <= p.gunler[k - 1].weekday():
        k -= 1
    m = p.kapanis.iloc[k - 1] / p.kapanis.iloc[k - 21] - 1
    secim = m.rank(ascending=False) <= n
    w = _esit(p.hisseler, secim)
    return w, w


STRATEJILER: dict[str, Strateji] = {
    "al_tut": s_al_tut,
    "gece": s_gece,
    "gunduz": s_gunduz,
    "gece_momentum": s_gece_momentum,
    "trend_50": s_trend_50,
    "haftalik_momentum": s_haftalik_momentum,
}


# ----------------------------------------------------------------------------------------------
@dataclass
class SimSonuc:
    ad: str
    baslangic: float
    bitis: float
    getiri: float
    yillik: float
    max_dusus: float
    islem_maliyeti: float  # toplam, para biriminde
    bacak_sayisi: int
    odul: float
    egri: pd.Series = field(repr=False)

    def satir(self) -> str:
        return (
            f"{self.ad:<20} {self.bitis:>14,.0f}  {self.getiri:+8.1%}  yıllık {self.yillik:+7.1%}  "
            f"maks düşüş {self.max_dusus:6.1%}  maliyet {self.islem_maliyeti:>10,.0f}  ödül {self.odul:+.3f}"
        )


def simule(
    panel: Panel,
    strateji: Strateji,
    ad: str,
    nakit: float,
    tek_yon_maliyet: float,
    gun_maskesi: np.ndarray | None = None,
    ceza: float = 1.0,
    bas: int = 0,
    bit: int | None = None,
) -> SimSonuc:
    """gun_maskesi verilirse yalnız o günlerin bacakları birleştirilir (diğer günler atlanır)."""
    bit = len(panel.gunler) - 1 if bit is None else bit
    W = nakit
    onceki = pd.Series(0.0, index=panel.hisseler)
    egri = {}
    maliyet_toplam = 0.0
    bacak = 0
    zirve = W
    max_dd = 0.0
    for t in range(bas, bit):
        if gun_maskesi is not None and not gun_maskesi[t]:
            continue
        w_gun, w_gece = strateji(panel, t)
        for w, getiri in ((w_gun.fillna(0.0), panel.gunduz.iloc[t]), (w_gece.fillna(0.0), panel.gece.iloc[t])):
            getiri = getiri.reindex(panel.hisseler)
            w = w.where(getiri.notna(), 0.0)  # verisi olmayan hisse nakit
            if w.sum() > 1.0 + 1e-9:
                w = w / w.sum()
            maliyet = float((w - onceki).abs().sum()) * tek_yon_maliyet * W
            W -= maliyet
            maliyet_toplam += maliyet
            W *= 1.0 + float((w * getiri.fillna(0.0)).sum())
            onceki = w
            bacak += 1
            zirve = max(zirve, W)
            max_dd = min(max_dd, W / zirve - 1)
        egri[panel.gunler[t]] = W
    # Son bacakta pozisyonu kapat (maliyetiyle)
    maliyet = float(onceki.abs().sum()) * tek_yon_maliyet * W
    W -= maliyet
    maliyet_toplam += maliyet
    seri = pd.Series(egri, name=ad)
    gun_sayisi = max(len(seri), 1)
    getiri = W / nakit - 1
    yillik = (W / nakit) ** (252 / gun_sayisi) - 1 if W > 0 else -1.0
    odul = float(np.log(max(W, 1e-9) / nakit) - ceza * abs(max_dd))
    return SimSonuc(ad, nakit, W, getiri, yillik, max_dd, maliyet_toplam, bacak, odul, seri)


def uc_olcum(
    panel: Panel,
    strateji: Strateji,
    ad: str,
    nakit: float,
    tek_yon_maliyet: float,
    bolme: Bolme,
    kesme: int,
) -> dict[str, SimSonuc]:
    """tum_donem, test_gunleri ve ileriye_yuruyen (kesme indeksinden sonrası) ölçümleri."""
    test = bolme.maske(panel.gunler, "test")
    return {
        "tum_donem": simule(panel, strateji, ad, nakit, tek_yon_maliyet),
        "test_gunleri": simule(panel, strateji, ad, nakit, tek_yon_maliyet, gun_maskesi=test),
        "ileriye_yuruyen": simule(panel, strateji, ad, nakit, tek_yon_maliyet, bas=kesme),
    }


def kesme_indeksi(panel: Panel, ay: int = 12) -> int:
    hedef = panel.gunler[0] + pd.DateOffset(months=ay)
    return int(np.searchsorted(panel.gunler, hedef))


# ----------------------------------------------------------------------------------------------
# Model kapılı strateji: kapanışta ertesi günün kapanıştan kapanışa getirisini tahmin et;
# tahmin (maliyet sonrası) eşiği geçen hisseleri gece + ertesi gün tut. Pozisyon değişmedikçe
# maliyet yok. Model ileriye yürüyen biçimde eğitilir: yalnız `egitim_bitis` indeksine kadarki
# ve train etiketli günlerle.
# ----------------------------------------------------------------------------------------------
GUNLUK_OZELLIKLER = [
    "g1", "g2", "g3", "g4", "g5", "mom20", "mom60", "oyn20", "gunduz_bugun", "gece_dun", "piyasa1", "piyasa5", "piyasa20",
]  # fmt: skip


def gunluk_ozellikler(panel: Panel, gosterge: pd.Series | None) -> dict[str, pd.DataFrame]:
    k = panel.kapanis
    g = k.pct_change()
    oz: dict[str, pd.DataFrame] = {}
    for i in range(1, 6):
        oz[f"g{i}"] = g.shift(i - 1)
    oz["mom20"] = k / k.shift(20) - 1
    oz["mom60"] = k / k.shift(60) - 1
    oz["oyn20"] = g.rolling(20).std()
    oz["gunduz_bugun"] = panel.gunduz
    oz["gece_dun"] = panel.gece.shift(1)
    if gosterge is None:
        gosterge = k.mean(axis=1)
    pg = gosterge.reindex(k.index).ffill()
    for ad, n in (("piyasa1", 1), ("piyasa5", 5), ("piyasa20", 20)):
        oz[ad] = pd.DataFrame({h: pg / pg.shift(n) - 1 for h in k.columns})
    return oz


def hedef_ertesi_gun(panel: Panel) -> pd.DataFrame:
    """Kapanış(t) → kapanış(t+1); karar t kapanışında verilir."""
    return panel.kapanis.shift(-1) / panel.kapanis - 1


def uzun_tablo(oz: dict[str, pd.DataFrame], hedef: pd.DataFrame, gunler: pd.DatetimeIndex) -> pd.DataFrame:
    parcalar = []
    for h in hedef.columns:
        df = pd.DataFrame({ad: oz[ad][h] for ad in GUNLUK_OZELLIKLER})
        df["hedef"] = hedef[h]
        df["hisse"] = h
        df["gun"] = gunler
        parcalar.append(df)
    t = pd.concat(parcalar).dropna()
    t[GUNLUK_OZELLIKLER] = t[GUNLUK_OZELLIKLER].clip(-1, 1)
    return t.reset_index(drop=True)


@dataclass
class ModelKapili:
    """Eğitilmiş tahminciyi strateji arayüzüne bağlar."""

    tahmin: pd.DataFrame  # gün × hisse: tahmini kapanıştan kapanışa getiri (NaN = veri yok)
    esik: float  # maliyet sonrası
    gidis_donus: float
    en_fazla: int = 10

    def __call__(self, p: Panel, t: int) -> tuple[pd.Series, pd.Series]:
        sifir = pd.Series(0.0, index=p.hisseler)
        gun = p.gunler[t]
        if gun not in self.tahmin.index:
            return sifir, sifir
        th = self.tahmin.loc[gun].reindex(p.hisseler)
        net = th - self.gidis_donus
        secim = (net >= self.esik) & (net.rank(ascending=False) <= self.en_fazla)
        w_gece = _esit(p.hisseler, secim.fillna(False))
        # Gündüz bacağı: dünkü karar taşınır (t-1 kapanışındaki seçim)
        if t > 0 and p.gunler[t - 1] in self.tahmin.index:
            th0 = self.tahmin.loc[p.gunler[t - 1]].reindex(p.hisseler) - self.gidis_donus
            secim0 = (th0 >= self.esik) & (th0.rank(ascending=False) <= self.en_fazla)
            w_gun = _esit(p.hisseler, secim0.fillna(False))
        else:
            w_gun = sifir
        return w_gun, w_gece


def model_egit_ve_tahmin(
    tablo: pd.DataFrame,
    egitim_bitis: pd.Timestamp,
    train_maskesi: np.ndarray,
    tur: str = "ridge",
    ridge: float = 1.0,
) -> tuple[pd.DataFrame, dict[str, float]]:
    """`egitim_bitis`ten önceki ve train etiketli günlerle eğitir; TÜM günler için tahmin döndürür.

    Tahminler eğitim dönemi için örnek içi (şişkin), sonrası için gerçek ileriye dönüktür.
    """
    from .mlp import egit_mlp
    from .rl import _ridge

    egit = (tablo["gun"] < egitim_bitis).to_numpy() & train_maskesi
    X = tablo[GUNLUK_OZELLIKLER].to_numpy(dtype=float)
    y = tablo["hedef"].to_numpy(dtype=float)
    bilgi: dict[str, float] = {"egitim_satiri": int(egit.sum())}
    if tur == "mlp":
        m, b = egit_mlp(X[egit], y[egit])
        th = m.tahmin(X)
        bilgi.update(b)
    else:
        m2 = _ridge(X[egit], y[egit], ridge)
        th = m2.q(X)
    dis = ~egit & (tablo["gun"] >= egitim_bitis).to_numpy()
    if dis.sum() > 10 and th[dis].std() > 0:
        bilgi["disari_korelasyon"] = float(np.corrcoef(th[dis], y[dis])[0, 1])
    bilgi["ici_korelasyon"] = float(np.corrcoef(th[egit], y[egit])[0, 1]) if th[egit].std() > 0 else 0.0
    tah = pd.Series(th, index=pd.MultiIndex.from_arrays([tablo["gun"], tablo["hisse"]])).unstack()
    return tah, bilgi
