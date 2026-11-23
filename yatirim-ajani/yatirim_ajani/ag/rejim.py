"""Nicel rejim ajanı: piyasa boğa mı ayı mı, geçmiş örneklemden olasılık olarak.

"Sabit olasılık" yerine örneklem istatistiği: her olasılık geçmişte aynı durumda kaç kez ne olduğunun
sayımıdır ve yanında güven aralığı ile bağımsız gözlem sayısı verilir (örtüşen pencereler n/h ile düzeltilir).

Üç bağımsız ölçüm:
1. Klasik tanım (Lunde-Timmermann): zirveden −%20 → ayı, dipten +%20 → boğa. Geriye dönük etiket; bugünün
   durumu yalnız geçmiş fiyattan bilinebilen kısmıyla (zirveden düşüş, dipten yükseliş) okunur.
2. Koşullu sayım: bugünkü durum kovası (200 gün ortalamasına göre konum × 60 gün momentum × oynaklık dilimi)
   geçmişte hangi gelecek getirileri izledi; P(20 gün getiri < 0), P(60 gün içinde −%10), Jeffreys Beta aralığı.
3. İki durumlu Gauss gizli Markov modeli (numpy EM, Hamilton süzgeci): yalnız geçmişle süzülmüş ayı olasılığı;
   ileriye yürüyen sınamada yıllık yeniden kestirim.

Getiriler hem TL hem dolar cinsinden hesaplanır; TL enflasyonu nominal boğa yanılsaması yarattığı için karar
dolar cinsine dayanır.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

# ---------------------------------------------------------------- yardımcı istatistik


def jeffreys(k: int, n: float, guven: float = 0.90) -> tuple[float, float, float]:
    """k başarı / n deneme için Beta(k+½, n−k+½) ortalaması ve eşit kuyruklu aralık (normal yaklaşımlı)."""
    if n <= 0:
        return (float("nan"),) * 3
    a, b = k + 0.5, n - k + 0.5
    m = a / (a + b)
    v = a * b / ((a + b) ** 2 * (a + b + 1))
    z = {0.80: 1.2816, 0.90: 1.6449, 0.95: 1.96}[guven]
    return m, max(0.0, m - z * math.sqrt(v)), min(1.0, m + z * math.sqrt(v))


def oran_ozeti(olay: pd.Series, ufuk: int) -> dict:
    """Örtüşen ufuk pencerelerinde olay (bool) oranı; etkin n = gözlem/ufuk."""
    o = olay.dropna().astype(bool)
    n = len(o)
    if n == 0:
        return {"oran": None, "alt": None, "ust": None, "n_gun": 0, "n_etkin": 0}
    n_et = max(1.0, n / ufuk)
    k = o.mean() * n_et
    _, lo, hi = jeffreys(round(k), n_et)
    return {"oran": round(float(o.mean()), 4), "alt": round(lo, 4), "ust": round(hi, 4), "n_gun": n, "n_etkin": round(n_et, 1)}


# ---------------------------------------------------------------- 1. klasik boğa/ayı


def klasik_rejim(p: pd.Series, esik: float = 0.20) -> pd.Series:
    """Zirve/dip izleyici. Dönüş noktası onaylandığında rejim o noktadan itibaren geriye etiketlenir (ex post)."""
    p = p.dropna()
    v = p.values
    et = np.empty(len(v), dtype=object)
    durum = "boga"
    uc_i = 0  # son zirve (boğada) ya da dip (ayıda) indisi
    son_donus = 0
    for i in range(1, len(v)):
        if durum == "boga":
            if v[i] > v[uc_i]:
                uc_i = i
            elif v[i] <= v[uc_i] * (1 - esik):
                et[son_donus:uc_i + 1] = "boga"
                son_donus, durum, uc_i = uc_i + 1, "ayi", i
        else:
            if v[i] < v[uc_i]:
                uc_i = i
            elif v[i] >= v[uc_i] * (1 + esik):
                et[son_donus:uc_i + 1] = "ayi"
                son_donus, durum, uc_i = uc_i + 1, "boga", i
    et[son_donus:] = durum  # son, henüz onaylanmamış parça: mevcut durum
    return pd.Series(et, index=p.index, name="rejim")


def donemler(r: pd.Series) -> pd.DataFrame:
    g = (r != r.shift()).cumsum()
    d = r.groupby(g).agg(["first", "size"])
    d["bas"] = r.index.to_series().groupby(g.values).first().values
    d["son"] = r.index.to_series().groupby(g.values).last().values
    return d.rename(columns={"first": "rejim", "size": "gun"}).reset_index(drop=True)


# ---------------------------------------------------------------- 2. koşullu sayım


def ozellikler(p: pd.Series) -> pd.DataFrame:
    r = np.log(p).diff()
    f = pd.DataFrame(index=p.index)
    f["ort200"] = np.where(p > p.rolling(200, min_periods=150).mean(), "üstünde", "altında")
    f.loc[p.rolling(200, min_periods=150).mean().isna(), "ort200"] = None
    f["mom60"] = np.where(p / p.shift(60) - 1 > 0, "artı", "eksi")
    f.loc[p.shift(60).isna(), "mom60"] = None
    vol = r.rolling(20).std() * math.sqrt(252)
    # oynaklık dilimi yalnız geçmişe göre: genişleyen pencere yüzdeliği
    yuz = vol.expanding(250).apply(lambda s: (s[:-1] < s[-1]).mean(), raw=True)
    f["oynaklik"] = pd.cut(yuz, [-0.01, 1 / 3, 2 / 3, 1.01], labels=["düşük", "orta", "yüksek"]).astype(object)
    f["zirveden"] = p / p.cummax() - 1
    f["dipten"] = p / p.rolling(250, min_periods=60).min() - 1
    f["vol20"] = vol
    return f


def gelecek(p: pd.Series) -> pd.DataFrame:
    g = pd.DataFrame(index=p.index)
    for h in (5, 20, 60):
        g[f"g{h}"] = p.shift(-h) / p - 1
    # 60 gün içinde bugünden −%10 dip görülür mü
    ileri_min = p[::-1].rolling(60, min_periods=60).min()[::-1].shift(-1)
    g["dus10_60"] = (ileri_min / p - 1 <= -0.10).where(ileri_min.notna())
    return g


def kosullu_tablo(p: pd.Series, f: pd.DataFrame | None = None) -> pd.DataFrame:
    f = ozellikler(p) if f is None else f
    g = gelecek(p)
    d = f[["ort200", "mom60", "oynaklik"]].join(g).dropna(subset=["ort200", "mom60", "oynaklik"])
    satir = []
    for k, grp in d.groupby(["ort200", "mom60", "oynaklik"]):
        s = {"ort200": k[0], "mom60": k[1], "oynaklik": k[2], "gun": len(grp)}
        s["g20_ort"] = round(float(grp.g20.mean()), 4)
        s["g20_medyan"] = round(float(grp.g20.median()), 4)
        e = oran_ozeti(grp.g20.dropna() < 0, 20)
        s.update({"p_g20_eksi": e["oran"], "p_g20_eksi_alt": e["alt"], "p_g20_eksi_ust": e["ust"], "n_etkin": e["n_etkin"]})
        e = oran_ozeti(grp.dus10_60.dropna(), 60)
        s.update({"p_dus10": e["oran"], "p_dus10_alt": e["alt"], "p_dus10_ust": e["ust"]})
        satir.append(s)
    return pd.DataFrame(satir)


# ---------------------------------------------------------------- 3. iki durumlu Gauss HMM


@dataclass
class Hmm:
    mu: np.ndarray
    sd: np.ndarray
    P: np.ndarray  # P[i, j] = i'den j'ye geçiş
    pi: np.ndarray

    @property
    def ayi(self) -> int:
        return int(np.argmin(self.mu / self.sd))  # risk başına getirisi düşük olan durum

    def suz(self, x: np.ndarray) -> np.ndarray:
        """Hamilton süzgeci: t anındaki olasılık yalnız x[:t+1]'i kullanır."""
        a = np.zeros((len(x), 2))
        o = self.pi
        for t, xt in enumerate(x):
            on = o @ self.P if t else o
            lik = np.exp(-0.5 * ((xt - self.mu) / self.sd) ** 2) / self.sd
            w = on * lik
            o = w / w.sum() if w.sum() > 0 else on
            a[t] = o
        return a


