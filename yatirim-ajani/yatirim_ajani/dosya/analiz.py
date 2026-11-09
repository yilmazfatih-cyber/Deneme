"""Hisse dosyası matematiksel analizi.

Sorular:
1. Hangi sütun değerleri sat/al sinyallerinden ÖNCE görülüyor? (koşullu istatistik: kovalara göre ileri getiri ve
   P(sat sinyali); bağımsız bölüm sayısı; Spearman + Bonferroni)
2. Olay türleri fiyatı nasıl etkiledi? (olay çalışması: XU100'e göre anormal ileri getiri 1g/5g/20g)
3. Basit eşik kuralları ileriye yürüyen testte ayakta kalıyor mu? (ilk %60 günde eşik seçimi, kalan %40'ta ölçüm;
   deneme sayısına göre Deflated Sharpe)

Dürüstlük notları: 2 yıllık tek hisse verisi azdır; ardışık günler bağımsız değildir (bölüm sayısı raporlanır);
kovalar tüm örneklemde kurulur (tanımlayıcı), öngörü iddiası yalnız ileriye yürüyen kural testinden gelir.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

from ..ogrenme.saglamlik import deflated_sharpe

OZELLIKLER = [
    "getiri_1g", "getiri_5g", "getiri_20g", "getiri_60g", "getiri_120g", "mom_12_1", "zirve_52h_yakinlik", "zirveden_dusus",
    "oynaklik_20g", "oynaklik_60g", "atr_20g_oran", "rsi_14", "ma20_uzaklik", "ma50_uzaklik", "ma200_uzaklik",
    "hacim_z_20", "amihud_20g", "devir_hizi_20g", "gece_ort_20g", "gunici_ort_20g", "aof_1g_sapma", "max_gunluk_20g", "min_gunluk_20g", "ivol_60g",
    "endekse_gore_1g", "endekse_gore_20g", "endekse_gore_60g", "beta_60g", "xu100_getiri_20g", "xu100_ma200_uzaklik",
    "usdtry_getiri_20g", "dolar_getiri_60g", "piyasa_degeri_mn", "halka_aciklik",
    "fk", "kazanc_verimi", "pd_dd", "fd_favok", "snak_verimi", "temettu_verimi", "roe_ttm", "net_kar_marji", "kar_buyume_yillik",
    "satis_buyume_yillik", "net_borc_ozkaynak", "bilancodan_gun", "olay_sayi_5g", "olay_yon_5g",
]  # fmt: skip
TAKVIM = ["haftanin_gunu", "ay", "ay_donusu", "bayram_oncesi", "bayram_sonrasi", "bilanco_sezonu"]
# Seviye (durağan olmayan) sütunlar: 2 yıllık tek hisse örnekleminde "yüksek seviye → sonra düşüş" yalnız örneklem içi
# ortalamaya dönüştür; kural taramasına alınmaz, koşullu tabloda işaretlenir.
SEVIYE = {"piyasa_degeri_mn", "dolar_fiyat", "halka_aciklik", "bilancodan_gun"}
# Çeyreklik adım fonksiyonları: n büyük görünse de bağımsız değer sayısı ≤ çeyrek sayısı
CEYREKLIK = {"fk", "kazanc_verimi", "pd_dd", "fd_favok", "snak_verimi", "temettu_verimi", "roe_ttm", "net_kar_marji", "kar_buyume_yillik", "satis_buyume_yillik", "net_borc_ozkaynak"}


def _spearman(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    """Spearman rho ve yaklaşık p (t dağılımı yerine normal yaklaşımı, n>30)."""
    n = len(x)
    if n < 30:
        return float("nan"), float("nan")
    rx = pd.Series(x).rank().to_numpy()
    ry = pd.Series(y).rank().to_numpy()
    rho = float(np.corrcoef(rx, ry)[0, 1])
    if np.isnan(rho):
        return rho, float("nan")
    z = np.arctanh(np.clip(rho, -0.999999, 0.999999)) * np.sqrt(max(n - 3, 1))
    p = 2 * (1 - 0.5 * (1 + _erf(abs(z) / np.sqrt(2))))
    return rho, float(p)


def _erf(x: float) -> float:
    # Abramowitz-Stegun 7.1.26
    t = 1 / (1 + 0.3275911 * abs(x))
    y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * np.exp(-x * x)
    return float(np.sign(x) * y)


def bolum_sayisi(bayrak: pd.Series) -> int:
    """Ardışık 1'lerden oluşan bağımsız bölüm (episode) sayısı."""
    b = bayrak.fillna(0).astype(int).to_numpy()
    if len(b) == 0:
        return 0
    return int(((b[1:] == 1) & (b[:-1] == 0)).sum() + (b[0] == 1))


