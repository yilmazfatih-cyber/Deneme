"""Kesit analizi: aynı sütunun birçok hissede aynı anda davranışı. Tek hissede 2 yıl zayıftır; kesit asıl kanıttır.

1. Havuzlanmış koşullu istatistik: her gün hisseler sütuna göre sıralanır (kesit kantili), kantil başına ortalama
   ileri 20g getiri ve P(sat) — zaman etkisi (piyasa rejimi) kesit kantiliyle nötrlenir.
2. İşaret tutarlılığı: hisse başına Spearman işareti; kaç hissede aynı yönde.
3. Faktör portföyü (ileriye yürüyen, aylık yeniden dengeleme): her ayın ilk gün sonu satırında sütuna göre sırala,
   üst %20 uzun / alt %20 kısa (ya da yalnız uzun) eşit ağırlık, 1 ay tut; maliyet 10 bp/işlem tarafı; yıllık Sharpe,
   t-istatistiği; eşit ağırlıklı evren kıyası. Deflated Sharpe sütun sayısına göre.
Dürüstlük: evren hayatta kalanlardan (bugünkü BIST 100) oluşur → hayatta kalma yanlılığı var; 24 ay ≈ 24 bağımsız
yeniden dengeleme → t-istatistikleri küçük örneklem.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

from ..ogrenme.saglamlik import deflated_sharpe
from .analiz import CEYREKLIK, OZELLIKLER, SEVIYE, _spearman


def gun_sonu_tablosu(db_yolu: str | Path) -> pd.DataFrame:
    db = sqlite3.connect(db_yolu)
    try:
        R = pd.read_sql_query("SELECT * FROM omurga WHERE gun_sonu = 1 ORDER BY hisse, zaman", db)
    finally:
        db.close()
    R["gun"] = pd.to_datetime(R["gun"])
    return R


def kesit_kantil(G: pd.DataFrame, sutun: str, k: int = 5) -> pd.Series:
    def _q(x: pd.Series) -> pd.Series:
        if x.notna().sum() < k * 2:
            return pd.Series(np.nan, index=x.index)
        try:
            return pd.qcut(x.rank(method="first"), k, labels=False)
        except ValueError:
            return pd.Series(np.nan, index=x.index)

    return G.groupby("gun")[sutun].transform(_q)


def havuz_istatistik(G: pd.DataFrame, hedef: str = "ileri_20g", sinyal: str = "sat_sinyali_20g") -> pd.DataFrame:
    satirlar = []
    hisseler = G["hisse"].nunique()
    for f in OZELLIKLER:
        if f not in G.columns or G[f].notna().sum() < 500:
            continue
        # Piyasa düzeyi sütunlar (XU100, USD/TRY, makro olay sayaçları) o gün tüm hisselerde aynıdır: kesitte sıralanamaz
        if G.groupby("gun")[f].nunique().median() < 5:
            continue
        q = kesit_kantil(G, f)
        d = G.assign(kq=q).dropna(subset=["kq", hedef])
        if d.empty:
            continue
        grp = d.groupby("kq").agg(n=(hedef, "size"), ort_ileri=(hedef, "mean"), p_sat=(sinyal, "mean"))
        if len(grp) < 5:
            continue
        # hisse başına işaret tutarlılığı
        isaretler = []
        for _, h in G.groupby("hisse"):
            dd = h[[f, hedef]].dropna()
            if len(dd) >= 100 and dd[f].round(6).nunique() >= 20:
                rho, _ = _spearman(dd[f].to_numpy(), dd[hedef].to_numpy())
                if not np.isnan(rho):
                    isaretler.append(np.sign(rho))
        poz = sum(1 for x in isaretler if x > 0)
        rho_h, p_h = _spearman(d[f].to_numpy(), d[hedef].to_numpy())
        satirlar.append({
            "ozellik": f, "n": int(len(d)), "hisse": hisseler, "uyari": ("seviye" if f in SEVIYE else "çeyreklik adım" if f in CEYREKLIK else ""),
            "spearman_havuz": round(rho_h, 3), "p_havuz": p_h,
            "k1_ort_ileri": grp["ort_ileri"].iloc[0], "k5_ort_ileri": grp["ort_ileri"].iloc[-1], "fark_k5_k1": grp["ort_ileri"].iloc[-1] - grp["ort_ileri"].iloc[0],
            "k1_p_sat": grp["p_sat"].iloc[0], "k5_p_sat": grp["p_sat"].iloc[-1],
            "pozitif_hisse": poz, "negatif_hisse": len(isaretler) - poz, "kovalar": grp.round(4).reset_index().to_dict(orient="records"),
        })  # fmt: skip
    T = pd.DataFrame(satirlar)
    if T.empty:
        return T
    T["tutarlilik"] = (T[["pozitif_hisse", "negatif_hisse"]].max(axis=1) / (T["pozitif_hisse"] + T["negatif_hisse"]).replace(0, np.nan))
    T["p_bonferroni"] = (T["p_havuz"] * len(T)).clip(upper=1.0)
    return T.sort_values("fark_k5_k1", key=lambda s: s.abs(), ascending=False).reset_index(drop=True)


def faktor_portfoyu(G: pd.DataFrame, sutun: str, yon: int = 1, uzun_kisa: bool = True, maliyet_bps: float = 10.0, k: int = 5) -> dict:
    """Aylık yeniden dengelenen kantil portföyü. yon=+1: yüksek değer uzun; -1: düşük değer uzun.
    Getiri: ay başı gün sonu satırından bir sonraki ay başına kadar kapanış değişimi (hisse bazında), eşit ağırlık."""
    G = G.dropna(subset=[sutun, "kapanis"]).copy()
    G["ay"] = G["gun"].dt.to_period("M")
    ilk = G.sort_values("gun").groupby(["hisse", "ay"]).head(1)  # her hissenin aydaki ilk gün sonu satırı
    fiyat = ilk.pivot(index="ay", columns="hisse", values="kapanis")
    deger = ilk.pivot(index="ay", columns="hisse", values=sutun)
    aylik_getiri = fiyat.shift(-1) / fiyat - 1  # bu ay başından gelecek ay başına
    satirlar = []
    onceki_w = pd.Series(0.0, index=fiyat.columns)
    for ay in deger.index[:-1]:
        x = deger.loc[ay].dropna()
        if len(x) < k * 2:
            continue
        kq = pd.qcut(x.rank(method="first"), k, labels=False)
        ust = x.index[kq == (k - 1) if yon > 0 else kq == 0]
        alt = x.index[kq == 0 if yon > 0 else kq == (k - 1)]
        w = pd.Series(0.0, index=fiyat.columns)
        w[ust] = 1.0 / len(ust)
        if uzun_kisa:
            w[alt] = -1.0 / len(alt)
        r = aylik_getiri.loc[ay].reindex(fiyat.columns).fillna(0.0)
        brut = float((w * r).sum())
        ciro = float((w - onceki_w).abs().sum())
        net = brut - ciro * maliyet_bps / 1e4
        evren = float(r[x.index].mean())
        satirlar.append({"ay": str(ay), "brut": brut, "net": net, "ciro": ciro, "evren": evren, "n_ust": len(ust)})
        onceki_w = w
    if len(satirlar) < 6:
        return {"sutun": sutun, "not": "yetersiz ay"}
    T = pd.DataFrame(satirlar)
    net = T["net"].to_numpy()
    sharpe = float(net.mean() / net.std() * np.sqrt(12)) if net.std() > 0 else float("nan")
    t = float(net.mean() / (net.std() / np.sqrt(len(net)))) if net.std() > 0 else float("nan")
    return {"sutun": sutun, "yon": yon, "uzun_kisa": uzun_kisa, "ay": int(len(T)), "ort_aylik_net": float(net.mean()), "sharpe": sharpe, "t": t,
            "toplam_net": float(np.prod(1 + net) - 1), "evren_toplam": float(np.prod(1 + T["evren"]) - 1), "ort_ciro": float(T["ciro"].mean()),
            "pozitif_ay_orani": float((net > 0).mean()), "aylar": T.round(4).to_dict(orient="records")}  # fmt: skip


def kesit_analizi(db_yolu: str | Path, maliyet_bps: float = 10.0) -> dict:
    G = gun_sonu_tablosu(db_yolu)
    out: dict = {"hisse_sayisi": int(G["hisse"].nunique()), "hisseler": sorted(G["hisse"].unique().tolist()), "gun": int(G["gun"].nunique()),
                 "ilk": str(G["gun"].min().date()), "son": str(G["gun"].max().date())}  # fmt: skip
    H = havuz_istatistik(G)
    out["havuz"] = H.to_dict(orient="records")
    # faktör portföyleri: havuz istatistiğinin işaretine göre yön; seviye/çeyreklik hariç
    portfoyler = []
    for _, r in H.iterrows():
        f = r["ozellik"]
        if r["uyari"]:
            continue
        yon = 1 if r["fark_k5_k1"] > 0 else -1
        for uk in (True, False):
            p = faktor_portfoyu(G, f, yon, uk, maliyet_bps)
            if "sharpe" in p:
                portfoyler.append({**{k: v for k, v in p.items() if k != "aylar"}, "havuz_fark": r["fark_k5_k1"]})
    P = pd.DataFrame(portfoyler)
    if not P.empty:
        P = P.sort_values("sharpe", ascending=False)
        sharpeler = [float(x) for x in P["sharpe"].tolist() if not np.isnan(x)]
        en_iyi = P.iloc[0]
        aylar = faktor_portfoyu(G, en_iyi["sutun"], int(en_iyi["yon"]), bool(en_iyi["uzun_kisa"]), maliyet_bps)["aylar"]
        net = np.array([a["net"] for a in aylar])
        # DSR aylık getirilerle: saglamlik.deflated_sharpe günlük varsayar (√252); aylık için √12 ölçeğine çevir
        dsr = deflated_sharpe(float(en_iyi["sharpe"]) * np.sqrt(252 / 12), [s * np.sqrt(252 / 12) for s in sharpeler], net)
        out["en_iyi_portfoy"] = {**en_iyi.to_dict(), "dsr": dsr}
    out["portfoyler"] = P.to_dict(orient="records") if not P.empty else []
    # evren eşit ağırlık al-tut aylık
    G["ay"] = G["gun"].dt.to_period("M")
    ilk = G.sort_values("gun").groupby(["hisse", "ay"]).head(1)
    fiyat = ilk.pivot(index="ay", columns="hisse", values="kapanis")
    ev = (fiyat.shift(-1) / fiyat - 1).mean(axis=1).dropna()
    out["evren_esit_agirlik"] = {"ay": int(len(ev)), "toplam": float(np.prod(1 + ev) - 1), "sharpe": float(ev.mean() / ev.std() * np.sqrt(12)) if ev.std() > 0 else None}
    # gece/gün içi kesit toplamı
    gg = G.groupby("hisse").agg(gece=("gece_getiri", lambda s: float(np.prod(1 + s.dropna()) - 1)), gunici=("gunici_getiri", lambda s: float(np.prod(1 + s.dropna()) - 1)))
    out["gece_gunduz"] = {"gece_pozitif_hisse": int((gg["gece"] > 0).sum()), "gunici_negatif_hisse": int((gg["gunici"] < 0).sum()), "hisse": int(len(gg)),
                          "gece_medyan": float(gg["gece"].median()), "gunici_medyan": float(gg["gunici"].median())}  # fmt: skip
    return out


def _y(x) -> str:
    return "-" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:+.1%}"


def kesit_raporu(s: dict) -> str:
    L = [f"# Kesit analizi — {s['hisse_sayisi']} hisse, {s['gun']} gün ({s['ilk']} → {s['son']})", "",
         "Her gün hisseler sütuna göre kesit kantiline ayrılır (K1 en düşük %20, K5 en yüksek %20); ileri 20 gün getiri ve "
         "P(sat) = 20 gün içinde ≥%10 düşüş oranı. 'Tutarlılık' = aynı işareti veren hisse oranı. Evren bugünkü hisselerdir "
         "(hayatta kalma yanlılığı). Yatırım tavsiyesi değildir.", ""]  # fmt: skip
    gg = s["gece_gunduz"]
    L += [f"**Gece/gün içi:** {gg['hisse']} hissenin {gg['gece_pozitif_hisse']}'inde gece toplamı pozitif, {gg['gunici_negatif_hisse']}'inde gün içi toplamı negatif "
          f"(medyan gece {_y(gg['gece_medyan'])}, gün içi {_y(gg['gunici_medyan'])}).", ""]  # fmt: skip
    ev = s["evren_esit_agirlik"]
    L += [f"**Evren eşit ağırlık al-tut (aylık):** {ev['ay']} ay, toplam {_y(ev['toplam'])}, Sharpe {ev['sharpe']:.2f}." if ev["sharpe"] is not None else "", ""]
    L += ["## Havuzlanmış koşullu istatistik (|K5−K1| farkına göre sıralı)", "",
          "| Özellik | Uyarı | n | Spearman | p (düz.) | K1 ileri 20g | K5 ileri 20g | K5−K1 | K1 P(sat) | K5 P(sat) | + hisse | − hisse | Tutarlılık |",
          "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]  # fmt: skip
    for r in s["havuz"][:25]:
        L.append(f"| {r['ozellik']} | {r['uyari']} | {r['n']} | {r['spearman_havuz']:+.2f} | {r['p_bonferroni']:.3f} | {_y(r['k1_ort_ileri'])} | {_y(r['k5_ort_ileri'])} | {_y(r['fark_k5_k1'])} | "
                 f"{r['k1_p_sat']:.0%} | {r['k5_p_sat']:.0%} | {r['pozitif_hisse']} | {r['negatif_hisse']} | {r['tutarlilik']:.0%} |")  # fmt: skip
    L += ["", "## Faktör portföyleri (aylık yeniden dengeleme, 10 bp maliyet, kantil 5)", "",
          "| Sütun | Yön | Uzun-kısa | Ay | Ort. aylık net | Sharpe | t | Toplam net | Evren toplam | Pozitif ay |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]  # fmt: skip
    for r in s["portfoyler"][:20]:
        L.append(f"| {r['sutun']} | {'yüksek uzun' if r['yon'] > 0 else 'düşük uzun'} | {'evet' if r['uzun_kisa'] else 'yalnız uzun'} | {r['ay']} | {_y(r['ort_aylik_net'])} | {r['sharpe']:.2f} | {r['t']:.1f} | {_y(r['toplam_net'])} | {_y(r['evren_toplam'])} | {r['pozitif_ay_orani']:.0%} |")  # fmt: skip
    if "en_iyi_portfoy" in s:
        e = s["en_iyi_portfoy"]
        L += ["", f"En iyi portföy (sonradan bakışla seçildi): **{e['sutun']}** ({'yüksek' if e['yon'] > 0 else 'düşük'} uzun, {'uzun-kısa' if e['uzun_kisa'] else 'yalnız uzun'}), Sharpe {e['sharpe']:.2f}; "
              f"Deflated Sharpe ({e['dsr'].get('deneme')} deneme): {e['dsr'].get('dsr', float('nan')):.2f} — 0,95 üstü anlamlı, 0,5 civarı şans. "
              "Seçim tüm dönemde yapıldığı için bu bir strateji değil, şans tavanıdır; ileriye yürüyen doğrulama için dönem ikiye bölünmeli."]  # fmt: skip
    return "\n".join(L)