def hmm_kestir(x: np.ndarray, yineleme: int = 200, tohum: int = 0) -> Hmm:
    x = np.asarray(x, float)
    q = np.quantile(x, [0.25, 0.75])
    mu = np.array([q[0], q[1]])
    sd = np.array([x.std() * 1.5, x.std() * 0.7])
    P = np.array([[0.97, 0.03], [0.02, 0.98]])
    pi = np.array([0.5, 0.5])
    T = len(x)
    onceki = -np.inf
    for _ in range(yineleme):
        B = np.exp(-0.5 * ((x[:, None] - mu) / sd) ** 2) / (sd * math.sqrt(2 * math.pi)) + 1e-300
        al = np.zeros((T, 2)); c = np.zeros(T)
        al[0] = pi * B[0]; c[0] = al[0].sum(); al[0] /= c[0]
        for t in range(1, T):
            al[t] = (al[t - 1] @ P) * B[t]; c[t] = al[t].sum(); al[t] /= c[t]
        be = np.ones((T, 2))
        for t in range(T - 2, -1, -1):
            be[t] = (P @ (B[t + 1] * be[t + 1])) / c[t + 1]
        ga = al * be; ga /= ga.sum(1, keepdims=True)
        xi = np.zeros((2, 2))
        for t in range(T - 1):
            m = al[t][:, None] * P * (B[t + 1] * be[t + 1])[None, :] / c[t + 1]
            xi += m
        P = xi / xi.sum(1, keepdims=True)
        pi = ga[0]
        w = ga.sum(0)
        mu = (ga * x[:, None]).sum(0) / w
        sd = np.sqrt((ga * (x[:, None] - mu) ** 2).sum(0) / w).clip(1e-6)
        ll = np.log(c).sum()
        if ll - onceki < 1e-7:
            break
        onceki = ll
    return Hmm(mu, sd, P, pi)


