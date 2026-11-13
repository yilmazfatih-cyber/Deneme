"""Para ve ilgi akışı: saat dilimi profilleri, işlem ilgisinin sektörler arasında dolaşması, işaretli hacim,
uzun dönem mevsimsellik, varlıklar arası (BIST–altın–dolar) rotasyon ve küresel→yerel zincir.

Dürüstlük notu: işlem hacmi payı "para girişi" değildir (her işlemin alıcısı ve satıcısı vardır); ilgi/etkinlik ölçer.
İşaretli hacim de alıcı/satıcı baskısının kaba bir vekilidir (çubuk içindeki kapanış konumu). Net para girişi yalnız
yatırımcı tipi verisiyle (yabancı payı, fon büyüklüğü) ölçülebilir.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .agac import _t
from .panel import Panel

SAAT_SIRASI = ["gece", "09:30", "10:30", "11:30", "12:30", "13:30", "14:30", "15:30", "16:30", "17:30"]


def _gun_t(seri: pd.Series) -> tuple[float, float, int]:
    """Günlük ortalamalar serisinden (ortalama, t, gün sayısı)."""
    s = seri.dropna()
    if len(s) < 20 or s.std() == 0:
        return (float(s.mean()) if len(s) else np.nan, np.nan, int(len(s)))
    return float(s.mean()), float(s.mean() / (s.std() / np.sqrt(len(s)))), int(len(s))


def saat_profili(SG: pd.DataFrame, P: Panel, anahtar: str = "grup") -> dict:
    """Saat dilimine göre ortalama getiri (gün kümelenmiş t), dilimin günlük TL hacimdeki payı; grup/sektör ve yıl kırılımı."""
    d = SG.merge(P.evren[[anahtar]], left_on="hisse", right_index=True)
    d["yil"] = d["gun"].str.slice(0, 4)
    out: dict = {"anahtar": anahtar, "dilimler": SAAT_SIRASI, "grup": {}, "yil": {}, "hacim_payi": {}}
    gunluk = d.groupby([anahtar, "saat", "gun"])["getiri"].mean()
    for g in sorted(set(d[anahtar])):
        satir = {}
        for s in SAAT_SIRASI:
            if (g, s) in gunluk.index:
                m, t, n = _gun_t(gunluk.loc[(g, s)])
                satir[s] = {"ort": m, "t": t, "gun": n}
        out["grup"][str(g)] = satir
    tum = d.groupby(["yil", "saat", "gun"])["getiri"].mean()
    for y in sorted(set(d["yil"])):
        out["yil"][y] = {s: dict(zip(("ort", "t", "gun"), _gun_t(tum.loc[(y, s)]))) for s in SAAT_SIRASI if (y, s) in tum.index}
    h = d[d["saat"] != "gece"]
    toplam = h.groupby([anahtar, "saat"])["tl_hacim"].sum().unstack("saat")
    out["hacim_payi"] = {str(g): {s: float(v) for s, v in (toplam.loc[g] / toplam.loc[g].sum()).dropna().items()} for g in toplam.index}
    return out


def saat_takvim(SG: pd.DataFrame, P: Panel) -> dict:
    """Saat dilimi getirilerinin haftanın gününe ve aya göre ortalaması (tüm hisseler, gün ortalamaları üzerinden)."""
    g = SG.groupby(["gun", "saat"])["getiri"].mean().unstack("saat")
    g.index = pd.to_datetime(g.index)
    g["gunici"] = (1 + g[[c for c in g.columns if c != "gece"]].fillna(0)).prod(axis=1) - 1
    gunler = ["Pzt", "Sal", "Çar", "Per", "Cum"]
    hg = {gunler[k]: {c: float(v) for c, v in g[g.index.dayofweek == k][["gece", "09:30", "16:30", "gunici"]].mean().items()} for k in range(5)}
    ay = {int(m): {c: float(v) for c, v in g[g.index.month == m][["gece", "gunici"]].mean().items()} for m in range(1, 13) if (g.index.month == m).sum() >= 15}
    return {"haftanin_gunu": hg, "ay": ay, "gun": int(len(g))}


def isaretli_akis(H: pd.DataFrame, P: Panel) -> pd.DataFrame:
    """Günlük işaretli akış oranı (−1…+1): çubuk içi kapanış konumuyla ağırlıklı TL hacim / toplam TL hacim.
    +1 = gün boyu çubukların tepesinde kapanış (alıcı baskın), −1 = dibinde (satıcı baskın). Geniş tablo (gün × hisse)."""
    aralik = (H["yuksek"] - H["dusuk"]).replace(0, np.nan)
    konum = (2 * (H["kapanis"] - H["dusuk"]) / aralik - 1).clip(-1, 1).fillna(0)
    d = H.assign(mf=konum * H["tl_hacim"])
    g = d.groupby(["gun", "hisse"])[["mf", "tl_hacim"]].sum()
    oran = (g["mf"] / g["tl_hacim"].replace(0, np.nan)).unstack("hisse")
    oran.index = pd.to_datetime(oran.index)
    return oran


def akis_ongoru(A: pd.DataFrame, P: Panel) -> dict:
    """İşaretli akışın ertesi günü öngörmesi: kesitte bugünkü akış beşte birlikleri → ertesi gece, gün içi ve toplam getiri."""
    ort = A.index.intersection(P.R.index)
    A = A.loc[ort]
    out: dict = {"gun": int(len(ort)), "hisse": int(A.shape[1])}
    for ad, Y in (("ertesi_gece", P.GECE), ("ertesi_gunici", P.GI), ("ertesi_gun", P.R)):
        Y = Y.reindex(index=P.R.index, columns=A.columns).shift(-1).loc[ort]
        fark, dilim = [], {k: [] for k in range(5)}
        for t in ort:
            a, y = A.loc[t], Y.loc[t]
            ok = a.notna() & y.notna()
            if ok.sum() < 50:
                continue
            q = pd.qcut(a[ok].rank(method="first"), 5, labels=False)
            m = y[ok].groupby(q).mean()
            for k in range(5):
                dilim[k].append(m.get(k, np.nan))
            fark.append(m.get(4, np.nan) - m.get(0, np.nan))
        f = pd.Series(fark)
        out[ad] = {"dilim_ort": [float(np.nanmean(dilim[k])) for k in range(5)], "ust_alt_fark": float(f.mean()), "t": float(f.mean() / (f.std() / np.sqrt(len(f)))) if f.std() > 0 else None,
                   "pozitif_gun": float((f > 0).mean())}  # fmt: skip
    return out


def islem_ilgisi(P: Panel, anahtar: str = "sektor") -> dict:
    """TL işlem hacminin gruplara dağılımı: yıllık paylar, aylık pay değişimleri, pay ↔ getiri ilişkisi, rotasyon matrisi."""
    cols = [h for h in P.HTL.columns if h in P.evren.index]
    grup = P.evren.loc[cols, anahtar]
    G = P.HTL[cols].T.groupby(grup).sum().T
    pay = G.div(G.sum(axis=1), axis=0)
    yillik = pay.groupby(pay.index.year).mean()
    aylik = pay.groupby(pay.index.to_period("M")).mean()
    dpay = aylik.diff().dropna(how="all")
    # rotasyon: bir grubun payı düşerken hangisininki artıyor (aylık pay değişimlerinin korelasyonu)
    kor = dpay.corr()
    # ilgi getiriyi mi izliyor, getiri mi ilgiyi? (aylık, kesit sıra korelasyonu ortalaması)
    R = pd.DataFrame({g: P.R[[h for h in cols if grup[h] == g]].mean(axis=1) for g in G.columns})
    ar = (1 + R.fillna(0)).groupby(R.index.to_period("M")).prod() - 1
    goreli = ar.sub(ar.mean(axis=1), axis=0)

    def sira_kor(a: pd.DataFrame, b: pd.DataFrame) -> tuple[float, float, int]:
        ort = a.index.intersection(b.index)
        v = [a.loc[t].rank().corr(b.loc[t].rank()) for t in ort]
        s = pd.Series(v).dropna()
        return float(s.mean()), float(s.mean() / (s.std() / np.sqrt(len(s)))) if len(s) > 3 and s.std() > 0 else np.nan, int(len(s))

    out = {
        "anahtar": anahtar, "gruplar": list(G.columns),
        "yillik_pay": {str(y): {g: float(v) for g, v in yillik.loc[y].sort_values(ascending=False).items()} for y in yillik.index},
        "pay_degisimi_ilk_son": {g: float(yillik.iloc[-1][g] - yillik.iloc[0][g]) for g in yillik.columns},
        "getiri_sonra_ilgi": dict(zip(("sira_kor", "t", "ay"), sira_kor(goreli.shift(1).dropna(how="all"), dpay))),  # geçen ay getirisi → bu ay pay artışı
        "ilgi_sonra_getiri": dict(zip(("sira_kor", "t", "ay"), sira_kor(dpay.shift(1).dropna(how="all"), goreli))),  # geçen ay pay artışı → bu ay getiri
        "esanli": dict(zip(("sira_kor", "t", "ay"), sira_kor(goreli, dpay))),
    }
    ciftler = []
    ad = list(kor.columns)
    for i in range(len(ad)):
        for j in range(i + 1, len(ad)):
            if pd.notna(kor.iat[i, j]):
                ciftler.append({"a": ad[i], "b": ad[j], "kor": float(kor.iat[i, j])})
    out["en_ters"] = sorted(ciftler, key=lambda c: c["kor"])[:12]  # biri ilgi kaybederken öteki kazanan çiftler
    out["en_birlikte"] = sorted(ciftler, key=lambda c: -c["kor"])[:8]
    out["aylik_pay"] = {str(k): {g: float(v) for g, v in row.items()} for k, row in aylik.round(4).iterrows()}
    return out


def sektor_rotasyonu(P: Panel, anahtar: str = "sektor") -> dict:
    """Sektör getirilerinin dönemsel liderliği: yıl ve çeyrek bazında en iyi/kötü, aylık göreli gücün kalıcılığı."""
    cols = [h for h in P.R.columns if h in P.evren.index]
    grup = P.evren.loc[cols, anahtar]
    R = pd.DataFrame({g: P.R[[h for h in cols if grup[h] == g]].mean(axis=1) for g in sorted(set(grup)) if (grup == g).sum() >= 4})
    yil = (1 + R.fillna(0)).groupby(R.index.year).prod() - 1
    cey = (1 + R.fillna(0)).groupby(R.index.to_period("Q")).prod() - 1
    ay = (1 + R.fillna(0)).groupby(R.index.to_period("M")).prod() - 1
    out: dict = {"yil": {}, "ceyrek": {}}
    for y in yil.index:
        s = yil.loc[y].sort_values(ascending=False)
        out["yil"][str(y)] = {"en_iyi": [(k, float(v)) for k, v in s.head(4).items()], "en_kotu": [(k, float(v)) for k, v in s.tail(4).items()], "ortalama": float(s.mean())}
    for q in cey.index:
        s = cey.loc[q].sort_values(ascending=False)
        out["ceyrek"][str(q)] = {"en_iyi": [(k, float(v)) for k, v in s.head(3).items()], "en_kotu": [(k, float(v)) for k, v in s.tail(3).items()]}
    # kalıcılık: geçmiş k ay göreli getiri sırası → sonraki 1 ay sırası
    out["kalicilik"] = {}
    for k in (1, 3, 6):
        gecmis = ((1 + ay).rolling(k).apply(np.prod, raw=True) - 1).shift(1)
        v = [gecmis.loc[t].rank().corr(ay.loc[t].rank()) for t in ay.index if gecmis.loc[t].notna().sum() >= 10]
        s = pd.Series(v).dropna()
        out["kalicilik"][f"{k}ay"] = {"sira_kor": float(s.mean()), "t": float(s.mean() / (s.std() / np.sqrt(len(s)))) if len(s) > 3 and s.std() > 0 else None, "ay": int(len(s))}
    # yıldan yıla sıra korelasyonu
    out["yildan_yila"] = {f"{a}→{b}": float(yil.loc[a].rank().corr(yil.loc[b].rank())) for a, b in zip(yil.index, yil.index[1:])}
    return out


def mevsimsellik(S: pd.DataFrame, semboller: dict[str, str] | None = None, bas: str = "2010-01-01") -> dict:
    """Uzun dönem aylık mevsimsellik: her seri için takvim ayına göre ortalama aylık getiri, t ve pozitif yıl oranı.
    `S`: geniş kapanış tablosu (seriler_yukle). TL bazlı altın/gümüş = ons × USDTRY."""
    S = S.loc[bas:].copy()
    if "GC=F" in S and "USDTRY=X" in S:
        S["ALTIN_TL"] = S["GC=F"].ffill() * S["USDTRY=X"].ffill()
    if "SI=F" in S and "USDTRY=X" in S:
        S["GUMUS_TL"] = S["SI=F"].ffill() * S["USDTRY=X"].ffill()
    if "XU100.IS" in S and "USDTRY=X" in S:
        S["XU100_USD"] = S["XU100.IS"] / S["USDTRY=X"].ffill()
    if "XBANK.IS" in S and "XUSIN.IS" in S:
        S["BANKA_SANAYI"] = S["XBANK.IS"] / S["XUSIN.IS"]
    semboller = semboller or {"XU100.IS": "BIST 100", "XU100_USD": "BIST 100 (dolar)", "XBANK.IS": "Bankalar", "XUSIN.IS": "Sanayi", "BANKA_SANAYI": "Banka/Sanayi oranı",
                              "ALTIN_TL": "Altın (TL)", "GUMUS_TL": "Gümüş (TL)", "USDTRY=X": "Dolar/TL", "GC=F": "Altın (dolar)", "HG=F": "Bakır", "BZ=F": "Brent"}  # fmt: skip
    out: dict = {}
    for s, ad in semboller.items():
        if s not in S:
            continue
        ay = S[s].dropna().resample("ME").last().pct_change().dropna()
        ay = ay[ay.abs() < 1.0]
        satir = {}
        for m in range(1, 13):
            x = ay[ay.index.month == m]
            if len(x) >= 5:
                satir[m] = {"ort": float(x.mean()), "medyan": float(x.median()), "t": float(x.mean() / (x.std() / np.sqrt(len(x)))) if x.std() > 0 else None, "pozitif": float((x > 0).mean()), "yil": int(len(x))}
        out[ad] = {"aylar": satir, "tum_ort": float(ay.mean()), "yil_sayisi": int(ay.index.year.nunique())}
    return out


def varlik_rotasyonu(S: pd.DataFrame, bas: str = "2010-01-01") -> dict:
    """BIST 100, altın (TL) ve dolar/TL arasında yıllık getiriler ve basit göreli momentum kuralı (aylık, işlem maliyetli).
    Kural: her ay sonunda son `k` ayda en çok kazandıran varlığa geç; maliyet tek yön 20 bp. Mevduat/fon getirisi yoktur (veri yok)."""
    S = S.loc[bas:]
    V = pd.DataFrame({"bist": S["XU100.IS"], "altin": S["GC=F"].ffill() * S["USDTRY=X"].ffill(), "dolar": S["USDTRY=X"]}).ffill()
    if "SI=F" in S:
        V["gumus"] = S["SI=F"].ffill() * S["USDTRY=X"].ffill()
    ay = V.resample("ME").last().pct_change().dropna()
    yil = (1 + ay).groupby(ay.index.year).prod() - 1
    out: dict = {"yillik": {str(y): {k: float(v) for k, v in yil.loc[y].items()} for y in yil.index},
                 "kazanan": {str(y): str(yil.loc[y].idxmax()) for y in yil.index}, "aylik_kor": {f"{a}-{b}": float(ay[a].corr(ay[b])) for a in ay for b in ay if a < b}}  # fmt: skip
    out["kural"] = {}
    for k in (1, 3, 6, 12):
        gecmis = ((1 + ay).rolling(k).apply(np.prod, raw=True) - 1).shift(1).dropna()
        sec = gecmis.idxmax(axis=1)
        getiri = pd.Series([ay.at[t, sec[t]] for t in sec.index], index=sec.index)
        degisim = (sec != sec.shift(1)).astype(float)
        net = getiri - degisim * 0.004
        kum = float((1 + net).prod() - 1)
        kiyas = {c: float((1 + ay.loc[sec.index, c]).prod() - 1) for c in ay}
        esit = float((1 + ay.loc[sec.index].mean(axis=1)).prod() - 1)
        out["kural"][f"{k}ay"] = {"ay": int(len(net)), "kumulatif": kum, "yillik": float((1 + kum) ** (12 / len(net)) - 1), "degisim_sayisi": int(degisim.sum()),
                                  "al_tut": kiyas, "esit_agirlik": esit, "isabet": float((getiri >= ay.loc[sec.index].max(axis=1) - 1e-12).mean()),
                                  "yari1": float((1 + net.iloc[: len(net) // 2]).prod() - 1), "yari2": float((1 + net.iloc[len(net) // 2 :]).prod() - 1),
                                  "esit_yari1": float((1 + ay.loc[sec.index].mean(axis=1).iloc[: len(net) // 2]).prod() - 1),
                                  "esit_yari2": float((1 + ay.loc[sec.index].mean(axis=1).iloc[len(net) // 2 :]).prod() - 1)}  # fmt: skip
    return out


KURESEL = {"ES=F": "S&P 500 vadeli", "NQ=F": "Nasdaq vadeli", "GC=F": "Altın (ons)", "SI=F": "Gümüş (ons)", "HG=F": "Bakır", "PL=F": "Platin", "BZ=F": "Brent",
           "NG=F": "Doğal gaz", "USDTRY=X": "Dolar/TL", "EURUSD=X": "Euro/dolar", "TUR": "Türkiye fonu (ABD'de işlem gören)"}  # fmt: skip


def kuresel_degisimler(SS: pd.DataFrame, gunler: pd.DatetimeIndex) -> dict[str, pd.DataFrame]:
    """Her küresel seri için işlem günü bazında iki değişim: 'gece' = önceki BIST kapanışından (18:00) bugünkü açılışa (10:00),
    'seans' = 10:00 → 18:00. `SS`: saatlik uzun tablo (sembol, zaman, kapanis), zaman Europe/Istanbul."""
    SS = SS.assign(z=pd.to_datetime(SS["zaman"]))
    out = {}
    gunler = pd.DatetimeIndex(sorted(gunler))
    for s in KURESEL:
        d = SS[SS["sembol"] == s].set_index("z")["kapanis"].sort_index()
        d = d[~d.index.duplicated(keep="last")]
        if len(d) < 500:
            continue
        zaman = d.index.to_numpy()
        deger = d.to_numpy()

        def son(t: pd.Timestamp) -> tuple[float, np.datetime64 | None]:
            i = np.searchsorted(zaman, np.datetime64(t), side="right") - 1
            return (deger[i], zaman[i]) if i >= 0 else (np.nan, None)

        satir = []
        for onceki, bugun in zip(gunler, gunler[1:]):
            a, ta = son(onceki + pd.Timedelta(hours=18))
            b, tb = son(bugun + pd.Timedelta(hours=10))
            c, tc = son(bugun + pd.Timedelta(hours=18))
            if ta is None or tb is None or tc is None:
                continue
            satir.append((bugun, b / a - 1 if tb > ta else np.nan, c / b - 1 if tc > tb else np.nan))
        k = pd.DataFrame(satir, columns=["gun", "gece", "seans"]).set_index("gun")
        if k["gece"].notna().sum() >= 100:
            out[s] = k
    return out


def _reg(x: pd.Series, y: pd.Series) -> dict:
    d = pd.concat([x, y], axis=1).dropna()
    if len(d) < 80 or d.iloc[:, 0].std() == 0:
        return {"n": int(len(d))}
    r = float(d.iloc[:, 0].corr(d.iloc[:, 1]))
    yari = len(d) // 2
    return {"n": int(len(d)), "kor": r, "t": _t(r, len(d)), "beta": float(np.polyfit(d.iloc[:, 0], d.iloc[:, 1], 1)[0]),
            "yari1": float(d.iloc[:yari, 0].corr(d.iloc[:yari, 1])), "yari2": float(d.iloc[yari:, 0].corr(d.iloc[yari:, 1]))}  # fmt: skip


def kuresel_zincir(SS: pd.DataFrame, P: Panel, anahtar: str = "sektor", min_hisse: int = 4) -> dict:
    """Küresel → yerel zincir ve maden → sektör bağları (hisse açılış fiyatlarıyla; endeksin açılış değeri bayat olduğu için kullanılmaz).
    Her küresel seri × her grup için: (a) gece değişimi → grubun açılış boşluğu, (b) gece değişimi → grubun açılıştan kapanışa getirisi
    (boşluk sonrası devam var mı), (c) seans içi eşzamanlı ilişki. Gruplar: BIST 30, BIST 100 dışı ve sektörler (piyasa ortalamasından arındırılmış)."""
    ilk = pd.Timestamp(pd.to_datetime(SS["zaman"]).min()).normalize()
    gunler = P.R.index[P.R.index >= ilk]
    K = kuresel_degisimler(SS, gunler)
    b30 = [h for h in P.R.columns if P.evren.at[h, "bist30"] == 1]
    dis = [h for h in P.R.columns if P.evren.at[h, "bist100"] != 1]
    seri = {"bist30": (P.GECE[b30].mean(axis=1), P.GI[b30].mean(axis=1)), "bist100_disi": (P.GECE[dis].mean(axis=1), P.GI[dis].mean(axis=1))}
    tum_gece, tum_gi = P.GECE.mean(axis=1), P.GI.mean(axis=1)
    for g, idx in P.evren.groupby(anahtar).groups.items():
        idx = [h for h in idx if h in P.R.columns]
        if len(idx) >= min_hisse:
            seri[f"sektor:{g}"] = (P.GECE[idx].mean(axis=1) - tum_gece, P.GI[idx].mean(axis=1) - tum_gi)  # piyasaya göre fazla
    out: dict = {"gun": int(len(gunler)), "seriler": {s: KURESEL[s] for s in K}, "bist30": {}, "bist100_disi": {}, "sektor": []}
    for s, k in K.items():
        for ad in ("bist30", "bist100_disi"):
            gece, gi = seri[ad]
            out[ad][s] = {"bosluk": _reg(k["gece"], gece), "devam": _reg(k["gece"], gi), "esanli": _reg(k["seans"], gi)}
        for ad, (gece, gi) in seri.items():
            if not ad.startswith("sektor:"):
                continue
            for tur, x, y in (("bosluk", k["gece"], gece), ("devam", k["gece"], gi), ("esanli", k["seans"], gi)):
                r = _reg(x, y)
                if "kor" in r:
                    out["sektor"].append({"seri": s, "sektor": ad.split(":")[1], "tur": tur, **r})
    # çoklu test: sektör bağlarında BH-FDR
    from .agac import _p_normal, bh_esik

    if out["sektor"]:
        p = _p_normal(np.array([x["t"] for x in out["sektor"]]))
        esik = bh_esik(p, 0.10)
        for x, pv in zip(out["sektor"], p):
            x["anlamli"] = bool(esik > 0 and pv <= esik)
            x["tutarli"] = bool(np.sign(x["yari1"]) == np.sign(x["yari2"]) == np.sign(x["kor"]))
        out["sektor_test"] = {"test": len(p), "anlamli": int(sum(x["anlamli"] for x in out["sektor"])), "anlamli_tutarli": int(sum(x["anlamli"] and x["tutarli"] for x in out["sektor"]))}
        out["sektor"] = sorted(out["sektor"], key=lambda x: -abs(x["t"]))
    return out
