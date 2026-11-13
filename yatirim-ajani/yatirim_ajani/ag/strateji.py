"""Ağ katmanı bulgularından türetilen günlük kuralların testi (yalnız alım yönlü; açığa satış yok).

Gerçekçilik kuralları:
- Sinyal yalnız geçmiş veriden: t−1 kapanışına kadar bilinen özellik, t kapanışında ya da t+1 açılışında işlem.
- Tavan/tabanda kapanan hisse o fiyattan alınamaz/satılamaz: giriş günü tavanda kapanan alınmaz; çıkış günü tabanda kapanan
  hissede pozisyon ertesi güne taşınır (kilit).
- Likidite: son 20 gün ortalama TL hacmi eşiğin üstünde olan hisseler.
- Maliyet: gidiş-dönüş 10 bp (yalnız komisyon) ve 30 bp (komisyon + alım-satım farkı) senaryoları.
- Çoklu deneme: denenen kural sayısı raporlanır; Deflated Sharpe (Bailey–López de Prado) ile düzeltilir.
"""

from __future__ import annotations

from math import erf, sqrt

import numpy as np
import pandas as pd

from .panel import Panel
from .yatirimci import TAVAN

YIL_GUN = 250


def _phi(x: float) -> float:
    return 0.5 * (1 + erf(x / sqrt(2)))


def _phi_ters(p: float) -> float:
    """Normal dağılımın ters birikimli fonksiyonu (Acklam yaklaşımı)."""
    a = [-3.969683028665376e01, 2.209460984245205e02, -2.759285104469687e02, 1.383577518672690e02, -3.066479806614716e01, 2.506628277459239e00]
    b = [-5.447609879822406e01, 1.615858368580409e02, -1.556989798598866e02, 6.680131188771972e01, -1.328068155288572e01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e00, -2.549732539343734e00, 4.374664141464968e00, 2.938163982698783e00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e00, 3.754408661907416e00]
    if p < 0.02425:
        q = sqrt(-2 * np.log(p))
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    if p > 1 - 0.02425:
        return -_phi_ters(1 - p)
    q = p - 0.5
    r = q * q
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)


def deflated_sharpe(getiri: pd.Series, deneme: int) -> float:
    """Gözlenen (dönemlik) Sharpe'ın, `deneme` adet rastgele kuraldan beklenen en yüksek Sharpe'ı aşma olasılığı."""
    r = getiri.dropna()
    n = len(r)
    if n < 30 or r.std() == 0:
        return float("nan")
    sr = r.mean() / r.std()
    carp = float(((r - r.mean()) ** 3).mean() / r.std() ** 3)
    bas = float(((r - r.mean()) ** 4).mean() / r.std() ** 4)
    var_sr = (1 - carp * sr + (bas - 1) / 4 * sr**2) / (n - 1)
    em = 0.5772156649
    beklenen_enb = sqrt(var_sr) * ((1 - em) * _phi_ters(1 - 1 / max(deneme, 2)) + em * _phi_ters(1 - 1 / (max(deneme, 2) * np.e)))
    return float(_phi((sr - beklenen_enb) / sqrt(var_sr)))


