"""Sektör düzeyi analiz: eşit ağırlıklı sektör endeksleri, sektör momentumu/rotasyonu, makro ve küresel sürücülere duyarlılık.

- Sektör endeksi: sektördeki hisselerin günlük getirilerinin eşit ağırlıklı ortalaması (gün sonu satırları).
- Rotasyon testi (aylık, ileriye dönük): her ay başında son 3 ayda en iyi 2 sektör (göreli) → 1 ay tut; 10 bp maliyet;
  kıyas: tüm sektörlerin eşit ağırlığı. 34 ay ≈ küçük örneklem.
- Duyarlılık: (a) eşzamanlı günlük beta: sektör − XU100 fazla getirisi ~ sürücünün aynı gün değişimi (Brent, altın, VIX,
  ABD 10y, DXY, EEM, S&P 500 için önceki gün; USD/TRY ve EUR/TRY aynı gün). (b) Öngörü: sürücünün 20 günlük değişimi
  (d−1'e kadar) ile sektörün sonraki 20 gün fazla getirisi; çakışmasız aylık örneklerle Spearman ve t.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

from .kur import piyasa_serileri
from .sektor_harita import sektor


def sektor_endeksleri(db_yolu: str | Path) -> tuple[pd.DataFrame, pd.Series]:
    db = sqlite3.connect(db_yolu)
    try:
        G = pd.read_sql_query("SELECT hisse, gun, getiri_1g, xu100_getiri_1g FROM omurga WHERE gun_sonu = 1", db)
    finally:
        db.close()
    G["gun"] = pd.to_datetime(G["gun"])
    G["sektor"] = G["hisse"].map(sektor)
    S = G[G["sektor"] != "diger"].groupby(["gun", "sektor"])["getiri_1g"].mean().unstack().sort_index()
    xu = G.groupby("gun")["xu100_getiri_1g"].median().sort_index()
    return S, xu


def rotasyon(S: pd.DataFrame, xu: pd.Series, bakis_ay: int = 3, en_iyi: int = 2, maliyet_bps: float = 10) -> dict:
    aylik = (1 + S.fillna(0)).groupby(S.index.to_period("M")).prod() - 1
    aylik = aylik.where(S.groupby(S.index.to_period("M")).count() >= 10)
    xu_ay = (1 + xu.fillna(0)).groupby(xu.index.to_period("M")).prod() - 1
    satir = []
    onceki: set = set()
    for i in range(bakis_ay, len(aylik)):
        gecmis = (1 + aylik.iloc[i - bakis_ay : i]).prod() - 1
        gecmis = gecmis.dropna()
        if len(gecmis) < 5:
            continue
        sec = set(gecmis.sort_values().tail(en_iyi).index)
        bu = aylik.iloc[i]
        brut = float(bu[list(sec)].mean())
        ciro = len(sec - onceki) / en_iyi if onceki else 1.0
        satir.append({"ay": str(aylik.index[i]), "secim": sorted(sec), "net": brut - 2 * ciro * maliyet_bps / 1e4, "esit": float(bu.dropna().mean()), "xu100": float(xu_ay.get(aylik.index[i], np.nan))})
        onceki = sec
    T = pd.DataFrame(satir)
    if T.empty:
        return {"not": "yetersiz veri"}
    fark = T["net"] - T["esit"]
    return {"ay": int(len(T)), "toplam_net": float(np.prod(1 + T["net"]) - 1), "toplam_esit": float(np.prod(1 + T["esit"]) - 1),
            "toplam_xu100": float(np.prod(1 + T["xu100"].fillna(0)) - 1), "ort_fark": float(fark.mean()),
            "t_fark": float(fark.mean() / (fark.std() / np.sqrt(len(fark)))) if fark.std() > 0 else float("nan"),
            "pozitif_ay": float((fark > 0).mean()), "son_secim": T["secim"].iloc[-1], "aylar": T.to_dict(orient="records")}  # fmt: skip


def duyarlilik(S: pd.DataFrame, xu: pd.Series, ham_klasor: str | Path) -> pd.DataFrame:
    P = piyasa_serileri(ham_klasor)
    usd = None
    from .kur import _csv

    u = _csv(Path(ham_klasor) / "USDTRY_X_yahoo_1d.csv")
    if not u.empty:
        g = pd.to_datetime(u["tarih"], utc=True).dt.tz_convert("Europe/Istanbul").dt.tz_localize(None).dt.normalize()
        usd = pd.Series(pd.to_numeric(u["kapanis"], errors="coerce").to_numpy(), index=g).dropna()
        usd = usd[~usd.index.duplicated(keep="last")]
        P["usdtry"] = usd
    fazla = S.sub(xu, axis=0)
    gunler = S.index
    satir = []
    for ad, seri in P.items():
        x = seri.reindex(seri.index.union(gunler)).ffill().reindex(gunler)
        aynigun = ad in ("usdtry", "eurtry")
        d = x.pct_change() if ad not in ("vix", "abd10y") else x.diff()
        d = d if aynigun else d.shift(1)  # ABD/emtia kapanışı BIST'ten sonra: önceki gün değişimi
        c20 = (x / x.shift(20) - 1) if ad not in ("vix", "abd10y") else (x - x.shift(20))
        c20 = c20.shift(1)
        ileri = (1 + fazla.fillna(0)).rolling(20).apply(np.prod, raw=True).shift(-20) - 1
        ay_sonu = gunler[pd.Series(gunler, index=gunler).dt.to_period("M").duplicated(keep="last") == False]  # noqa: E712
        for s in S.columns:
            y = fazla[s]
            m = pd.concat([y, d], axis=1).dropna()
            beta = float(np.polyfit(m.iloc[:, 1], m.iloc[:, 0], 1)[0]) if len(m) > 60 and m.iloc[:, 1].std() > 0 else np.nan
            kor = float(m.corr().iloc[0, 1]) if len(m) > 60 else np.nan
            z = pd.concat([c20.reindex(ay_sonu), ileri[s].reindex(ay_sonu)], axis=1).dropna()
            if len(z) >= 12:
                rho = float(z.rank().corr().iloc[0, 1])
                t = rho * np.sqrt((len(z) - 2) / max(1e-9, 1 - rho**2))
            else:
                rho, t = np.nan, np.nan
            satir.append({"sektor": s, "surucu": ad, "eszamanli_beta": beta, "eszamanli_kor": kor, "ongoru_rho_20g": rho, "ongoru_t": float(t) if pd.notna(t) else np.nan, "ay": int(len(z))})
    return pd.DataFrame(satir)


def calistir(db_yolu: str | Path, ham_klasor: str | Path, cikti_json: str | Path, rapor_yolu: str | Path, profiller: list[str | Path] | None = None) -> dict:
    S, xu = sektor_endeksleri(db_yolu)
    kum = ((1 + S.fillna(0)).prod() - 1).sort_values(ascending=False)
    son3a = ((1 + S.fillna(0).tail(63)).prod() - 1).sort_values(ascending=False)
    rot = rotasyon(S, xu)
    D = duyarlilik(S, xu, ham_klasor)
    prof = []
    for p in profiller or []:
        if Path(p).exists():
            veri = json.loads(Path(p).read_text(encoding="utf-8"))
            prof += veri if isinstance(veri, list) else veri.get("profiller", [])
    sonuc = {"sektor_sayisi": int(S.shape[1]), "kumulatif": kum.to_dict(), "son_3_ay": son3a.to_dict(), "rotasyon": rot,
             "duyarlilik": D.to_dict(orient="records"), "profil_sayisi": len(prof)}  # fmt: skip
    Path(cikti_json).parent.mkdir(parents=True, exist_ok=True)
    Path(cikti_json).write_text(json.dumps(sonuc, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    Path(rapor_yolu).write_text(rapor(sonuc, D, prof), encoding="utf-8")
    return sonuc


def rapor(s: dict, D: pd.DataFrame, prof: list[dict]) -> str:
    def y(x):
        return "-" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:+.1%}"

    L = ["# Sektör analizi — eşit ağırlıklı sektör endeksleri (2024-01 → 2026-11)", "",
         "Endeks: sektördeki hisselerin günlük getiri ortalaması. Evren BIST 100'ün bir kısmı; sektör başına 1–4 hisse. Yatırım tavsiyesi değildir.", "",
         "## Sektörlerin getirisi", "", "| Sektör | Dönem toplamı | Son 3 ay |", "| --- | --- | --- |"]  # fmt: skip
    for k, v in s["kumulatif"].items():
        L.append(f"| {k} | {y(v)} | {y(s['son_3_ay'].get(k))} |")
    r = s["rotasyon"]
    if "ay" in r:
        L += ["", "## Sektör rotasyonu (her ay son 3 ayın en iyi 2 sektörü, 1 ay tut, 10 bp maliyet)", "",
              f"{r['ay']} ay: rotasyon {y(r['toplam_net'])}, tüm sektörler eşit ağırlık {y(r['toplam_esit'])}, XU100 {y(r['toplam_xu100'])}. "
              f"Aylık fark ortalaması {y(r['ort_fark'])} (t = {r['t_fark']:.1f}), rotasyonun önde olduğu ay oranı {r['pozitif_ay']:.0%}. Bu ayın seçimi: {', '.join(r['son_secim'])}."]  # fmt: skip
    if not D.empty:
        L += ["", "## Sürücülere duyarlılık (sektör − XU100)", "",
              "Eşzamanlı beta: sürücünün günlük değişimine sektörün fazla getirisi (USD/TRY, EUR/TRY aynı gün; diğerleri önceki gün). "
              "Öngörü: sürücünün son 20 günlük değişimi ile sektörün sonraki 20 gün fazla getirisi, çakışmasız aylık örnek (|t| ≥ 2 kalın).", "",
              "| Sektör | Sürücü | Eşzamanlı beta | Korelasyon | Öngörü ρ (20g) | t | Ay |", "| --- | --- | --- | --- | --- | --- | --- |"]  # fmt: skip
        E = D[(D["eszamanli_kor"].abs() >= 0.15) | (D["ongoru_t"].abs() >= 2)].sort_values(["sektor", "eszamanli_kor"], key=lambda c: c if c.name == "sektor" else -c.abs())
        for _, x in E.iterrows():
            t = f"**{x['ongoru_t']:.1f}**" if pd.notna(x["ongoru_t"]) and abs(x["ongoru_t"]) >= 2 else ("-" if pd.isna(x["ongoru_t"]) else f"{x['ongoru_t']:.1f}")
            L.append(f"| {x['sektor']} | {x['surucu']} | {x['eszamanli_beta']:.2f} | {x['eszamanli_kor']:+.2f} | {x['ongoru_rho_20g']:+.2f} | {t} | {x['ay']} |")
    if prof:
        L += ["", f"## Sektör profilleri (araştırma ajanları, {len(prof)} sektör): sürücüler ve test edilebilir hipotezler", ""]
        for p in prof:
            sur = "; ".join(f"{d.get('ad')} ({d.get('yon', '')})" for d in p.get("suruculer", [])[:5])
            hip = p.get("duyarlilik_hipotezleri", [])[:2]
            L.append(f"- **{p.get('sektor')}**: sürücüler — {sur}." + (f" Hipotez: {hip[0]}" if hip else ""))
    return "\n".join(L)
