"""Yatırımcı tipleri: büyük (yabancı, kurumsal, fon) ve küçük (bireysel) yatırımcının hangi ölçülere göre işlem yaptığına dair vekil analizler.

Hesap bazında veri yoktur; çıkarımlar şu vekillere dayanır:
- Hisse grubu: BIST 100 içi (yabancı ve kurumsal ağırlıklı fiyatlama) / BIST 100 dışı (bireysel ağırlıklı).
- Dikkat olayları: tavan/taban dizileri, hacim patlaması, halka arz ilk günleri (bireysel ilgi).
- Kesit faktör primleri: hangi özellik hangi grupta ödüllendiriliyor (o grubun marjinal yatırımcısının baktığı ölçü).
- Fon şirketlerinin KAP pay bildirimleri: hedef hisselerin özellikleri ve bildirim çevresindeki fiyat.
Tüm testlerde tavan/tabanda kapanan hisseler giriş günü olarak sayılmaz (o fiyattan işlem yapılamaz).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .panel import Panel

TAVAN = 0.095  # günlük fiyat marjı %10; kapanış adımları yüzünden eşik %9,5


def _ozet(x: pd.Series) -> dict:
    x = x.dropna()
    if len(x) < 5:
        return {"n": int(len(x))}
    return {"n": int(len(x)), "ort": float(x.mean()), "medyan": float(x.median()), "t": float(x.mean() / (x.std() / np.sqrt(len(x)))) if x.std() > 0 else None, "pozitif": float((x > 0).mean())}


def _gun_kumeli(deger: pd.Series, gun: pd.Series) -> dict:
    """Olay getirilerinin gün kümelenmiş özeti: önce gün ortalaması, sonra günler üzerinden t (aynı günün olayları bağımsız sayılmaz)."""
    d = pd.DataFrame({"v": deger, "g": gun}).dropna()
    if len(d) < 5:
        return {"n": int(len(d))}
    g = d.groupby("g")["v"].mean()
    return {"n": int(len(d)), "gun": int(len(g)), "ort": float(d["v"].mean()), "medyan": float(d["v"].median()), "pozitif": float((d["v"] > 0).mean()),
            "t": float(g.mean() / (g.std() / np.sqrt(len(g)))) if len(g) > 5 and g.std() > 0 else None}  # fmt: skip


def ileri_getiri(P: Panel, ufuklar: tuple[int, ...] = (1, 5, 20), anormal: bool = True) -> dict[int, pd.DataFrame]:
    """t kapanışından t+k kapanışına getiri (anormal = aynı dönemin tüm hisse ortalamasından fark)."""
    out = {}
    lr = np.log1p(P.R)
    for k in ufuklar:
        f = np.expm1(lr.rolling(k, min_periods=k).sum().shift(-k))
        out[k] = f.sub(f.mean(axis=1), axis=0) if anormal else f
    return out


# --- tavan / taban dizileri ---------------------------------------------------------------------
def tavan_dizileri(P: Panel) -> dict:
    """Tavan (≥ +%9,5) ve taban (≤ −%9,5) günleri: dizi uzunlukları, devam olasılığı, dizi bitince ne oluyor."""
    R = P.R
    grup = P.evren["bist100"].reindex(R.columns).fillna(0).astype(int)
    ileri = ileri_getiri(P, (1, 5, 20))
    out: dict = {}
    for ad, maske in (("tavan", R >= TAVAN), ("taban", R <= -TAVAN)):
        m = maske.fillna(False)
        # dizi sayacı
        say = np.zeros(m.shape, int)
        a = m.to_numpy()
        for i in range(a.shape[0]):
            say[i] = np.where(a[i], (say[i - 1] if i else 0) + 1, 0)
        S = pd.DataFrame(say, index=R.index, columns=R.columns)
        sonraki = m.shift(-1)
        satir = {}
        for k in (1, 2, 3, 4, 5):
            sec = S == k if k < 5 else S >= 5
            n = int(sec.sum().sum())
            if n < 20:
                continue
            devam = float(sonraki.where(sec).stack().mean())
            satir[str(k) if k < 5 else "5+"] = {"n": n, "ertesi_gun_devam": devam, "ertesi_gun_getiri": float(P.R.shift(-1).where(sec).stack().mean()),
                                               "ertesi_gece": float(P.GECE.shift(-1).where(sec).stack().mean()), "ertesi_gunici": float(P.GI.shift(-1).where(sec).stack().mean())}  # fmt: skip
        # dizi bittiği gün (dün dizideydi, bugün değil): bugünün kapanışından sonrası alınabilir
        bitti = (S.shift(1) >= 1) & (~m) & R.notna()
        uzunluk = S.shift(1).where(bitti)
        b = {"n": int(bitti.sum().sum()), "bitis_gunu_getiri": float(R.where(bitti).stack().mean())}
        for kk, f in ileri.items():
            v = f.where(bitti).stack()
            b[f"sonraki_{kk}g"] = _gun_kumeli(v, v.index.get_level_values(0))
        for etiket, sec in (("dizi_1", uzunluk == 1), ("dizi_2_3", (uzunluk >= 2) & (uzunluk <= 3)), ("dizi_4+", uzunluk >= 4)):
            v = ileri[5].where(sec).stack()
            b[f"{etiket}_sonraki_5g"] = _gun_kumeli(v, v.index.get_level_values(0))
        # ilk tavan/taban günü: ertesi gün açılıştan alınsa (gece getirisi kaçar): t+1 açılış → t+5 kapanış yaklaşık = ileri_5 − ertesi gece
        ilk = S == 1
        v5 = ileri_getiri(P, (5,), anormal=False)[5].where(ilk)
        gece = P.GECE.shift(-1).where(ilk)
        acilistan = ((1 + v5) / (1 + gece) - 1).stack()
        out[ad] = {"gun": int(m.sum().sum()), "hisse_gun_orani": float(m.sum().sum() / R.notna().sum().sum()), "bist100_gun": int(m.loc[:, grup == 1].sum().sum()),
                   "dizi": satir, "dizi_bitince": b, "ilk_gunden_sonra_acilistan_5g": _gun_kumeli(acilistan, acilistan.index.get_level_values(0)),
                   "yillik": {str(y): int(m[m.index.year == y].sum().sum()) for y in sorted(set(m.index.year))}}  # fmt: skip
    return out


# --- kesit sıralamaları -------------------------------------------------------------------------
def _dilim_testi(X: pd.DataFrame, Y: pd.DataFrame, gecerli: pd.DataFrame, adim: int = 1, dilim: int = 5, min_hisse: int = 40) -> dict:
    """Her `adim` günde X'e göre beşte birlikler → Y ortalaması. Döner: dilim ortalamaları, üst−alt fark ve t (dönemler üzerinden)."""
    farklar, ort = [], [[] for _ in range(dilim)]
    for t in X.index[::adim]:
        x, y = X.loc[t], Y.loc[t]
        ok = x.notna() & y.notna() & gecerli.loc[t]
        if ok.sum() < min_hisse:
            continue
        q = pd.qcut(x[ok].rank(method="first"), dilim, labels=False)
        m = y[ok].groupby(q).mean()
        for k in range(dilim):
            ort[k].append(m.get(k, np.nan))
        farklar.append(m.get(dilim - 1, np.nan) - m.get(0, np.nan))
    f = pd.Series(farklar).dropna()
    if len(f) < 8:
        return {"donem": int(len(f))}
    yari = len(f) // 2
    return {"donem": int(len(f)), "dilim_ort": [float(np.nanmean(o)) for o in ort], "ust_alt": float(f.mean()), "t": float(f.mean() / (f.std() / np.sqrt(len(f)))) if f.std() > 0 else None,
            "pozitif_donem": float((f > 0).mean()), "yari1": float(f.iloc[:yari].mean()), "yari2": float(f.iloc[yari:].mean())}  # fmt: skip