def hmm_ileri_yuruyen(r: pd.Series, ilk_yil: int = 4, adim: str = "YE") -> pd.Series:
    """Her yıl sonunda o güne kadarki veriyle yeniden kestirir, sonraki yılı süzer. Gelecek görülmez."""
    r = r.dropna()
    yillar = sorted(set(r.index.year))
    cikti = []
    for y in yillar[ilk_yil:]:
        egit = r[r.index.year < y]
        m = hmm_kestir(egit.values)
        # süzgeç sürekliliği için eğitim+yıl süzülür, yalnız yıl alınır
        kapsam = r[r.index.year <= y]
        a = m.suz(kapsam.values)[:, m.ayi]
        cikti.append(pd.Series(a, index=kapsam.index)[kapsam.index.year == y])
    return pd.concat(cikti).rename("p_ayi") if cikti else pd.Series(dtype=float)


# ---------------------------------------------------------------- ana çıktı


def seri_hazirla(endeks: pd.DataFrame, kur: pd.DataFrame | None, ek: dict[str, float] | None = None) -> pd.DataFrame:
    """endeks: tarih, kapanis (XU100). kur: tarih, kapanis (USDTRY). ek: {tarih: xu100} son günler (defterden)."""
    x = endeks.set_index(pd.to_datetime(endeks["tarih"]))["kapanis"].astype(float).sort_index()
    if ek:
        e = pd.Series(ek, dtype=float); e.index = pd.to_datetime(e.index)
        x = pd.concat([x, e[e.index > x.index.max()]])
    out = pd.DataFrame({"tl": x})
    if kur is not None and len(kur):
        k = kur.set_index(pd.to_datetime(kur["tarih"]))["kapanis"].astype(float).sort_index()
        k = k[~k.index.duplicated()].reindex(out.index).ffill()
        out["usd"] = out.tl / k
    return out.dropna()