def gun_tablosu(db_yolu: str | Path, hisse: str) -> pd.DataFrame:
    db = sqlite3.connect(db_yolu)
    try:
        R = pd.read_sql_query("SELECT * FROM omurga WHERE hisse = ? ORDER BY zaman", db, params=(hisse,))
    finally:
        db.close()
    R["zaman"] = pd.to_datetime(R["zaman"])
    return R


def kosullu_istatistik(G: pd.DataFrame, hedef: str = "ileri_20g", sinyal: str = "sat_sinyali_20g", kova: int = 5) -> pd.DataFrame:
    satirlar = []
    taban = G[sinyal].mean() if sinyal in G else np.nan
    for f in OZELLIKLER:
        if f not in G.columns:
            continue
        d = G[[f, hedef, sinyal]].dropna()
        if len(d) < 60 or d[f].nunique() < kova:
            continue
        try:
            d["kova"] = pd.qcut(d[f], kova, labels=False, duplicates="drop")
        except ValueError:
            continue
        rho, p = _spearman(d[f].to_numpy(), d[hedef].to_numpy())
        grp = d.groupby("kova").agg(n=(hedef, "size"), ort_ileri=(hedef, "mean"), medyan_ileri=(hedef, "median"), p_sat=(sinyal, "mean"), alt=(f, "min"), ust=(f, "max"))
        en_dusuk, en_yuksek = grp.iloc[0], grp.iloc[-1]
        benzersiz = int(d[f].round(6).nunique())
        satirlar.append({
            "ozellik": f, "n": int(len(d)), "benzersiz": benzersiz, "uyari": ("seviye" if f in SEVIYE else "çeyreklik adım" if f in CEYREKLIK and benzersiz < 40 else ""),
            "spearman": round(rho, 3), "p": p,
            "k1_ort_ileri": en_dusuk["ort_ileri"], "k5_ort_ileri": en_yuksek["ort_ileri"], "fark_k5_k1": en_yuksek["ort_ileri"] - en_dusuk["ort_ileri"],
            "k1_p_sat": en_dusuk["p_sat"], "k5_p_sat": en_yuksek["p_sat"], "taban_p_sat": taban,
            "k1_aralik": f"{en_dusuk['alt']:.3g}–{en_dusuk['ust']:.3g}", "k5_aralik": f"{en_yuksek['alt']:.3g}–{en_yuksek['ust']:.3g}",
            "kovalar": grp.round(4).reset_index().to_dict(orient="records"),
        })  # fmt: skip
    T = pd.DataFrame(satirlar)
    if T.empty:
        return T
    m = len(T)
    T["p_bonferroni"] = (T["p"] * m).clip(upper=1.0)
    return T.sort_values("p").reset_index(drop=True)


def sat_oncesi_profil(G: pd.DataFrame, sinyal: str = "sat_sinyali_20g") -> pd.DataFrame:
    """Sinyal verilen günlerde özelliklerin dağılımı vs diğer günler: medyanlar ve standartlaştırılmış fark."""
    if sinyal not in G.columns:
        return pd.DataFrame()
    s = G[G[sinyal] == 1]
    d = G[G[sinyal] == 0]
    satirlar = []
    for f in OZELLIKLER:
        if f not in G.columns or s[f].notna().sum() < 10 or d[f].notna().sum() < 30:
            continue
        std = G[f].std()
        satirlar.append({"ozellik": f, "sinyal_medyan": s[f].median(), "diger_medyan": d[f].median(),
                         "std_fark": (s[f].mean() - d[f].mean()) / std if std and not np.isnan(std) else np.nan,
                         "sinyal_n": int(s[f].notna().sum())})  # fmt: skip
    T = pd.DataFrame(satirlar)
    if T.empty:
        return T
    T["mutlak"] = T["std_fark"].abs()
    return T.sort_values("mutlak", ascending=False).drop(columns="mutlak").reset_index(drop=True)


