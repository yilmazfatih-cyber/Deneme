"""BIST'i ağ ve ağaç olarak inceleme.

- Korelasyon ağı: günlük getirilerin korelasyonu; piyasa modu (XU100) ayıklanınca kalan korelasyon sektör/tema bağlarını gösterir.
- Ağaç: uzaklık d = sqrt(2(1−ρ)) ile en küçük kapsayan ağaç (Mantegna 1999). Kök = arasındalığı en yüksek düğüm; dallar kökün çocukları.
- Kümeler: artık korelasyonda ortalama bağlantılı hiyerarşik kümeleme; resmi sektörlerle örtüşme.
- Öncü-takipçi: grup/sektör düzeyinde gecikmeli korelasyon (çoklu test düzeltmeli, iki yarıda tutarlılık), hisse düzeyinde fiyat gecikmesi
  (Hou–Moskowitz 2005): hissenin piyasa haberine ne kadar geç tepki verdiği.
- Zaman kırılımı: yıl, mevsim, saat dilimine göre ağın yoğunluğu ve merkezleri.

Yalnız numpy/pandas kullanır. Tüm çıktılar JSON'a yazılabilir sözlüklerdir. Yatırım tavsiyesi değildir.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .panel import Panel


# --- temel araçlar ------------------------------------------------------------------------------
def artik_getiri(R: pd.DataFrame, piyasa: pd.Series) -> tuple[pd.DataFrame, pd.Series]:
    """Her hissenin piyasa getirisine regresyon artığı ve betası (eksik günler atlanır)."""
    m = piyasa.reindex(R.index).to_numpy(float)
    E = np.full(R.shape, np.nan)
    beta = np.full(R.shape[1], np.nan)
    X = R.to_numpy(float)
    for j in range(X.shape[1]):
        ok = ~np.isnan(X[:, j]) & ~np.isnan(m)
        if ok.sum() < 30:
            continue
        x, y = m[ok], X[ok, j]
        vx = x.var()
        if vx <= 0:
            continue
        b = ((x - x.mean()) * (y - y.mean())).mean() / vx
        a = y.mean() - b * x.mean()
        E[ok, j] = y - a - b * x
        beta[j] = b
    return pd.DataFrame(E, index=R.index, columns=R.columns), pd.Series(beta, index=R.columns)


def cok_faktor_artik(R: pd.DataFrame, F: pd.DataFrame, min_gun: int = 60) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Her hissenin birden çok faktöre (ör. XU100 ve küçük hisse faktörü) regresyon artığı ve katsayıları."""
    F = F.reindex(R.index)
    E = np.full(R.shape, np.nan)
    B = np.full((R.shape[1], F.shape[1]), np.nan)
    X, Y = F.to_numpy(float), R.to_numpy(float)
    fok = ~np.isnan(X).any(axis=1)
    for j in range(Y.shape[1]):
        ok = fok & ~np.isnan(Y[:, j])
        if ok.sum() < min_gun:
            continue
        A = np.column_stack([np.ones(ok.sum()), X[ok]])
        k = np.linalg.lstsq(A, Y[ok, j], rcond=None)[0]
        E[ok, j] = Y[ok, j] - A @ k
        B[j] = k[1:]
    return pd.DataFrame(E, index=R.index, columns=R.columns), pd.DataFrame(B, index=R.columns, columns=F.columns)


def faktorler(P: Panel) -> pd.DataFrame:
    """İki ortak faktör: 'piyasa' (XU100) ve 'kucuk' (BIST 100 dışı hisselerin eşit ağırlıklı getirisinin XU100'e göre artığı).
    İkincisi, endeksin açıklamadığı ama küçük hisselerin birlikte yaşadığı hareketi (bireysel ağırlıklı blok) ölçer."""
    dis = [h for h in P.R.columns if P.evren.at[h, "bist100"] != 1]
    k = P.R[dis].mean(axis=1)
    d = pd.concat([k, P.xu100], axis=1).dropna()
    b = np.polyfit(d.iloc[:, 1], d.iloc[:, 0], 1)
    kucuk = k - (b[1] + b[0] * P.xu100)
    return pd.DataFrame({"piyasa": P.xu100, "kucuk": kucuk})