def rejim_raporu(seri: pd.DataFrame, para: str = "usd") -> dict:
    p = seri[para]
    kl = klasik_rejim(p)
    dn = donemler(kl)
    f = ozellikler(p)
    tablo = kosullu_tablo(p, f)
    bugun = f.iloc[-1]
    kova = tablo[(tablo.ort200 == bugun.ort200) & (tablo.mom60 == bugun.mom60) & (tablo.oynaklik == bugun.oynaklik)]

    # klasik: taban oranlar, süreler ve bugünkü dönemin hayatta kalma olasılığı
    gun_ayi = float((kl == "ayi").mean())
    ayi_d = dn[dn.rejim == "ayi"]; boga_d = dn[dn.rejim == "boga"]
    simdiki = dn.iloc[-1]
    donem_bas = simdiki.bas
    simdi_dd = float(p.iloc[-1] / p.loc[donem_bas - pd.Timedelta(days=400):].max() - 1)
    gecmis = dn.iloc[:-1]
    ayni = gecmis[gecmis.rejim == simdiki.rejim]
    uzun = ayni[ayni.gun >= simdiki.gun]
    # bu kadar uzamış dönemlerden kaçı 60 işlem günü içinde bitti
    biten = int((uzun.gun <= simdiki.gun + 60).sum())
    m_, lo_, hi_ = jeffreys(biten, len(uzun)) if len(uzun) else (None, None, None)
    sure = {"simdiki_rejim": simdiki.rejim, "basladi": str(donem_bas.date()), "gun": int(simdiki.gun),
            "gecmis_ayni_rejim": len(ayni), "medyan_gun": float(ayni.gun.median()) if len(ayni) else None,
            "bu_kadar_uzamis": len(uzun), "60g_icinde_biten": biten,
            "p_60g_icinde_biter": None if m_ is None else round(m_, 3), "alt": None if lo_ is None else round(lo_, 3),
            "ust": None if hi_ is None else round(hi_, 3)}

    # HMM haftalık getiride (günlük getiride yalnız şok günlerini ayırıyor): bugünkü okuma + ileri yürüyen sınama
    pw = p.resample("W-FRI").last().dropna()
    rw = np.log(pw).diff().dropna()
    m = hmm_kestir(rw.values)
    a = m.suz(rw.values)[:, m.ayi]
    wf = hmm_ileri_yuruyen(rw)
    g4 = (pw.shift(-4) / pw - 1).reindex(wf.index)
    sinama = {}
    for ad, maske in {"p_ayi>0.5": wf > 0.5, "p_ayi<=0.5": wf <= 0.5}.items():
        gg = g4[maske].dropna()
        sinama[ad] = {"hafta": len(gg), "g4h_ort": round(float(gg.mean()), 4) if len(gg) else None,
                      **{k: v for k, v in oran_ozeti(gg < 0, 4).items() if k in ("oran", "alt", "ust", "n_etkin")}}
    gr = pw.pct_change().reindex(wf.index).fillna(0)
    poz = (wf.shift(1) <= 0.5).astype(float)
    def _ist(s):
        e = (1 + s).cumprod(); y = len(s) / 52
        return {"yillik": round(float(e.iloc[-1] ** (1 / y) - 1), 4), "en_buyuk_dusus": round(float((e / e.cummax() - 1).min()), 4)}
    strateji = {"endeks": _ist(gr), "hmm_suzgecli": _ist(gr * poz), "bas": str(wf.index[0].date())}

    son = p.index[-1]
    return {
        "para": para, "son_gun": str(son.date()), "seviye": round(float(p.iloc[-1]), 4),
        "klasik": {
            "bugunku_rejim": kl.iloc[-1], "zirveden": round(simdi_dd, 4),
            "dipten_250g": round(float(f["dipten"].iloc[-1]), 4),
            "ayi_gun_orani": round(gun_ayi, 4),
            "ayi_sayisi": len(ayi_d), "ayi_ort_gun": round(float(ayi_d.gun.mean()), 1) if len(ayi_d) else None,
            "boga_ort_gun": round(float(boga_d.gun.mean()), 1) if len(boga_d) else None,
            "sure": sure,
            "donemler": [{"rejim": d.rejim, "bas": str(d.bas.date()), "son": str(d.son.date()), "gun": int(d.gun)} for d in dn.itertuples()][-12:],
        },
        "kosullu": {
            "bugun": {"ort200": bugun.ort200, "mom60": bugun.mom60, "oynaklik": bugun.oynaklik, "vol20": round(float(bugun.vol20), 4)},
            "kova": kova.to_dict("records"),
            "taban": {"p_g20_eksi": oran_ozeti(gelecek(p).g20.dropna() < 0, 20), "p_dus10": oran_ozeti(gelecek(p).dus10_60.dropna(), 60)},
            "tablo": tablo.to_dict("records"),
        },
        "hmm": {
            "p_ayi_bugun": round(float(a[-1]), 4), "p_ayi_1h_once": round(float(a[-2]), 4), "p_ayi_4h_once": round(float(a[-5]), 4),
            "ayi_ort_yillik": round(float(m.mu[m.ayi] * 52), 4), "ayi_oynaklik": round(float(m.sd[m.ayi] * math.sqrt(52)), 4),
            "boga_ort_yillik": round(float(m.mu[1 - m.ayi] * 52), 4), "boga_oynaklik": round(float(m.sd[1 - m.ayi] * math.sqrt(52)), 4),
            "ayi_kalis_hafta": round(float(1 / (1 - m.P[m.ayi, m.ayi])), 1), "boga_kalis_hafta": round(float(1 / (1 - m.P[1 - m.ayi, 1 - m.ayi])), 1),
            "ileri_yuruyen_sinama": sinama, "strateji": strateji,
        },
    }