def ozet(getiri: pd.Series, kiyas: pd.Series | None = None, yil_donem: float = YIL_GUN, deneme: int = 1) -> dict:
    """Dönemlik getiri serisinin özeti: yıllık getiri, Sharpe, en büyük düşüş, isabet, iki yarı, kıyasa göre fazla getiri ve t."""
    r = getiri.dropna()
    if len(r) < 20:
        return {"donem": int(len(r))}
    kum = (1 + r).cumprod()
    dusus = float((kum / kum.cummax() - 1).min())
    yari = len(r) // 2
    out = {"donem": int(len(r)), "ort": float(r.mean()), "yillik": float((1 + r.mean()) ** yil_donem - 1), "kumulatif": float(kum.iloc[-1] - 1),
           "sharpe": float(r.mean() / r.std() * np.sqrt(yil_donem)) if r.std() > 0 else None, "t": float(r.mean() / (r.std() / np.sqrt(len(r)))) if r.std() > 0 else None,
           "en_buyuk_dusus": dusus, "pozitif": float((r > 0).mean()), "yari1_ort": float(r.iloc[:yari].mean()), "yari2_ort": float(r.iloc[yari:].mean()),
           "dsr": deflated_sharpe(r, deneme) if deneme > 1 else None}  # fmt: skip
    if kiyas is not None:
        f = (r - kiyas.reindex(r.index)).dropna()
        if len(f) > 20 and f.std() > 0:
            out["fazla_ort"] = float(f.mean())
            out["fazla_t"] = float(f.mean() / (f.std() / np.sqrt(len(f))))
            out["fazla_yari"] = [float(f.iloc[: len(f) // 2].mean()), float(f.iloc[len(f) // 2 :].mean())]
    return out


def _evren(P: Panel, grup: str, min_hacim: float) -> pd.DataFrame:
    """Gün × hisse alınabilirlik maskesi (dünkü bilgiyle): grup üyesi, likit, dün tavan/tabanda kapanmamış."""
    c = P.R.columns
    b100 = (P.evren["bist100"].reindex(c) == 1).to_numpy()
    uye = b100 if grup == "bist100" else ~b100 if grup == "bist100_disi" else np.ones(len(c), bool)
    likit = P.HTL.rolling(20, min_periods=10).mean().shift(1) > min_hacim
    return likit & pd.DataFrame(np.repeat(uye[None, :], len(P.R), 0), index=P.R.index, columns=c)


def gece_tasima(P: Panel, sinyal: pd.DataFrame | None, grup: str = "bist100_disi", ust_pay: float = 0.2, min_hacim: float = 2e7, maliyet: tuple[float, ...] = (0.001, 0.003)) -> dict:
    """Her gün kapanışta sepeti al, ertesi açılışta sat. Sepet: `sinyal`in (t−1 kapanışına kadar bilinen) en yüksek `ust_pay` dilimi;
    `sinyal` yoksa evrenin tamamı. Bugün tavanda kapanan alınmaz. Getiri = ertesi gece getirisi (eşit ağırlık)."""
    ev = _evren(P, grup, min_hacim) & (P.R < TAVAN) & P.R.notna()
    gece = P.GECE.shift(-1)
    if sinyal is not None:
        s = sinyal.shift(1).where(ev)
        esik = s.quantile(1 - ust_pay, axis=1)
        sec = s.ge(esik, axis=0) & ev
    else:
        sec = ev
    brut = gece.where(sec).mean(axis=1)
    adet = sec.sum(axis=1)
    brut = brut[adet >= 5]
    tum = gece.where(ev).mean(axis=1)
    out = {"grup": grup, "ort_hisse": float(adet[adet >= 5].mean()), "brut": ozet(brut, tum)}
    for m in maliyet:
        out[f"net_{int(m * 1e4)}bp"] = ozet(brut - m)
    out["seri"] = brut
    return out


def gunici(P: Panel, kosul: pd.Series, grup: str = "bist100_disi", min_hacim: float = 2e7, maliyet: tuple[float, ...] = (0.001, 0.003)) -> dict:
    """Koşul günlerinde (koşul o günün açılışından önce bilinir) sepeti açılışta al, kapanışta sat. Tabanda kapanan hisse ertesi kapanışa taşınır."""
    ev = _evren(P, grup, min_hacim)
    gi = P.GI.where(ev)
    kilit = (P.R <= -TAVAN) & ev
    gi = gi.where(~kilit, (1 + P.GI) * (1 + P.R.shift(-1)) - 1)  # çıkılamadıysa ertesi günün getirisi eklenir
    gunluk = gi.mean(axis=1)
    k = kosul.reindex(gunluk.index).fillna(False).astype(bool)
    sec = gunluk[k].dropna()
    diger = gunluk[~k].dropna()
    out = {"grup": grup, "gun": int(len(sec)), "kosulsuz_ort": float(gunluk.mean()), "kosul_disi_ort": float(diger.mean()), "brut": ozet(sec, None, yil_donem=max(1.0, len(sec) / max(1, len(gunluk)) * YIL_GUN))}
    for m in maliyet:
        out[f"net_{int(m * 1e4)}bp"] = ozet(sec - m, None, yil_donem=max(1.0, len(sec) / max(1, len(gunluk)) * YIL_GUN))
    return out


def donemsel_portfoy(P: Panel, puan: pd.DataFrame, grup: str = "bist100_disi", ust_pay: float = 0.2, tutma: int = 20, min_hacim: float = 5e6, maliyet: tuple[float, ...] = (0.003, 0.006),
                     bas: str | None = None, bit: str | None = None) -> dict:  # fmt: skip
    """Her `tutma` günde bir: puanı (t kapanışına kadar bilinen) en yüksek `ust_pay` dilimi t+1 açılışında alınır, sonraki dengelemeye kadar tutulur.
    Getiri: ilk gün açılıştan kapanışa, sonra kapanıştan kapanışa; son gün ertesi açılışa kadar değil kapanışa kadar (basitlik). Devir oranı kadar maliyet düşülür."""
    R, GI = P.R, P.GI
    gunler = R.loc[bas:bit].index
    ev = _evren(P, grup, min_hacim)
    onceki: set[str] = set()
    donem_getiri, kiyas_getiri, tarih, devir = [], [], [], []
    for i in range(0, len(gunler) - tutma - 1, tutma):
        t = gunler[i]
        s = puan.loc[t].where(ev.loc[t] & (R.loc[t].abs() < TAVAN))
        s = s.dropna()
        if len(s) < 25:
            continue
        sec = list(s.sort_values().tail(max(5, int(len(s) * ust_pay))).index)
        gun = gunler[i + 1 : i + 1 + tutma]
        blok = R.loc[gun, sec].copy()
        blok.iloc[0] = GI.loc[gun[0], sec]  # giriş: ertesi açılış
        g = float(((1 + blok.fillna(0)).prod() - 1).mean())
        tumu = list(s.index)
        blok2 = R.loc[gun, tumu].copy()
        blok2.iloc[0] = GI.loc[gun[0], tumu]
        kg = float(((1 + blok2.fillna(0)).prod() - 1).mean())
        d = len(set(sec) - onceki) / len(sec) if onceki else 1.0
        donem_getiri.append(g)
        kiyas_getiri.append(kg)
        devir.append(d)
        tarih.append(gun[0])
        onceki = set(sec)
    g = pd.Series(donem_getiri, index=tarih)
    k = pd.Series(kiyas_getiri, index=tarih)
    d = pd.Series(devir, index=tarih)
    out = {"grup": grup, "tutma_gun": tutma, "ort_devir": float(d.mean()) if len(d) else None, "brut": ozet(g, k, yil_donem=YIL_GUN / tutma), "kiyas": ozet(k, None, yil_donem=YIL_GUN / tutma)}
    for m in maliyet:
        out[f"net_{int(m * 1e4)}bp"] = ozet(g - d * m, k, yil_donem=YIL_GUN / tutma)
    out["seri"] = g
    out["kiyas_seri"] = k
    return out


def bilesik_puan(X: dict[str, pd.DataFrame], agirlik: dict[str, float], maske: pd.DataFrame | None = None) -> pd.DataFrame:
    """Özelliklerin kesit yüzdelik sıralarının işaretli ortalaması (her gün). `agirlik`: {özellik: +1/−1}."""
    toplam = None
    for ad, w in agirlik.items():
        x = X[ad].where(maske) if maske is not None else X[ad]
        r = x.rank(axis=1, pct=True) - 0.5
        toplam = r * w if toplam is None else toplam.add(r * w, fill_value=0)
    return toplam / len(agirlik)


def lider_takipci(P: Panel, esik: float = 0.015, grup: str = "bist100_disi", min_hacim: float = 2e7, maliyet: tuple[float, ...] = (0.001, 0.003)) -> dict:
    """Büyük hisse lider, küçük takipçi: XU100 bugün `esik`ten fazla yükseldiyse, kapanışta küçük hisse sepetini al, ertesi kapanışta sat
    (bugün tavanda kapananlar alınmaz; ertesi gün tabanda kapanan bir gün daha taşınır). Kıyas: koşulsuz ertesi gün getirisi."""
    ev = _evren(P, grup, min_hacim).shift(-1).fillna(False) & (P.R < TAVAN) & P.R.notna()  # bugünkü evren (yarının maskesi dünkü bilgiyle = bugün)
    ertesi = P.R.shift(-1)
    kilit = ertesi <= -TAVAN
    ertesi = ertesi.where(~kilit, (1 + ertesi) * (1 + P.R.shift(-2)) - 1)
    gunluk = ertesi.where(ev).mean(axis=1)
    xu = P.xu100
    out: dict = {"esik": esik, "grup": grup, "kosulsuz_ort": float(gunluk.mean())}
    for ad, k in (("guclu_gun_sonrasi", xu >= esik), ("zayif_gun_sonrasi", xu <= -esik), ("ara", (xu > -esik) & (xu < esik))):
        sec = gunluk[k.reindex(gunluk.index).fillna(False)].dropna()
        out[ad] = {"gun": int(len(sec)), "brut": ozet(sec, None, yil_donem=max(1.0, len(sec) / len(gunluk) * YIL_GUN))}
        for m in maliyet:
            out[ad][f"net_{int(m * 1e4)}bp"] = ozet(sec - m, None, yil_donem=max(1.0, len(sec) / len(gunluk) * YIL_GUN))
    return out


def olay_kurali(P: Panel, olay: pd.DataFrame, ufuklar: tuple[int, ...] = (1, 5, 20), grup: str | None = None, min_hacim: float = 5e6) -> dict:
    """Olay günü maskesi (gün × hisse) için: olaydan sonraki günlerde anormal getiri (tüm hisse ortalamasına göre), gün kümelenmiş t.
    Çıkış/kaçınma kuralları için: negatifse 'olay olunca elde tutma'."""
    from .yatirimci import _gun_kumeli, ileri_getiri

    ev = _evren(P, grup or "hepsi", min_hacim).shift(-1).fillna(False)
    m = olay & ev
    ileri = ileri_getiri(P, ufuklar, anormal=True)
    out = {"olay": int(m.sum().sum())}
    for k, f in ileri.items():
        v = f.where(m).stack()
        out[f"sonraki_{k}g"] = _gun_kumeli(v, v.index.get_level_values(0))
    return out
