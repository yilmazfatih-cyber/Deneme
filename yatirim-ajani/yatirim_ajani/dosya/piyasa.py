"""Piyasa düzeyi analiz: PPK ve TÜFE günlerinde XU100 ve sektör tepkisi; rejimlere göre endeks, sektör, gece/gün içi ve
strateji ailesi performansı. Girdi: hisse dosyası gün sonu satırları + dosya_kaynak/makro_seriler.json + makro_rejimler.json.
PPK kararı 14:00'te açıklanır → aynı günün kapanışı tepkiyi içerir; TÜFE 10:00 → aynı gün."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

from .sektor_harita import ana_sektor, sektor


def gun_sonu(db_yolu: str | Path) -> pd.DataFrame:
    db = sqlite3.connect(db_yolu)
    try:
        G = pd.read_sql_query("SELECT hisse, gun, getiri_1g, xu100_getiri_1g, gece_getiri, gunici_getiri FROM omurga WHERE gun_sonu = 1", db)
    finally:
        db.close()
    G["gun"] = pd.to_datetime(G["gun"])
    G["sektor"] = G["hisse"].map(sektor)
    G["ana"] = G["hisse"].map(ana_sektor)
    return G


def _gun_tepkisi(G: pd.DataFrame, gunler: pd.DataFrame, etiket: str) -> pd.DataFrame:
    xu = G.groupby("gun")["xu100_getiri_1g"].median()
    ana = G.pivot_table(index="gun", columns="ana", values="getiri_1g", aggfunc="mean")
    satir = []
    for _, r in gunler.iterrows():
        d = pd.Timestamp(r["tarih"]).normalize()
        if d not in xu.index:
            continue
        i = xu.index.get_loc(d)
        sonraki = xu.iloc[i + 1] if i + 1 < len(xu) else np.nan
        k = {"tarih": d.date().isoformat(), "kategori": r["kategori"], "xu100_gun": float(xu.loc[d]), "xu100_ertesi": float(sonraki)}
        if d in ana.index:
            for a in ("finans", "holding", "sanayi", "enerji", "tuketim", "ulasim", "teknoloji_savunma"):
                if a in ana.columns and pd.notna(ana.loc[d, a]):
                    k[f"{a}_eksi_xu100"] = float(ana.loc[d, a] - xu.loc[d])
        satir.append(k)
    T = pd.DataFrame(satir)
    T["olay"] = etiket
    return T


def ppk_tufe(G: pd.DataFrame, makro: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    ppk = pd.DataFrame(makro.get("politika_faizi", []))
    if not ppk.empty:
        s = pd.to_numeric(ppk.get("surpriz_bp"), errors="coerce").fillna(0)
        dg = pd.to_numeric(ppk.get("degisim_bp"), errors="coerce").fillna(0)
        ppk["kategori"] = np.where(s < 0, "güvercin sürpriz", np.where(s > 0, "şahin sürpriz", np.where(dg < 0, "beklenen indirim", np.where(dg > 0, "beklenen artış", "sabit"))))
        ppk = _gun_tepkisi(G, ppk, "PPK")
    tufe = pd.DataFrame(makro.get("tufe", []))
    if not tufe.empty:
        s = pd.to_numeric(tufe.get("surpriz_aylik_pp"), errors="coerce")
        tufe["kategori"] = np.where(s <= -0.2, "düşük geldi (≤ −0,2 puan)", np.where(s >= 0.2, "yüksek geldi (≥ +0,2 puan)", "beklentiye yakın"))
        tufe = _gun_tepkisi(G, tufe, "TÜFE")
    return ppk, tufe


def rejim_tablosu(G: pd.DataFrame, rejimler: list[dict], islemler: pd.DataFrame | None) -> list[dict]:
    xu = G.groupby("gun")["xu100_getiri_1g"].median().sort_index()
    sek = G.groupby(["gun", "sektor"])["getiri_1g"].mean().unstack()
    out = []
    for r in rejimler:
        b, s = pd.Timestamp(r["bas"]), pd.Timestamp(r["bit"])
        x = xu[(xu.index >= b) & (xu.index <= s)].dropna()
        if x.empty:
            continue
        sk = sek[(sek.index >= b) & (sek.index <= s)]
        kum = (1 + sk.fillna(0)).prod() - 1
        kum = kum[sk.notna().sum() >= max(5, len(x) // 3)].sort_values()
        g = G[(G["gun"] >= b) & (G["gun"] <= s)]
        satir = {"ad": r["ad"], "bas": r["bas"], "bit": r["bit"], "gun": int(len(x)), "xu100": float(np.prod(1 + x) - 1),
                 "en_iyi_sektorler": [(k, float(v)) for k, v in kum.tail(3)[::-1].items()], "en_kotu_sektorler": [(k, float(v)) for k, v in kum.head(3).items()],
                 "gece_medyan_gunluk": float(g["gece_getiri"].median()), "gunici_medyan_gunluk": float(g["gunici_getiri"].median())}  # fmt: skip
        if islemler is not None and not islemler.empty:
            I = islemler[(islemler["gun"] >= b) & (islemler["gun"] <= s)]
            if not I.empty:
                st = I.groupby("strateji")["net"].agg(["mean", "size"])
                st = st[st["size"] >= 20].sort_values("mean")
                satir["en_iyi_stratejiler"] = [(k, float(v["mean"]), int(v["size"])) for k, v in st.tail(3)[::-1].iterrows()]
                satir["en_kotu_stratejiler"] = [(k, float(v["mean"]), int(v["size"])) for k, v in st.head(2).iterrows()]
        out.append(satir)
    return out


def calistir(db_yolu: str | Path, makro_json: str | Path, rejim_json: str | Path, islemler_csv: str | Path | None, cikti_json: str | Path, rapor_yolu: str | Path) -> dict:
    G = gun_sonu(db_yolu)
    makro = json.loads(Path(makro_json).read_text(encoding="utf-8"))
    rejimler = json.loads(Path(rejim_json).read_text(encoding="utf-8"))
    I = None
    if islemler_csv and Path(islemler_csv).exists():
        I = pd.read_csv(islemler_csv)
        I["gun"] = pd.to_datetime(I["gun"])
    ppk, tufe = ppk_tufe(G, makro)
    rej = rejim_tablosu(G, rejimler, I)

    def grup(T: pd.DataFrame) -> list[dict]:
        if T.empty:
            return []
        cols = [c for c in T.columns if c.endswith("_eksi_xu100")]
        A = T.groupby("kategori").agg(n=("xu100_gun", "size"), xu100_gun=("xu100_gun", "mean"), xu100_ertesi=("xu100_ertesi", "mean"), **{c: (c, "mean") for c in cols})
        return A.reset_index().to_dict(orient="records")

    sonuc = {"ppk": grup(ppk), "tufe": grup(tufe), "ppk_gunler": ppk.to_dict(orient="records") if not ppk.empty else [], "rejimler": rej}
    Path(cikti_json).write_text(json.dumps(sonuc, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    Path(rapor_yolu).write_text(rapor(sonuc), encoding="utf-8")
    return sonuc


def rapor(s: dict) -> str:
    def y(x):
        return "-" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:+.2%}"

    L = ["# Piyasa düzeyi analiz — PPK, TÜFE ve rejimler (2024-01 → 2026-11)", "",
         "XU100 tepkisi açıklama günü kapanışında (PPK 14:00, TÜFE 10:00). Ana sektör sütunları: sektördeki hisselerin ortalama günlük getirisi − XU100. "
         "Kategori başına örnek az (PPK 28, TÜFE 35 açıklama); bulgular tanımlayıcıdır. Yatırım tavsiyesi değildir.", ""]  # fmt: skip
    for ad, anahtar in (("PPK kararları", "ppk"), ("TÜFE açıklamaları", "tufe")):
        L += [f"## {ad}", "", "| Kategori | n | XU100 gün | XU100 ertesi gün | Finans − XU100 | Holding − XU100 | Sanayi − XU100 | Tüketim − XU100 | Ulaşım − XU100 |",
              "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"]  # fmt: skip
        for r in s[anahtar]:
            L.append(f"| {r['kategori']} | {r['n']} | {y(r['xu100_gun'])} | {y(r['xu100_ertesi'])} | {y(r.get('finans_eksi_xu100'))} | {y(r.get('holding_eksi_xu100'))} | "
                     f"{y(r.get('sanayi_eksi_xu100'))} | {y(r.get('tuketim_eksi_xu100'))} | {y(r.get('ulasim_eksi_xu100'))} |")  # fmt: skip
        L.append("")
    L += ["## Rejimlere göre", ""]
    for r in s["rejimler"]:
        iyi = ", ".join(f"{k} {y(v)}" for k, v in r["en_iyi_sektorler"])
        kotu = ", ".join(f"{k} {y(v)}" for k, v in r["en_kotu_sektorler"])
        st = ", ".join(f"{k} {y(v)} (n={n})" for k, v, n in r.get("en_iyi_stratejiler", []))
        L.append(f"**{r['ad']}** ({r['bas']} → {r['bit']}, {r['gun']} gün): XU100 {y(r['xu100'])}; gece medyan {y(r['gece_medyan_gunluk'])}/gün, gün içi {y(r['gunici_medyan_gunluk'])}/gün. "
                 f"Önde: {iyi}. Geride: {kotu}." + (f" En iyi stratejiler (net): {st}." if st else ""))  # fmt: skip
        L.append("")
    return "\n".join(L)