def ozet_metin(r: dict) -> list[str]:
    k, h, c = r["klasik"], r["hmm"], r["kosullu"]
    yuz = lambda v: "—" if v is None else f"%{v * 100:.0f}".replace(".", ",")
    s = [f"**Piyasa rejimi ({r['para'].upper()} bazında XU100, {r['son_gun']})**",
         f"- Klasik tanım: {'AYI' if k['bugunku_rejim'] == 'ayi' else 'BOĞA'}; zirveden {yuz(k['zirveden'])}, 250 gün dibinden {yuz(k['dipten_250g'])}.",
         (f"- Bu {'ayı' if k['sure']['simdiki_rejim'] == 'ayi' else 'boğa'} {k['sure']['basladi']}'den beri {k['sure']['gun']} işlem günü; geçmişte {k['sure']['gecmis_ayni_rejim']} benzer dönemin medyanı {k['sure']['medyan_gun']} gün. "
         f"Bu kadar uzamış {k['sure']['bu_kadar_uzamis']} dönemin {k['sure']['60g_icinde_biten']}'i 60 gün içinde bitti."),
         f"- Gizli Markov modeli (haftalık) ayı olasılığı: bugün {yuz(h['p_ayi_bugun'])}, 1 hafta önce {yuz(h['p_ayi_1h_once'])}, 4 hafta önce {yuz(h['p_ayi_4h_once'])}."]
    for kv in c["kova"]:
        s.append(f"- Bugünkü durum ({kv['ort200']} 200g ort., 60g momentum {kv['mom60']}, oynaklık {kv['oynaklik']}): geçmişte {kv['gun']} gün; "
                 f"20 gün sonra eksi olma {yuz(kv['p_g20_eksi'])} ({yuz(kv['p_g20_eksi_alt'])}–{yuz(kv['p_g20_eksi_ust'])}), "
                 f"60 gün içinde −%10 görme {yuz(kv['p_dus10'])}; taban oran {yuz(c['taban']['p_g20_eksi']['oran'])} / {yuz(c['taban']['p_dus10']['oran'])}.")
    return s


# ---------------------------------------------------------------- zarar ayrıştırma