def olay_etkisi(db_yolu: str | Path, hisse: str, G: pd.DataFrame) -> pd.DataFrame:
    """Olay türü bazında anormal ileri getiri (hisse ileri - XU100 ileri), olayın açıklanmasından sonraki ilk gün sonu satırından."""
    db = sqlite3.connect(db_yolu)
    try:
        if not db.execute("SELECT name FROM sqlite_master WHERE name='olaylar'").fetchone():
            return pd.DataFrame()
        sutunlar = [r[1] for r in db.execute("PRAGMA table_info(olaylar)")]
        sql = "SELECT kamuya_acilma, tur, yon, hisse, kapsam, baslik FROM olaylar" + (" WHERE dosya = ?" if "dosya" in sutunlar else "")
        O = pd.read_sql_query(sql, db, params=(hisse,) if "dosya" in sutunlar else ())
    finally:
        db.close()
    if O.empty:
        return pd.DataFrame()
    O["kamuya_acilma"] = pd.to_datetime(O["kamuya_acilma"], errors="coerce", utc=True).dt.tz_convert("Europe/Istanbul").dt.tz_localize(None)
    O = O.dropna(subset=["kamuya_acilma"]).sort_values("kamuya_acilma")
    GG = G[G["gun_sonu"] == 1].sort_values("zaman").copy()
    GG["zaman_n"] = GG["zaman"].dt.tz_localize(None) if GG["zaman"].dt.tz is not None else GG["zaman"]
    # olaydan sonraki ilk gün sonu satırı: olay 18:00 sonrası açıklandıysa ertesi günün gün sonu (fiyat tepkisi ertesi gün)
    eslesme = pd.merge_asof(O.sort_values("kamuya_acilma"), GG[["zaman_n", "ileri_1g", "ileri_5g", "ileri_20g", "xu100_ileri_1g", "xu100_ileri_5g", "xu100_ileri_20g", "getiri_1g", "gece_getiri"]],
                            left_on="kamuya_acilma", right_on="zaman_n", direction="forward")  # fmt: skip
    for k in ("1g", "5g", "20g"):
        eslesme[f"anormal_{k}"] = eslesme[f"ileri_{k}"] - eslesme[f"xu100_ileri_{k}"]
    eslesme["ilk_gun_tepki"] = eslesme["getiri_1g"]  # eşleşen gün sonunun o günkü getirisi (açıklama günü/ertesi gün)
    eslesme["hisse_mi"] = (eslesme["hisse"] == hisse)
    grp = eslesme.groupby(["tur", "hisse_mi"]).agg(
        n=("anormal_1g", "size"),
        ilk_gun_tepki_ort=("ilk_gun_tepki", "mean"),
        anormal_1g_ort=("anormal_1g", "mean"), anormal_5g_ort=("anormal_5g", "mean"), anormal_20g_ort=("anormal_20g", "mean"),
        anormal_20g_std=("anormal_20g", "std"), pozitif_oran_20g=("anormal_20g", lambda s: float((s > 0).mean()) if s.notna().any() else np.nan),
    ).reset_index()  # fmt: skip
    grp["t_20g"] = grp["anormal_20g_ort"] / (grp["anormal_20g_std"] / np.sqrt(grp["n"].clip(lower=1)))
    # yön ayrımı (olumlu/olumsuz haber) yalnız hisse olayları için
    yon = eslesme[eslesme["hisse_mi"]].groupby("yon").agg(n=("anormal_1g", "size"), anormal_1g_ort=("anormal_1g", "mean"), anormal_5g_ort=("anormal_5g", "mean"), anormal_20g_ort=("anormal_20g", "mean")).reset_index()
    yon["tur"] = "YÖN: " + yon["yon"].astype(str)
    yon["hisse_mi"] = True
    return pd.concat([grp.sort_values(["hisse_mi", "n"], ascending=[False, False]), yon], ignore_index=True)