def temel_panel(mali: pd.DataFrame, P: Panel, gecikme_gun: int = 75) -> dict[str, pd.DataFrame]:
    """Mali kalemlerden nokta-zamanlı (dönem sonu + `gecikme_gun` gün sonra bilinir sayılır) özkaynak ve son 12 ay net kâr panelleri."""
    m = mali.copy()
    m["hisse"] = m["hisse"].astype(str).str.upper()
    m["yil"] = m["donem"].str.split("/").str[0].astype(int)
    m["ay"] = m["donem"].str.split("/").str[1].astype(int)
    m["deger"] = pd.to_numeric(m["deger"], errors="coerce")
    out: dict[str, pd.DataFrame] = {}
    gunler = P.R.index

    def genis(kod: str, akis: bool) -> pd.DataFrame:
        d = m[m["kod"] == kod].pivot_table(index=["yil", "ay"], columns="hisse", values="deger", aggfunc="last").sort_index()
        if akis:  # son 12 ay = bu dönem kümülatif + geçen yıl sonu − geçen yılın aynı dönemi
            ttm = d.copy()
            for y, a in d.index:
                if a == 12:
                    continue
                if (y - 1, 12) in d.index and (y - 1, a) in d.index:
                    ttm.loc[(y, a)] = d.loc[(y, a)] + d.loc[(y - 1, 12)] - d.loc[(y - 1, a)]
                else:
                    ttm.loc[(y, a)] = np.nan
            d = ttm
        bilinme = [pd.Timestamp(year=y, month=a, day=1) + pd.offsets.MonthEnd(0) + pd.Timedelta(days=gecikme_gun + (10 if a == 12 else 0)) for y, a in d.index]
        d.index = pd.DatetimeIndex(bilinme)
        d = d[~d.index.duplicated(keep="last")].sort_index()
        return d.reindex(d.index.union(gunler)).ffill().reindex(gunler).reindex(columns=P.R.columns)

    out["ozkaynak"] = genis("2O", False)
    out["netkar_ttm"] = genis("3Z", True)
    out["satis_ttm"] = genis("3C", True)
    return out