def zarar_ayristir(defter: dict, kapanis: pd.DataFrame, endeks: pd.Series, beta_gun: int = 250,
                   getiri_panel: pd.DataFrame | None = None, nakit_faiz_yillik: float | None = None) -> dict:
    """Defterdeki pozisyon kâr/zararını piyasa (beta × XU100) ve hisseye özgü kısma ayırır.

    kapanis: gün × hisse kapanışları (değerleme günleri). endeks: gün → XU100. getiri_panel: beta için uzun günlük kapanış
    (hisse sütunları + 'XU100'); yoksa beta 1 alınır.
    """
    son = kapanis.index[-1]
    satir = []
    for h, poz in defter["pozisyonlar"].items():
        g = pd.Timestamp(poz["giris"])
        p0, p1 = float(poz["maliyet"]), float(kapanis[h].loc[son])
        x0 = float(endeks.loc[endeks.index >= g].iloc[0]); x1 = float(endeks.loc[son])
        beta = 1.0
        if getiri_panel is not None and h in getiri_panel:
            rr = getiri_panel[[h, "XU100"]].pct_change().dropna().iloc[-beta_gun:]
            beta = float(rr.cov().iloc[0, 1] / rr["XU100"].var())
        hr, xr = p1 / p0 - 1, x1 / x0 - 1
        tutar = poz["adet"] * p0
        satir.append({"hisse": h, "adet": poz["adet"], "maliyet": p0, "son": p1, "tutar": round(tutar),
                      "kz": round(poz["adet"] * (p1 - p0)), "getiri": round(hr, 4), "xu100": round(xr, 4), "beta": round(beta, 2),
                      "piyasa_kz": round(tutar * beta * xr), "ozgu_kz": round(tutar * (hr - beta * xr))})
    masraf = sum(i.get("masraf", 0) for i in defter["islemler"])
    d = pd.DataFrame(satir)
    gun = (son - pd.Timestamp(defter["baslangic_gun"])).days
    ozet = {"toplam_kz": int(d.kz.sum() - masraf), "piyasa": int(d.piyasa_kz.sum()), "ozgu": int(d.ozgu_kz.sum()), "masraf": round(masraf),
            "nakit_ort": round(defter["nakit"]), "yatirilan": int(d.tutar.sum())}
    if nakit_faiz_yillik is not None:
        ozet["nakit_firsat"] = round(defter["nakit"] * ((1 + nakit_faiz_yillik) ** (gun / 365) - 1))
    return {"son_gun": str(son.date()), "pozisyonlar": satir, "ozet": ozet}


def calistir(klasor: str, defter_yolu: str | None = None, cikti: str | None = None) -> dict:
    """Ağ verisi klasöründen (endeks_gunluk, seriler_gunluk) TL ve dolar bazında rejim raporu; defterdeki son
    değerleme günlerinin XU100 değerleri seriye eklenir. cikti verilirse JSON ve Markdown yazılır."""
    import json
    from pathlib import Path

    k = Path(klasor)
    e = pd.read_csv(k / "endeks_gunluk.csv.gz")
    x = e[e.endeks == "XU100"][["tarih", "kapanis"]]
    s = pd.read_csv(k / "seriler_gunluk.csv.gz")
    u = s[s.sembol == "USDTRY=X"][["tarih", "kapanis"]]
    ek = None
    if defter_yolu and Path(defter_yolu).exists():
        d = json.loads(Path(defter_yolu).read_text(encoding="utf-8"))
        ek = {v["gun"]: v["xu100"] for v in d.get("degerleme", []) if v.get("xu100")}
    seri = seri_hazirla(x, u, ek)
    out = {p: rejim_raporu(seri, p) for p in ("tl", "usd")}
    if cikti:
        c = Path(cikti)
        c.parent.mkdir(parents=True, exist_ok=True)
        c.write_text(json.dumps(out, ensure_ascii=False, default=str, indent=1), encoding="utf-8")
        md = ozet_metin(out["tl"]) + [""] + ozet_metin(out["usd"]) + ["", sinama_metni(out["tl"])]
        c.with_suffix(".md").write_text("\n".join(md) + "\n", encoding="utf-8")
    return out


def sinama_metni(r: dict) -> str:
    h = r["hmm"]["ileri_yuruyen_sinama"]; st = r["hmm"]["strateji"]
    yuz = lambda v: "—" if v is None else f"%{v * 100:.0f}"
    return (f"İleri yürüyen sınama ({st['bas']}→): model ayı derken 4 hafta sonra eksi olma {yuz(h['p_ayi>0.5']['oran'])}, "
            f"boğa derken {yuz(h['p_ayi<=0.5']['oran'])}. Ayıda nakde geçme kuralı yıllık {yuz(st['hmm_suzgecli']['yillik'])} "
            f"(endeks {yuz(st['endeks']['yillik'])}), en büyük düşüş {yuz(st['hmm_suzgecli']['en_buyuk_dusus'])} "
            f"(endeks {yuz(st['endeks']['en_buyuk_dusus'])}). Fark güven aralığı içindeyse rejim yön tahmini için kullanılmaz.")