def uzaklik(C: pd.DataFrame) -> np.ndarray:
    D = np.sqrt(np.clip(2 * (1 - C.to_numpy(float)), 0, 4))
    D[np.isnan(D)] = 2.0  # bilinmeyen çift: ilişkisiz say
    np.fill_diagonal(D, 0.0)
    return D


def mst(D: np.ndarray) -> list[tuple[int, int, float]]:
    """Prim algoritması. Döner: (ebeveyn, çocuk, uzaklık) kenarları."""
    n = len(D)
    secili = np.zeros(n, bool)
    secili[0] = True
    en_yakin = D[0].copy()
    kaynak = np.zeros(n, int)
    kenar = []
    for _ in range(n - 1):
        aday = np.where(secili, np.inf, en_yakin)
        j = int(np.argmin(aday))
        kenar.append((int(kaynak[j]), j, float(en_yakin[j])))
        secili[j] = True
        daha_yakin = (D[j] < en_yakin) & ~secili
        kaynak[daha_yakin] = j
        en_yakin = np.where(daha_yakin, D[j], en_yakin)
    return kenar


def agac_olculeri(kenar: list[tuple[int, int, float]], n: int) -> dict:
    """Ağaç ölçüleri: derece, arasındalık (düğümden geçen çift oranı), kök, kökten derinlik, ana dal (kökün hangi çocuğunun altında)."""
    komsu: list[list[int]] = [[] for _ in range(n)]
    for a, b, _ in kenar:
        komsu[a].append(b)
        komsu[b].append(a)
    derece = np.array([len(k) for k in komsu])

    def alt_boyutlar(kok: int) -> tuple[np.ndarray, np.ndarray, list[int]]:
        ebeveyn = np.full(n, -1)
        sira = [kok]
        for v in sira:
            for w in komsu[v]:
                if w != ebeveyn[v]:
                    ebeveyn[w] = v
                    sira.append(w)
        boyut = np.ones(n)
        for v in reversed(sira):
            if ebeveyn[v] >= 0:
                boyut[ebeveyn[v]] += boyut[v]
        return ebeveyn, boyut, sira

    ebeveyn, boyut, _ = alt_boyutlar(0)
    aras = np.zeros(n)
    for v in range(n):
        parcalar = [boyut[w] for w in komsu[v] if ebeveyn[w] == v]
        if ebeveyn[v] >= 0:
            parcalar.append(n - boyut[v])
        s = np.array(parcalar, float)
        aras[v] = ((s.sum() ** 2 - (s**2).sum()) / 2) / max(1.0, (n - 1) * (n - 2) / 2)
    kok = int(np.argmax(aras))
    ebeveyn, boyut, sira = alt_boyutlar(kok)
    derinlik = np.zeros(n, int)
    dal = np.full(n, -1)
    for v in sira[1:]:
        derinlik[v] = derinlik[ebeveyn[v]] + 1
        dal[v] = v if ebeveyn[v] == kok else dal[ebeveyn[v]]
    return {"derece": derece, "arasindalik": aras, "kok": kok, "ebeveyn": ebeveyn, "derinlik": derinlik, "dal": dal, "alt_boyut": boyut}


def hiyerarsik_kume(D: np.ndarray, k: int) -> np.ndarray:
    """Ortalama bağlantılı (UPGMA) kümeleme; `k` küme etiketi döner."""
    n = len(D)
    M = D.astype(float).copy()
    np.fill_diagonal(M, np.inf)
    aktif = np.ones(n, bool)
    boyut = np.ones(n)
    uye = {i: [i] for i in range(n)}
    for _ in range(max(0, n - k)):
        maske = np.where(aktif[:, None] & aktif[None, :], M, np.inf)
        i, j = divmod(int(np.argmin(maske)), n)
        yeni = (M[i] * boyut[i] + M[j] * boyut[j]) / (boyut[i] + boyut[j])
        M[i, :] = yeni
        M[:, i] = yeni
        M[i, i] = np.inf
        aktif[j] = False
        boyut[i] += boyut[j]
        uye[i] += uye.pop(j)
    etiket = np.zeros(n, int)
    for no, (_, liste) in enumerate(sorted(uye.items(), key=lambda kv: -len(kv[1]))):
        etiket[liste] = no
    return etiket


def _t(r: float, n: int) -> float:
    return float(r * np.sqrt(max(n - 2, 1) / max(1e-12, 1 - r * r)))