def ozellikler(P: Panel, temel: dict[str, pd.DataFrame] | None = None) -> dict[str, pd.DataFrame]:
    """Kesit özellikleri (tarih × hisse), hepsi t gününe kadar bilinen veriyle."""
    R = P.R
    lr = np.log1p(R)
    X: dict[str, pd.DataFrame] = {}
    X["getiri_1g"] = R
    X["getiri_5g"] = np.expm1(lr.rolling(5, min_periods=4).sum())
    X["getiri_20g"] = np.expm1(lr.rolling(20, min_periods=15).sum())
    X["momentum_120_20"] = np.expm1(lr.rolling(120, min_periods=90).sum().shift(20))
    X["oynaklik_20g"] = R.rolling(20, min_periods=15).std()
    X["max_20g"] = R.rolling(20, min_periods=15).max()
    X["buyukluk"] = np.log(P.PD.where(P.PD > 0))
    X["halka_acik_deger"] = np.log(P.HAO.where(P.HAO > 0))
    X["halka_aciklik"] = (P.HAO / P.PD).clip(0, 1)
    devir = P.HTL / P.HAO.where(P.HAO > 0)
    X["devir_hizi_20g"] = devir.rolling(20, min_periods=15).mean()
    X["hacim_soku"] = P.HTL / P.HTL.rolling(60, min_periods=30).mean().shift(1)
    X["gece_20g"] = P.GECE.rolling(20, min_periods=15).mean()
    X["gunici_20g"] = P.GI.rolling(20, min_periods=15).mean()
    X["zirveye_yakinlik"] = P.K / P.K.rolling(250, min_periods=120).max()
    X["dolar_getiri_120g"] = P.DOLAR / P.DOLAR.shift(120) - 1
    if temel:
        X["defter_piyasa"] = (temel["ozkaynak"] / P.PD).where(temel["ozkaynak"] > 0)
        X["kazanc_verimi"] = temel["netkar_ttm"] / P.PD
        X["satis_piyasa"] = (temel["satis_ttm"] / P.PD).where(temel["satis_ttm"] > 0)
        X["roe"] = (temel["netkar_ttm"] / temel["ozkaynak"]).where(temel["ozkaynak"] > 0).clip(-2, 2)
    return X