def kural_taramasi(G: pd.DataFrame, hedef: str = "ileri_20g", egitim_orani: float = 0.6, kantiller=(0.1, 0.2, 0.3, 0.7, 0.8, 0.9)) -> dict:
    """Tek özellikli eşik kuralları: 'özellik > q ise hisseden çık (nakit)' ve '< q ise çık'. Eğitim bölümünde en iyi
    kural seçilir (ort. ileri_20g'yi en çok iyileştiren), test bölümünde ölçülür. Günlük getiri serisi: kural aktifken 0,
    değilse hissenin günlük getirisi (gün sonu satırları). Deflated Sharpe tüm denemelere göre."""
    GG = G[G["gun_sonu"] == 1].sort_values("zaman").reset_index(drop=True)
    GG["r_gun"] = GG["kapanis"].pct_change().shift(-1)  # bugün karar, yarınki günlük getiri
    n = len(GG)
    kes = int(n * egitim_orani)
    egitim, test = GG.iloc[:kes], GG.iloc[kes:]
    if len(test) < 60:
        return {"not": "test bölümü çok kısa"}

    def sharpe(r: pd.Series) -> float | None:
        r = r.dropna()
        if len(r) < 20 or r.std() == 0:
            return None
        return float(r.mean() / r.std() * np.sqrt(252))

    denemeler = []
    for f in OZELLIKLER:
        if f in SEVIYE or f not in GG.columns or egitim[f].notna().sum() < 100 or egitim[f].round(6).nunique() < 40:
            continue
        for q in kantiller:
            esik = float(egitim[f].quantile(q))
            for yon in ("ust", "alt"):
                cik_e = (egitim[f] > esik) if yon == "ust" else (egitim[f] < esik)
                cik_t = (test[f] > esik) if yon == "ust" else (test[f] < esik)
                if not (0.10 <= cik_e.mean() <= 0.70) or not (0.05 <= cik_t.mean() <= 0.90):
                    continue  # hep nakit / hiç nakit kuralları anlamsız
                r_e = egitim["r_gun"].where(~cik_e, 0.0)
                r_t = test["r_gun"].where(~cik_t, 0.0)
                denemeler.append({"ozellik": f, "kantil": q, "esik": esik, "yon": yon, "egitim_sharpe": sharpe(r_e), "test_sharpe": sharpe(r_t),
                                  "egitim_ort_cikis_ileri": float(egitim.loc[cik_e, hedef].mean()), "test_ort_cikis_ileri": float(test.loc[cik_t, hedef].mean()) if cik_t.any() else np.nan,
                                  "test_cikis_orani": float(cik_t.mean()), "_r_t": r_t})  # fmt: skip
    if not denemeler:
        return {"not": "deneme yok"}
    altut_e, altut_t = sharpe(egitim["r_gun"]), sharpe(test["r_gun"])
    D = pd.DataFrame(denemeler)
    D = D[D["egitim_sharpe"].notna()]
    secilen = D.sort_values("egitim_sharpe", ascending=False).iloc[0]
    test_sh = float(secilen["test_sharpe"]) if secilen["test_sharpe"] is not None and not pd.isna(secilen["test_sharpe"]) else 0.0
    dsr = deflated_sharpe(test_sh, [float(x) for x in D["test_sharpe"].tolist() if x is not None and not pd.isna(x)], secilen["_r_t"].dropna().to_numpy())
    en_iyi_test = D.sort_values("test_sharpe", ascending=False).head(5)
    return {
        "egitim_gun": int(kes), "test_gun": int(n - kes), "deneme_sayisi": int(len(D)),
        "al_tut_sharpe_egitim": altut_e, "al_tut_sharpe_test": altut_t,
        "secilen": {k: (float(v) if isinstance(v, (int, float, np.floating)) and not isinstance(v, bool) else v) for k, v in secilen.drop("_r_t").items()},
        "secilen_dsr": dsr,
        "test_en_iyi_5_sonradan_bakis": en_iyi_test.drop(columns="_r_t").to_dict(orient="records"),
        "not": "Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.",
    }