def bh_esik(p: np.ndarray, q: float = 0.10) -> float:
    """Benjamini–Hochberg: yanlış keşif oranı q için p eşiği (hiçbiri geçmezse −1; p = 0 olan testler de geçebilsin diye)."""
    p = np.sort(p[~np.isnan(p)])
    if not len(p):
        return -1.0
    k = np.nonzero(p <= q * (np.arange(1, len(p) + 1) / len(p)))[0]
    return float(p[k[-1]]) if len(k) else -1.0


def _p_normal(t: np.ndarray) -> np.ndarray:
    """İki yanlı p değeri (normal yaklaşım; scipy yok)."""
    from math import erfc, sqrt

    return np.vectorize(lambda x: erfc(abs(x) / sqrt(2)) if np.isfinite(x) else np.nan)(t)


# --- korelasyon ağı ve ağaç ---------------------------------------------------------------------
def korelasyon_agi(P: Panel, min_gun: int = 400, kume_sayisi: int = 14, bas: str | None = None, bit: str | None = None,
                   hisseler: list[str] | None = None, min_ortak: int = 120) -> dict:  # fmt: skip
    """Günlük getirilerden ham ve artık korelasyon, MST, düğüm ölçüleri, kümeler, sektör bütünlüğü."""
    R = P.R.loc[bas:bit] if (bas or bit) else P.R
    if hisseler is not None:
        R = R[[h for h in hisseler if h in R.columns]]
    R = R.loc[:, R.notna().sum() >= min(min_gun, max(40, int(len(R) * 0.6)))]
    ortak = max(30, min(min_ortak, int(len(R) * 0.5)))
    C = R.corr(min_periods=ortak)
    E, beta = artik_getiri(R, P.xu100)
    CE1 = E.corr(min_periods=ortak)
    F = faktorler(P)
    E2, yuk = cok_faktor_artik(R, F)
    CE = E2.corr(min_periods=ortak)  # iki faktör ayıklanmış: sektör/tema bağları
    ad = list(R.columns)
    n = len(ad)
    ev = P.evren.reindex(ad)
    kenar = mst(uzaklik(C))
    olcu = agac_olculeri(kenar, n)
    kenar2 = mst(uzaklik(CE))
    olcu2 = agac_olculeri(kenar2, n)
    kume = hiyerarsik_kume(uzaklik(CE), min(kume_sayisi, max(2, n // 4)))
    ust = np.triu_indices(n, 1)
    c_ham, c_art = C.to_numpy()[ust], CE.to_numpy()[ust]
    # sektör bütünlüğü: sektör içi ortalama artık korelasyon − sektörler arası
    sek = ev["sektor"].to_numpy()
    ayni = sek[ust[0]] == sek[ust[1]]
    butunluk = []
    for s in sorted(set(sek)):
        idx = np.nonzero(sek == s)[0]
        if len(idx) < 3:
            continue
        ic = CE.to_numpy()[np.ix_(idx, idx)][np.triu_indices(len(idx), 1)]
        dis = CE.to_numpy()[np.ix_(idx, np.nonzero(sek != s)[0])]
        butunluk.append({"sektor": s, "hisse": int(len(idx)), "ic_kor": float(np.nanmean(ic)), "dis_kor": float(np.nanmean(dis)),
                         "ham_ic_kor": float(np.nanmean(C.to_numpy()[np.ix_(idx, idx)][np.triu_indices(len(idx), 1)]))})  # fmt: skip
    # kümelerin sektörle örtüşmesi
    kumeler = []
    for k in sorted(set(kume)):
        idx = np.nonzero(kume == k)[0]
        say = pd.Series(sek[idx]).value_counts()
        kumeler.append({"kume": int(k), "hisse": int(len(idx)), "baskin_sektor": str(say.index[0]), "baskin_pay": float(say.iloc[0] / len(idx)),
                        "sektorler": {str(a): int(b) for a, b in say.head(4).items()},
                        "ornek": [ad[i] for i in idx[np.argsort(-np.nan_to_num(ev["pd_son"].to_numpy()[idx]))][:8]]})  # fmt: skip
    saflik = float(sum(x["baskin_pay"] * x["hisse"] for x in kumeler) / n)
    dugum = []
    guc = np.nanmean(np.where(np.eye(n, dtype=bool), np.nan, C.to_numpy()), axis=1)
    for i, h in enumerate(ad):
        dugum.append({"hisse": h, "sektor": str(ev["sektor"].iloc[i]), "grup": str(ev["grup"].iloc[i]), "pd": float(np.nan_to_num(ev["pd_son"].iloc[i])),
                      "beta": float(beta.iloc[i]) if pd.notna(beta.iloc[i]) else None, "ort_kor": float(guc[i]), "derece": int(olcu["derece"][i]),
                      "arasindalik": float(olcu["arasindalik"][i]), "derinlik": int(olcu["derinlik"][i]), "ebeveyn": ad[olcu["ebeveyn"][i]] if olcu["ebeveyn"][i] >= 0 else None,
                      "dal": ad[olcu["dal"][i]] if olcu["dal"][i] >= 0 else None, "kume": int(kume[i])})  # fmt: skip
    kenarlar = [{"a": ad[a], "b": ad[b], "kor": float(1 - d * d / 2)} for a, b, d in kenar]
    ayni_sektor_kenar = float(np.mean([sek[a] == sek[b] for a, b, _ in kenar]))
    for i, d in enumerate(dugum):
        d["kucuk_yuk"] = float(yuk["kucuk"].iloc[i]) if pd.notna(yuk["kucuk"].iloc[i]) else None
        d["tema_derece"] = int(olcu2["derece"][i])
        d["tema_ebeveyn"] = ad[olcu2["ebeveyn"][i]] if olcu2["ebeveyn"][i] >= 0 else None
    tema_kenarlar = [{"a": ad[a], "b": ad[b], "kor": float(1 - d * d / 2)} for a, b, d in kenar2]
    tema_ayni_sektor = float(np.mean([sek[a] == sek[b] for a, b, _ in kenar2]))
    dallar = []
    kok = olcu["kok"]
    for c in sorted(set(olcu["dal"]) - {-1}, key=lambda c: -olcu["alt_boyut"][c]):
        idx = np.nonzero(olcu["dal"] == c)[0]
        say = pd.Series(sek[idx]).value_counts()
        dallar.append({"dal": ad[c], "hisse": int(len(idx)), "baskin_sektor": str(say.index[0]), "baskin_pay": float(say.iloc[0] / len(idx)),
                       "sektorler": {str(a): int(b) for a, b in say.head(4).items()}})  # fmt: skip
    return {
        "donem": [str(R.index[0].date()), str(R.index[-1].date())], "gun": int(len(R)), "hisse": n,
        "ort_kor_ham": float(np.nanmean(c_ham)), "ort_kor_piyasa_artik": float(np.nanmean(CE1.to_numpy()[ust])), "ort_kor_artik": float(np.nanmean(c_art)),
        "tema_agaci": {"kok": ad[olcu2["kok"]], "kenar_ayni_sektor_orani": tema_ayni_sektor, "kenarlar": tema_kenarlar,
                       "en_bagli": sorted(((ad[i], int(olcu2["derece"][i])) for i in range(n)), key=lambda x: -x[1])[:15]},
        "ort_kor_ayni_sektor_artik": float(np.nanmean(c_art[ayni])), "ort_kor_farkli_sektor_artik": float(np.nanmean(c_art[~ayni])),
        "kok": ad[kok], "kenar_ayni_sektor_orani": ayni_sektor_kenar, "rastgele_ayni_sektor_orani": float(ayni.mean()),
        "en_merkezi": [d["hisse"] for d in sorted(dugum, key=lambda d: -d["arasindalik"])[:15]],
        "en_bagli": [(d["hisse"], d["derece"]) for d in sorted(dugum, key=lambda d: -d["derece"])[:15]],
        "dallar": dallar[:25], "kumeler": kumeler, "kume_safligi": saflik,
        "sektor_butunlugu": sorted(butunluk, key=lambda x: -(x["ic_kor"] - x["dis_kor"])),
        "dugumler": dugum, "kenarlar": kenarlar,
    }


def zaman_kirilimi(P: Panel, hisseler: list[str] | None = None) -> dict:
    """Ağın yıllara ve mevsimlere göre değişimi: ortalama korelasyon, kök, en bağlı düğümler, kenarların kalıcılığı."""
    out: dict = {"yil": {}, "mevsim": {}, "kalicilik": []}
    ag = {}
    for yil in sorted(set(P.R.index.year)):
        R = P.R[P.R.index.year == yil]
        if len(R) < 80:
            continue
        a = korelasyon_agi(P, bas=str(R.index[0].date()), bit=str(R.index[-1].date()), hisseler=hisseler, min_gun=int(len(R) * 0.8))
        ag[str(yil)] = a
        out["yil"][str(yil)] = {k: a[k] for k in ("gun", "hisse", "ort_kor_ham", "ort_kor_artik", "kok", "en_merkezi", "en_bagli", "kenar_ayni_sektor_orani", "kume_safligi")}
    yillar = sorted(ag)
    for y1, y2 in zip(yillar, yillar[1:]):
        k1 = {frozenset((e["a"], e["b"])) for e in ag[y1]["kenarlar"]}
        k2 = {frozenset((e["a"], e["b"])) for e in ag[y2]["kenarlar"]}
        ortak_dugum = {d["hisse"] for d in ag[y1]["dugumler"]} & {d["hisse"] for d in ag[y2]["dugumler"]}
        k1o = {k for k in k1 if k <= ortak_dugum}
        k2o = {k for k in k2 if k <= ortak_dugum}
        d1 = pd.Series({d["hisse"]: d["derece"] for d in ag[y1]["dugumler"]})
        d2 = pd.Series({d["hisse"]: d["derece"] for d in ag[y2]["dugumler"]})
        b = pd.concat([d1, d2], axis=1).dropna()
        out["kalicilik"].append({"donem": f"{y1}→{y2}", "kalan_kenar_orani": float(len(k1o & k2o) / max(1, len(k1o))),
                                 "derece_sira_kor": float(b.rank().corr().iloc[0, 1]), "ortak_dugum": len(ortak_dugum)})  # fmt: skip
    mevsimler = {"kis": (12, 1, 2), "ilkbahar": (3, 4, 5), "yaz": (6, 7, 8), "sonbahar": (9, 10, 11)}
    for ad, aylar in mevsimler.items():
        R = P.R[P.R.index.month.isin(aylar)]
        if hisseler is not None:
            R = R[[h for h in hisseler if h in R.columns]]
        R = R.loc[:, R.notna().sum() >= int(len(R) * 0.7)]
        C = R.corr(min_periods=60)
        E, _ = artik_getiri(R, P.xu100)
        CE = E.corr(min_periods=60)
        ust = np.triu_indices(len(C), 1)
        xu = P.xu100.reindex(R.index)
        out["mevsim"][ad] = {"gun": int(len(R)), "hisse": int(R.shape[1]), "ort_kor_ham": float(np.nanmean(C.to_numpy()[ust])), "ort_kor_artik": float(np.nanmean(CE.to_numpy()[ust])),
                             "xu100_gunluk_ort": float(xu.mean()), "xu100_oynaklik": float(xu.std()), "kesit_dagilim": float(R.std(axis=1).mean())}  # fmt: skip
    # kayan 60 günlük ortalama korelasyon (sürü ölçüsü): likit 100 hisse
    ust100 = P.evren["pd_son"].sort_values(ascending=False).head(100).index
    Rl = P.R[[h for h in ust100 if h in P.R.columns]]
    seri = {}
    for i in range(60, len(Rl), 20):
        w = Rl.iloc[i - 60 : i]
        w = w.loc[:, w.notna().sum() >= 50]
        c = w.corr().to_numpy()
        seri[str(Rl.index[i - 1].date())] = float(np.nanmean(c[np.triu_indices(len(c), 1)]))
    out["kayan_kor_60g"] = seri
    return out


# --- öncü-takipçi -------------------------------------------------------------------------------
def _gecikme_matrisi(X: pd.DataFrame, gecikme: int = 1) -> tuple[np.ndarray, np.ndarray]:
    """corr(X_i(t−gecikme), X_j(t)) matrisi ve gözlem sayıları (satır = öncü i, sütun = takipçi j)."""
    A = X.shift(gecikme)
    n = X.shape[1]
    Rm = np.full((n, n), np.nan)
    Nm = np.zeros((n, n))
    a, b = A.to_numpy(float), X.to_numpy(float)
    for i in range(n):
        ok_i = ~np.isnan(a[:, i])
        for j in range(n):
            ok = ok_i & ~np.isnan(b[:, j])
            m = int(ok.sum())
            if m < 60:
                continue
            x, y = a[ok, i], b[ok, j]
            sx, sy = x.std(), y.std()
            if sx > 0 and sy > 0:
                Rm[i, j] = ((x - x.mean()) * (y - y.mean())).mean() / (sx * sy)
                Nm[i, j] = m
    return Rm, Nm


def grup_serileri(P: Panel, anahtar: str = "grup", agirlik: str = "esit", min_hisse: int = 3) -> pd.DataFrame:
    """Grup/sektör getiri serileri (eşit ağırlıklı ya da önceki günün piyasa değeriyle ağırlıklı)."""
    out = {}
    for g, idx in P.evren.groupby(anahtar).groups.items():
        idx = [h for h in idx if h in P.R.columns]
        if len(idx) < min_hisse:
            continue
        r = P.R[idx]
        if agirlik == "pd":
            w = P.PD[idx].shift(1).where(r.notna())
            out[g] = (r * w).sum(axis=1) / w.sum(axis=1)
        else:
            out[g] = r.mean(axis=1)
    return pd.DataFrame(out)


def oncu_takipci_grup(P: Panel, anahtar: str = "grup", artik: bool = False, gecikme: int = 1) -> dict:
    """Gruplar (pazar/endeks grubu ya da sektör) arası gecikmeli korelasyon; BH-FDR ve iki yarıda işaret tutarlılığı."""
    G = grup_serileri(P, anahtar)
    if artik:
        G, _ = cok_faktor_artik(G, faktorler(P))
    ad = list(G.columns)
    Rm, Nm = _gecikme_matrisi(G, gecikme)
    T = np.vectorize(_t)(np.nan_to_num(Rm), np.maximum(Nm, 3).astype(int))
    T[np.isnan(Rm)] = np.nan
    p = _p_normal(T)
    esik = bh_esik(p.ravel(), 0.10)
    yari = len(G) // 2
    R1, _ = _gecikme_matrisi(G.iloc[:yari], gecikme)
    R2, _ = _gecikme_matrisi(G.iloc[yari:], gecikme)
    kenar = []
    for i in range(len(ad)):
        for j in range(len(ad)):
            if np.isnan(Rm[i, j]):
                continue
            kenar.append({"oncu": ad[i], "takipci": ad[j], "kor": float(Rm[i, j]), "t": float(T[i, j]), "anlamli": bool(p[i, j] <= esik),
                          "yari1": float(R1[i, j]) if not np.isnan(R1[i, j]) else None, "yari2": float(R2[i, j]) if not np.isnan(R2[i, j]) else None,
                          "tutarli": bool(np.sign(R1[i, j]) == np.sign(R2[i, j]) == np.sign(Rm[i, j]))})  # fmt: skip
    kendi = {ad[i]: float(Rm[i, i]) for i in range(len(ad)) if not np.isnan(Rm[i, i])}
    # liderlik puanı: başkalarını öngörme − başkalarınca öngörülme (köşegen dışı ortalama)
    K = np.where(np.eye(len(ad), dtype=bool), np.nan, Rm)
    lider = {ad[i]: float(np.nanmean(K[i, :]) - np.nanmean(K[:, i])) for i in range(len(ad))}
    anl = [k for k in kenar if k["anlamli"] and k["oncu"] != k["takipci"]]
    return {"anahtar": anahtar, "artik": artik, "gecikme": gecikme, "gun": int(len(G)), "grup": ad, "test": int(np.isfinite(p).sum()), "fdr_esik_p": esik,
            "anlamli_sayi": len(anl), "anlamli_ve_tutarli": int(sum(k["tutarli"] for k in anl)), "oz_iliski": kendi,
            "liderlik": dict(sorted(lider.items(), key=lambda kv: -kv[1])), "kenarlar": sorted(kenar, key=lambda k: -abs(k["t"]))}  # fmt: skip


def fiyat_gecikmesi(P: Panel, gecikme: int = 4, min_gun: int = 300) -> pd.DataFrame:
    """Hou–Moskowitz fiyat gecikmesi: D = 1 − R²(yalnız eşzamanlı piyasa) / R²(eşzamanlı + gecikmeli piyasa).
    Ayrıca gecikmeli piyasa katsayılarının toplamı (pozitifse hisse piyasayı geriden izliyor)."""
    m = P.xu100
    L = pd.concat({f"l{k}": m.shift(k) for k in range(gecikme + 1)}, axis=1)
    satir = []
    for h in P.R.columns:
        d = pd.concat([P.R[h], L], axis=1).dropna()
        if len(d) < min_gun:
            continue
        y = d.iloc[:, 0].to_numpy()
        X0 = np.column_stack([np.ones(len(d)), d["l0"].to_numpy()])
        X1 = np.column_stack([np.ones(len(d)), d[[f"l{k}" for k in range(gecikme + 1)]].to_numpy()])
        tss = ((y - y.mean()) ** 2).sum()
        b0 = np.linalg.lstsq(X0, y, rcond=None)[0]
        b1 = np.linalg.lstsq(X1, y, rcond=None)[0]
        r0 = 1 - ((y - X0 @ b0) ** 2).sum() / tss
        r1 = 1 - ((y - X1 @ b1) ** 2).sum() / tss
        art = y - X1 @ b1
        se = np.sqrt(np.diag(np.linalg.inv(X1.T @ X1)) * art.var(ddof=X1.shape[1]))
        satir.append({"hisse": h, "gun": len(d), "beta": float(b1[1]), "gecikmeli_beta_toplam": float(b1[2:].sum()), "l1_beta": float(b1[2]), "l1_t": float(b1[2] / se[2]),
                      "r2_esanli": float(r0), "r2_tam": float(r1), "gecikme_olcusu": float(1 - r0 / r1) if r1 > 0 else np.nan})  # fmt: skip
    D = pd.DataFrame(satir).set_index("hisse")
    return D.join(P.evren[["sektor", "grup", "pd_son", "halka_aciklik", "hacim_60g"]])


def oncu_takipci_saatlik(SG: pd.DataFrame, P: Panel, anahtar: str = "grup") -> dict:
    """Saat-içi öncü-takipçi: grup getirilerinin bir önceki saat dilimiyle korelasyonu (aynı gün içinde), ve
    'son saat → ertesi gece', 'gece → ilk dilim' zinciri."""
    d = SG[SG["saat"] != "gece"].merge(P.evren[[anahtar]], left_on="hisse", right_index=True)
    g = d.groupby(["gun", "saat", anahtar])["getiri"].mean().unstack(anahtar)
    g = g.loc[:, g.notna().sum() > 300]
    saatler = sorted(set(g.index.get_level_values("saat")))
    ad = list(g.columns)
    # ardışık saat çiftleri (aynı gün)
    onceki, simdi = [], []
    for s1, s2 in zip(saatler, saatler[1:]):
        a = g.xs(s1, level="saat")
        b = g.xs(s2, level="saat")
        ort = a.index.intersection(b.index)
        onceki.append(a.loc[ort])
        simdi.append(b.loc[ort])
    A = pd.concat(onceki, ignore_index=True)
    B = pd.concat(simdi, ignore_index=True)
    kenar = []
    for i in ad:
        for j in ad:
            m = pd.concat([A[i], B[j]], axis=1).dropna()
            if len(m) < 300:
                continue
            r = float(np.corrcoef(m.iloc[:, 0], m.iloc[:, 1])[0, 1])
            yari = len(m) // 2
            r1 = float(np.corrcoef(m.iloc[:yari, 0], m.iloc[:yari, 1])[0, 1])
            r2 = float(np.corrcoef(m.iloc[yari:, 0], m.iloc[yari:, 1])[0, 1])
            kenar.append({"oncu": i, "takipci": j, "kor": r, "t": _t(r, len(m)), "n": int(len(m)), "yari1": r1, "yari2": r2, "tutarli": bool(np.sign(r1) == np.sign(r2) == np.sign(r))})
    K = pd.DataFrame(kenar)
    lider = {}
    if not K.empty:
        dis = K[K["oncu"] != K["takipci"]]
        lider = (dis.groupby("oncu")["kor"].mean() - dis.groupby("takipci")["kor"].mean()).sort_values(ascending=False).to_dict()
    return {"anahtar": anahtar, "gruplar": ad, "saat_cifti": int(len(A)), "liderlik": {str(k): float(v) for k, v in lider.items()},
            "kenarlar": sorted(kenar, key=lambda k: -abs(k["t"]))}  # fmt: skip