def faktor_primleri(P: Panel, X: dict[str, pd.DataFrame], ufuk: int = 20) -> dict:
    """Her özellik için beşte birlik sıralaması → sonraki `ufuk` gün getirisi; BIST 100 içi ve dışı ayrı.
    Giriş günü tavan/tabanda olan hisseler alınmaz. Dönemler çakışmasız (her `ufuk` günde bir)."""
    ileri = ileri_getiri(P, (ufuk,), anormal=False)[ufuk]
    girilebilir = P.R.abs() < TAVAN
    likit = P.HTL.rolling(20, min_periods=10).mean() > 2e6  # günde ≥ 2 mn TL
    gruplar = {"bist100": P.evren["bist100"].reindex(P.R.columns) == 1, "bist100_disi": P.evren["bist100"].reindex(P.R.columns) != 1}
    out: dict = {"ufuk_gun": ufuk, "ozellik": {}}
    for ad, x in X.items():
        satir = {}
        for g, sutun in gruplar.items():
            c = sutun[sutun].index
            satir[g] = _dilim_testi(x[c], ileri[c], (girilebilir & likit)[c], adim=ufuk, min_hisse=30 if g == "bist100" else 60)
        out["ozellik"][ad] = satir
    return out


def kisa_vade(P: Panel, X: dict[str, pd.DataFrame]) -> dict:
    """Kısa vadeli devam/dönüş: 1, 5, 20 günlük geçmiş getiri ve hacim şoku → ertesi 1 ve 5 gün (gece ve gün içi ayrı), grup bazında."""
    girilebilir = P.R.abs() < TAVAN
    likit = P.HTL.rolling(20, min_periods=10).mean() > 2e6
    ileri = ileri_getiri(P, (5,), anormal=False)[5]
    hedefler = {"ertesi_gece": P.GECE.shift(-1), "ertesi_gunici": P.GI.shift(-1), "ertesi_gun": P.R.shift(-1), "sonraki_5g": ileri}
    gruplar = {"bist100": P.evren["bist100"].reindex(P.R.columns) == 1, "bist100_disi": P.evren["bist100"].reindex(P.R.columns) != 1}
    out: dict = {}
    for ad in ("getiri_1g", "getiri_5g", "getiri_20g", "hacim_soku", "gece_20g", "gunici_20g", "max_20g"):
        out[ad] = {}
        for g, sutun in gruplar.items():
            c = sutun[sutun].index
            out[ad][g] = {h: _dilim_testi(X[ad][c], Y[c], (girilebilir & likit)[c], adim=5 if h == "sonraki_5g" else 1, min_hisse=30 if g == "bist100" else 60) for h, Y in hedefler.items()}
    return out