def takvim_etkileri(G: pd.DataFrame) -> pd.DataFrame:
    GG = G[G["gun_sonu"] == 1].copy()
    GG["r_gun"] = GG["kapanis"].pct_change()
    satirlar = []
    for f in TAKVIM:
        if f not in GG.columns:
            continue
        grp = GG.groupby(f)["r_gun"].agg(["size", "mean", "std"]).reset_index()
        for _, r in grp.iterrows():
            satirlar.append({"takvim": f, "deger": r[f], "n": int(r["size"]), "ort_gunluk_getiri": r["mean"], "t": r["mean"] / (r["std"] / np.sqrt(max(r["size"], 1))) if r["std"] else np.nan})
    return pd.DataFrame(satirlar)


def gece_gunduz(G: pd.DataFrame) -> dict:
    GG = G[G["gun_sonu"] == 1].copy()
    gece = GG["gece_getiri"].dropna()
    gunici = GG["gunici_getiri"].dropna()
    return {"gun": int(len(GG)), "gece_toplam": float(np.prod(1 + gece) - 1), "gunici_toplam": float(np.prod(1 + gunici) - 1),
            "gece_ort": float(gece.mean()), "gunici_ort": float(gunici.mean()), "gece_t": float(gece.mean() / gece.std() * np.sqrt(len(gece))) if len(gece) > 2 else np.nan,
            "gunici_t": float(gunici.mean() / gunici.std() * np.sqrt(len(gunici))) if len(gunici) > 2 else np.nan}  # fmt: skip


def analiz_et(db_yolu: str | Path, hisse: str) -> dict:
    R = gun_tablosu(db_yolu, hisse)
    G = R[R["gun_sonu"] == 1].copy()
    out: dict = {"hisse": hisse, "satir": int(len(R)), "gun": int(len(G)), "ilk": str(R["zaman"].min()), "son": str(R["zaman"].max())}
    if "sat_sinyali_20g" in G:
        out["sat_sinyali_gun"] = int(G["sat_sinyali_20g"].sum()) if G["sat_sinyali_20g"].notna().any() else 0
        out["sat_bolum"] = bolum_sayisi(G["sat_sinyali_20g"])
        out["al_sinyali_gun"] = int(G["al_sinyali_20g"].sum()) if G["al_sinyali_20g"].notna().any() else 0
        out["al_bolum"] = bolum_sayisi(G["al_sinyali_20g"])
    out["gece_gunduz"] = gece_gunduz(R)
    out["kosullu"] = kosullu_istatistik(G).to_dict(orient="records")
    out["sat_oncesi"] = sat_oncesi_profil(G).to_dict(orient="records")
    out["al_oncesi"] = sat_oncesi_profil(G, "al_sinyali_20g").to_dict(orient="records")
    out["olay_etkisi"] = olay_etkisi(db_yolu, hisse, R).to_dict(orient="records")
    out["kural"] = kural_taramasi(R)
    out["takvim"] = takvim_etkileri(R).to_dict(orient="records")
    # mevcut durum (son satır) ve kovası
    son = R.iloc[-1]
    out["son_durum"] = {f: (None if pd.isna(son[f]) else float(son[f])) for f in OZELLIKLER if f in R.columns}
    return out


def _yuzde(x) -> str:
    return "-" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:+.1%}"