def fama_macbeth(P: Panel, X: dict[str, pd.DataFrame], ozellik: list[str], ufuk: int = 20, grup: str | None = None) -> dict:
    """Çakışmasız dönemlerde kesit regresyonu: sonraki `ufuk` gün getirisi ~ standartlaştırılmış özellikler. Katsayıların zaman ortalaması ve t."""
    ileri = ileri_getiri(P, (ufuk,), anormal=False)[ufuk]
    girilebilir = (P.R.abs() < TAVAN) & (P.HTL.rolling(20, min_periods=10).mean() > 2e6)
    c = P.R.columns
    if grup == "bist100":
        c = c[(P.evren["bist100"].reindex(c) == 1).to_numpy()]
    elif grup == "bist100_disi":
        c = c[(P.evren["bist100"].reindex(c) != 1).to_numpy()]
    kat = []
    for t in P.R.index[::ufuk]:
        y = ileri.loc[t, c]
        D = pd.DataFrame({k: X[k].loc[t, c] for k in ozellik})
        ok = y.notna() & D.notna().all(axis=1) & girilebilir.loc[t, c]
        if ok.sum() < max(40, 6 * len(ozellik)):
            continue
        Z = D[ok].rank(pct=True) - 0.5  # sıra tabanlı: uç değerlere dayanıklı; katsayı = en düşükten en yükseğe getiri farkı
        A = np.column_stack([np.ones(ok.sum()), Z.to_numpy()])
        b = np.linalg.lstsq(A, y[ok].to_numpy(), rcond=None)[0]
        kat.append(b[1:])
    K = pd.DataFrame(kat, columns=ozellik)
    if len(K) < 8:
        return {"donem": int(len(K))}
    return {"donem": int(len(K)), "ufuk_gun": ufuk, "grup": grup or "hepsi",
            "katsayi": {k: {"ort": float(K[k].mean()), "t": float(K[k].mean() / (K[k].std() / np.sqrt(len(K)))), "pozitif": float((K[k] > 0).mean())} for k in ozellik}}  # fmt: skip


# --- halka arzlar -------------------------------------------------------------------------------
def halka_arzlar(P: Panel, ilk_tarih: str = "2024-01-20") -> dict:
    """Örneklem içinde işlem görmeye başlayan paylar: ilk günlerdeki tavan dizisi, dizi sonrası getiriler, halka açık büyüklükle ilişki."""
    ev = P.evren
    yeni = [h for h in P.R.columns if pd.notna(ev.at[h, "ilk_gun"]) and ev.at[h, "ilk_gun"] >= ilk_tarih]
    satir = []
    for h in yeni:
        r = P.R[h].dropna()
        if len(r) < 25:
            continue
        dizi = 0
        for v in r:
            if v >= TAVAN:
                dizi += 1
            else:
                break
        k = P.K[h].dropna()
        i0 = dizi  # dizi bitiş günü (ilk tavan olmayan gün) kapanışı; r[0] ilk günden ikinci güne getiri olduğundan k indeksinde +1
        if i0 + 1 >= len(k):
            continue
        p0 = k.iloc[i0 + 1]

        def sonra(g: int) -> float:
            return float(k.iloc[i0 + 1 + g] / p0 - 1) if i0 + 1 + g < len(k) else np.nan

        xu = (1 + P.xu100.fillna(0)).cumprod()
        t0 = k.index[i0 + 1]

        def xu_sonra(g: int) -> float:
            j = xu.index.get_loc(t0)
            return float(xu.iloc[j + g] / xu.iloc[j] - 1) if j + g < len(xu) else np.nan

        hao = P.HAO[h].dropna()
        satir.append({"hisse": h, "ilk_gun": ev.at[h, "ilk_gun"], "tavan_dizisi": dizi, "dizi_getirisi": float(k.iloc[i0] / k.iloc[0] - 1),
                      "hao_ilk": float(hao.iloc[0]) if len(hao) else np.nan, "halka_aciklik": float(ev.at[h, "halka_aciklik"]) if pd.notna(ev.at[h, "halka_aciklik"]) else np.nan,
                      "sonra_5g": sonra(5) - xu_sonra(5), "sonra_20g": sonra(20) - xu_sonra(20), "sonra_60g": sonra(60) - xu_sonra(60), "sonra_120g": sonra(120) - xu_sonra(120),
                      "bugune": float(k.iloc[-1] / p0 - 1) - float(xu.iloc[-1] / xu.loc[t0] - 1), "sektor": ev.at[h, "sektor"]})  # fmt: skip
    D = pd.DataFrame(satir)
    if D.empty:
        return {"hisse": 0}
    out: dict = {"hisse": int(len(D)), "yillara_gore": D.groupby(D["ilk_gun"].str[:4]).size().to_dict(), "tavan_dizisi_dagilim": D["tavan_dizisi"].value_counts().sort_index().to_dict(),
                 "tavan_dizisi_ort": float(D["tavan_dizisi"].mean()), "dizi_getirisi_ort": float(D["dizi_getirisi"].mean())}  # fmt: skip
    for c in ("sonra_5g", "sonra_20g", "sonra_60g", "sonra_120g", "bugune"):
        out[c] = _ozet(D[c])
    D["dizi_grubu"] = pd.cut(D["tavan_dizisi"], [-1, 0, 2, 5, 99], labels=["0", "1-2", "3-5", "6+"])
    out["dizi_grubuna_gore"] = {str(g): {"n": int(len(x)), "sonra_20g": float(x["sonra_20g"].mean()), "sonra_60g": float(x["sonra_60g"].mean()), "bugune": float(x["bugune"].mean())}
                                for g, x in D.groupby("dizi_grubu", observed=True)}  # fmt: skip
    kucuk = D["hao_ilk"] < D["hao_ilk"].median()
    out["halka_acik_deger_kucuk"] = {"n": int(kucuk.sum()), "tavan_dizisi": float(D.loc[kucuk, "tavan_dizisi"].mean()), "sonra_60g": float(D.loc[kucuk, "sonra_60g"].mean())}
    out["halka_acik_deger_buyuk"] = {"n": int((~kucuk).sum()), "tavan_dizisi": float(D.loc[~kucuk, "tavan_dizisi"].mean()), "sonra_60g": float(D.loc[~kucuk, "sonra_60g"].mean())}
    out["sira_kor_dizi_hao"] = float(D["tavan_dizisi"].rank().corr(D["hao_ilk"].rank()))
    out["liste"] = D.sort_values("ilk_gun").round(4).to_dict(orient="records")
    return out