def rapor_metni(s: dict) -> str:
    L = [f"# Hisse dosyası analizi — {s['hisse']}", "",
         f"Satır: {s['satir']} (gün sonu satırı {s['gun']}) · {s['ilk']} → {s['son']}. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.", ""]  # fmt: skip
    if "sat_sinyali_gun" in s:
        L.append(f"Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı {s['sat_sinyali_gun']} ({s['sat_bolum']} bağımsız bölüm); "
                 f"≥%10 yükseliş {s['al_sinyali_gun']} gün ({s['al_bolum']} bölüm). Bölüm sayısı azsa istatistikler zayıftır.")  # fmt: skip
    gg = s["gece_gunduz"]
    L += ["", "## Gece / gün içi ayrışması",
          f"{gg['gun']} günde gece (kapanış→açılış) toplam {_yuzde(gg['gece_toplam'])} (t={gg['gece_t']:.1f}), gün içi (açılış→kapanış) toplam {_yuzde(gg['gunici_toplam'])} (t={gg['gunici_t']:.1f})."]  # fmt: skip
    L += ["", "## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)", "",
          "| Özellik | Sinyal günleri | Diğer günler | Std. fark |", "| --- | --- | --- | --- |"]
    for r in s["sat_oncesi"][:12]:
        L.append(f"| {r['ozellik']} | {r['sinyal_medyan']:.3g} | {r['diger_medyan']:.3g} | {r['std_fark']:+.2f} |")
    L += ["", "## Al sinyali öncesi görülen değerler", "", "| Özellik | Sinyal günleri | Diğer günler | Std. fark |", "| --- | --- | --- | --- |"]
    for r in s["al_oncesi"][:8]:
        L.append(f"| {r['ozellik']} | {r['sinyal_medyan']:.3g} | {r['diger_medyan']:.3g} | {r['std_fark']:+.2f} |")
    L += ["", "## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri", "",
          "Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). "
          "P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.", "",
          "| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |",
          "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]  # fmt: skip
    for r in s["kosullu"][:18]:
        L.append(f"| {r['ozellik']} | {r['n']} | {r['benzersiz']} | {r['uyari']} | {r['spearman']:+.2f} | {r['p_bonferroni']:.3f} | {_yuzde(r['k1_ort_ileri'])} | {_yuzde(r['k5_ort_ileri'])} | "
                 f"{r['k1_p_sat']:.0%} | {r['k5_p_sat']:.0%} | {r['k1_aralik']} | {r['k5_aralik']} |")  # fmt: skip
    L += ["", "## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)", "",
          "| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]  # fmt: skip
    for r in s["olay_etkisi"][:25]:
        if r["n"] < 2 and not str(r["tur"]).startswith("YÖN"):
            continue
        L.append(f"| {r['tur']} | {'evet' if r['hisse_mi'] else 'hayır'} | {r['n']} | {_yuzde(r.get('ilk_gun_tepki_ort'))} | {_yuzde(r['anormal_1g_ort'])} | {_yuzde(r['anormal_5g_ort'])} | {_yuzde(r['anormal_20g_ort'])} | {r.get('pozitif_oran_20g', float('nan')):.0%} |")  # fmt: skip
    k = s["kural"]
    L += ["", "## Kural taraması (ileriye yürüyen)", ""]
    if "secilen" in k:
        sc = k["secilen"]
        d = k["secilen_dsr"]
        L += [f"Eğitim {k['egitim_gun']} gün, test {k['test_gun']} gün, {k['deneme_sayisi']} deneme. Al-tut Sharpe: eğitim {k['al_tut_sharpe_egitim']:.2f}, test {k['al_tut_sharpe_test']:.2f}.",
              f"Eğitimde seçilen kural: **{sc['ozellik']} {'>' if sc['yon'] == 'ust' else '<'} {sc['esik']:.4g} ise nakde geç** (kantil {sc['kantil']}). "
              f"Eğitim Sharpe {sc['egitim_sharpe']:.2f} → test Sharpe {'-' if sc['test_sharpe'] is None or pd.isna(sc['test_sharpe']) else round(sc['test_sharpe'], 2)}; testte nakitte kalma oranı {sc['test_cikis_orani']:.0%}; "
              f"nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim {_yuzde(sc['egitim_ort_cikis_ileri'])}, test {_yuzde(sc['test_ort_cikis_ileri'])}.",
              f"Deflated Sharpe (deneme sayısı {d.get('deneme')}): {d.get('dsr', float('nan')):.2f} — 0,95 üstü anlamlı, 0,5 civarı şans.", "", k["not"]]  # fmt: skip
    else:
        L.append(k.get("not", ""))
    L += ["", "## Takvim etkileri (gün sonu günlük getiri ortalaması)", "", "| Takvim | Değer | n | Ort. günlük | t |", "| --- | --- | --- | --- | --- |"]
    for r in s["takvim"]:
        if r["takvim"] in ("haftanin_gunu", "ay_donusu", "bayram_oncesi", "bayram_sonrasi", "bilanco_sezonu"):
            L.append(f"| {r['takvim']} | {r['deger']} | {r['n']} | {_yuzde(r['ort_gunluk_getiri'])} | {r['t']:.1f} |")
    L += ["", "## Son durum (en yeni satır)", ""]
    sd = s["son_durum"]
    L.append(", ".join(f"{k}={v:.3g}" for k, v in sd.items() if v is not None))
    return "\n".join(L)