# --- fon şirketlerinin bildirimleri ---------------------------------------------------------------
def fon_olaylari(P: Panel, kayitlar: list[dict], X: dict[str, pd.DataFrame], min_guven: float = 0.4) -> dict:
    """Fon şirketlerinin pay alım/satım bildirimleri: hedef hisselerin bildirim anındaki özellikleri (kesitteki yüzdelik sırasıyla),
    bildirim öncesi ve sonrası anormal getiri (tüm hisse ortalamasına göre), şirket ve yön bazında."""
    gunler = P.R.index
    lr = np.log1p(P.R)
    piyasa = np.log1p(P.R.mean(axis=1))
    satir = []
    for k in kayitlar:
        h, tarih = str(k.get("hisse", "")).upper(), k.get("tarih")
        if h not in P.R.columns or not tarih or (k.get("guven") or 0) < min_guven:
            continue
        t = pd.Timestamp(tarih)
        i = gunler.searchsorted(t)  # bildirim günü ya da sonraki ilk işlem günü
        if i >= len(gunler) or i < 25:
            continue
        g = gunler[i]

        def pencere(a: int, b: int) -> float:
            if i + a < 0 or i + b >= len(gunler):
                return np.nan
            s = lr[h].iloc[i + a : i + b + 1]
            if s.isna().mean() > 0.3:
                return np.nan
            return float(np.expm1(s.sum() - piyasa.iloc[i + a : i + b + 1].sum()))

        oz = {}
        for ad in ("buyukluk", "halka_acik_deger", "halka_aciklik", "devir_hizi_20g", "oynaklik_20g", "getiri_20g", "momentum_120_20", "zirveye_yakinlik", "defter_piyasa", "kazanc_verimi"):
            if ad in X:
                x = X[ad].iloc[i - 1]
                oz[ad] = float(x.rank(pct=True).get(h, np.nan))
        ilk = P.evren.at[h, "ilk_gun"]
        satir.append({"fon_sirketi": k.get("fon_sirketi"), "hisse": h, "gun": g, "yon": k.get("yon"), "oran_sonra": k.get("oran_sonra"),
                      "once_20g": pencere(-20, -1), "once_5g": pencere(-5, -1), "gun_0": pencere(0, 0), "sonra_5g": pencere(1, 5), "sonra_20g": pencere(1, 20), "sonra_60g": pencere(1, 60),
                      "halka_arzdan_gun": int((g - pd.Timestamp(ilk)).days) if isinstance(ilk, str) else None, **{f"oz_{a}": b for a, b in oz.items()}})  # fmt: skip
    D = pd.DataFrame(satir)
    if D.empty:
        return {"olay": 0}
    out: dict = {"olay": int(len(D)), "hisse": int(D["hisse"].nunique()), "sirket": int(D["fon_sirketi"].nunique())}
    ozk = [c for c in D.columns if c.startswith("oz_")]
    out["hedef_ozellikleri_yuzdelik"] = {c[3:]: {"medyan": float(D.drop_duplicates(["fon_sirketi", "hisse"])[c].median()), "n": int(D.drop_duplicates(["fon_sirketi", "hisse"])[c].notna().sum())} for c in ozk}
    for yon in ("alim", "satim"):
        d = D[D["yon"] == yon]
        out[yon] = {c: _gun_kumeli(d[c], d["gun"]) for c in ("once_20g", "once_5g", "gun_0", "sonra_5g", "sonra_20g", "sonra_60g")}
    out["sirket"] = {}
    for s, d in D.groupby("fon_sirketi"):
        if len(d) < 3:
            continue
        ilkler = d.drop_duplicates("hisse")
        out["sirket"][str(s)] = {"olay": int(len(d)), "hisse": sorted(set(d["hisse"])), "alim": int((d["yon"] == "alim").sum()), "satim": int((d["yon"] == "satim").sum()),
                                 "ozellik_medyan": {c[3:]: (float(ilkler[c].median()) if ilkler[c].notna().any() else None) for c in ozk},
                                 "alim_once_20g": float(d.loc[d["yon"] == "alim", "once_20g"].mean()) if (d["yon"] == "alim").any() else None,
                                 "alim_sonra_20g": float(d.loc[d["yon"] == "alim", "sonra_20g"].mean()) if (d["yon"] == "alim").any() else None,
                                 "satim_sonra_20g": float(d.loc[d["yon"] == "satim", "sonra_20g"].mean()) if (d["yon"] == "satim").any() else None}  # fmt: skip
    out["olaylar"] = D.assign(gun=D["gun"].dt.strftime("%Y-%m-%d")).round(4).to_dict(orient="records")
    return out


def olay_penceresi(P: Panel, hisseler: list[str], bas: str, bit: str, kiyas: list[str] | None = None) -> dict:
    """Bir hisse kümesinin belirli bir dönemdeki toplu getirisi ve kıyas kümesiyle farkı (ör. tasfiye edilen fonların tuttuğu hisseler, Eylül 2026)."""
    h = [x for x in hisseler if x in P.R.columns]
    k = [x for x in (kiyas or [c for c in P.R.columns if c not in set(h) and P.evren.at[c, "bist100"] != 1]) if x in P.R.columns]
    R = P.R.loc[bas:bit]
    a = (1 + R[h].fillna(0)).prod() - 1
    b = (1 + R[k].fillna(0)).prod() - 1
    gunluk = (R[h].mean(axis=1) - R[k].mean(axis=1))
    return {"donem": [bas, bit], "kume": int(len(h)), "kiyas": int(len(k)), "kume_ort": float(a.mean()), "kume_medyan": float(a.median()), "kiyas_ort": float(b.mean()), "kiyas_medyan": float(b.median()),
            "gunluk_fark_t": float(gunluk.mean() / (gunluk.std() / np.sqrt(len(gunluk)))) if gunluk.std() > 0 else None, "kume_en_kotu": [(x, float(v)) for x, v in a.sort_values().head(8).items()],
            "tavan_taban_gun": {"kume_taban": int((R[h] <= -TAVAN).sum().sum()), "kume_gun": int(R[h].notna().sum().sum()), "kiyas_taban": int((R[k] <= -TAVAN).sum().sum()), "kiyas_gun": int(R[k].notna().sum().sum())}}  # fmt: skip
