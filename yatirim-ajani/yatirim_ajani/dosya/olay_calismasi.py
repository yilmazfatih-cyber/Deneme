"""Havuzlanmış olay çalışması: tüm hisselerin kendi olayları (KAP/haber çizelgeleri) üzerinde, olay türü ve büyüklüğe göre
fiyat tepkisi ve sonrası. Botun dallanma ağacındaki dalların geçmiş istatistiği buradan beslenir.

Tanımlar (gün sonu satırları):
- Tepki günü: olayın kamuya açılma anından SONRAKİ ilk gün sonu satırı (seans sonrası açıklama → ertesi gün).
- tepki_1g: tepki günü getirisi − XU100 aynı gün (anormal).
- ileri_5g / ileri_20g: tepki günü kapanışından sonraki getiri (bot bu kapanışa yakın girer); anormal = − XU100.
- Büyüklük: hane tutarının TL karşılığı / haber öncesi piyasa değeri (USD: haber öncesi kur; EUR: ×1,08 yaklaşık).
Dürüstlük: ajanların bulduğu olaylar seçilmiştir (haber olmuş olaylar), tarihleri arama özetlerinden; düşük güvenli
(guven < 0,4) olaylar ayrıca raporlanır, ana tablodan çıkarılır.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

TZ = "Europe/Istanbul"
BUYUME = {"yatirim", "is_iliskisi", "ihale", "yeni_is"}
MALIYET = 0.003


def _hane(x) -> dict:
    if isinstance(x, dict):
        return x
    if isinstance(x, str) and x.startswith("{"):
        try:
            return json.loads(x)
        except json.JSONDecodeError:
            return {}
    return {}


def olay_tablosu(db_yolu: str | Path) -> pd.DataFrame:
    db = sqlite3.connect(db_yolu)
    try:
        cols = [r[1] for r in db.execute("PRAGMA table_info(olaylar)")]
        sec = ["dosya", "hisse", "kamuya_acilma", "baslangic", "bitis", "tur", "yon", "guven", "baslik"] + (["hane"] if "hane" in cols else [])
        O = pd.read_sql_query(f"SELECT {', '.join(sec)} FROM olaylar WHERE hisse = dosya", db)
        G = pd.read_sql_query("SELECT hisse, zaman, gun, kapanis, getiri_1g, getiri_5g, xu100_getiri_1g, ileri_5g, ileri_20g, xu100_ileri_5g, xu100_ileri_20g, "
                              "piyasa_degeri_mn, dolar_fiyat FROM omurga WHERE gun_sonu = 1", db)  # fmt: skip
    finally:
        db.close()
    if O.empty or G.empty:
        return pd.DataFrame()
    O = O.drop_duplicates(subset=["hisse", "baslangic", "tur", "baslik"])
    O["_an"] = pd.to_datetime(O["kamuya_acilma"], utc=True, errors="coerce").dt.tz_convert(TZ).dt.tz_localize(None)
    G["_z"] = pd.to_datetime(G["zaman"])
    O = O.dropna(subset=["_an"]).sort_values("_an")
    G = G.sort_values("_z")
    sonra = pd.merge_asof(O, G.add_prefix("t_"), left_on="_an", right_on="t__z", left_by="hisse", right_by="t_hisse", direction="forward")
    once = pd.merge_asof(O[["_an", "hisse"]], G.add_prefix("o_"), left_on="_an", right_on="o__z", left_by="hisse", right_by="o_hisse",
                         direction="backward", allow_exact_matches=False)  # fmt: skip
    T = pd.concat([sonra.reset_index(drop=True), once.drop(columns=["_an", "hisse"]).reset_index(drop=True)], axis=1)
    T = T[T["t__z"].notna() & ((T["t__z"] - T["_an"]).dt.days <= 5)]  # tepki günü 5 günden uzaksa veri boşluğu: at
    T["tepki_1g"] = T["t_getiri_1g"] - T["t_xu100_getiri_1g"]
    T["ileri_5g"] = T["t_ileri_5g"]
    T["ileri_20g"] = T["t_ileri_20g"]
    T["ileri_5g_anormal"] = T["t_ileri_5g"] - T["t_xu100_ileri_5g"]
    T["ileri_20g_anormal"] = T["t_ileri_20g"] - T["t_xu100_ileri_20g"]
    T["oncesi_5g"] = T["o_getiri_5g"]
    usdtry = T["o_kapanis"] / T["o_dolar_fiyat"]
    H = T["hane"].map(_hane) if "hane" in T.columns else pd.Series([{}] * len(T), index=T.index)
    tutar = pd.to_numeric(H.map(lambda h: h.get("tutar")), errors="coerce")
    pb = H.map(lambda h: (h.get("para_birimi") or "").upper())
    kur = np.where(pb == "TRY", 1.0, np.where(pb == "USD", usdtry, np.where(pb == "EUR", usdtry * 1.08, np.nan)))
    T["tutar_tl"] = tutar * kur
    T["pd_orani"] = T["tutar_tl"] / (T["o_piyasa_degeri_mn"] * 1e6)
    T["buyukluk"] = pd.cut(T["pd_orani"].abs(), [0, 0.0025, 0.01, 0.03, 0.10, np.inf], labels=["cok_kucuk", "kucuk", "orta", "buyuk", "cok_buyuk"], right=False)
    T["guven"] = pd.to_numeric(T["guven"], errors="coerce")
    return T


def _ozet(g: pd.DataFrame, kol: str) -> dict:
    x = g[kol].dropna()
    n = len(x)
    if n == 0:
        return {"n": 0}
    se = x.std() / np.sqrt(n) if n > 1 else np.nan
    return {"n": int(n), "ort": float(x.mean()), "medyan": float(x.median()), "t": float(x.mean() / se) if se and se > 0 else float("nan"), "pozitif": float((x > 0).mean())}


def ozetle(T: pd.DataFrame, min_guven: float = 0.4) -> dict:
    A = T[T["guven"] >= min_guven]
    out: dict = {"olay": int(len(T)), "guvenli_olay": int(len(A)), "hisse": int(A["hisse"].nunique()), "tur": [], "buyume_buyukluk": [], "yon": []}
    for tur, g in A.groupby("tur"):
        out["tur"].append({"tur": tur, **{f"{k}_{a}": v for k in ("tepki_1g", "ileri_5g_anormal", "ileri_20g_anormal", "oncesi_5g") for a, v in _ozet(g, k).items()}})
    B = A[A["tur"].isin(BUYUME)]
    for b, g in B.groupby("buyukluk", observed=True):
        out["buyume_buyukluk"].append({"buyukluk": str(b), **{f"{k}_{a}": v for k in ("tepki_1g", "ileri_5g", "ileri_5g_anormal", "ileri_20g_anormal") for a, v in _ozet(g, k).items()}})
    for (tur, yon), g in A.groupby(["tur", "yon"]):
        if len(g) >= 3:
            out["yon"].append({"tur": tur, "yon": yon, **{f"{k}_{a}": v for k in ("tepki_1g", "ileri_20g_anormal") for a, v in _ozet(g, k).items()}})
    # bot dalları: net = ham ileri getiri − maliyet (botun gerçekleşen getirisi ham getiridir)
    def dal(maske, kol="ileri_5g"):
        g = A[maske][kol].dropna()
        return {"n": int(len(g)), "ort_net": float(g.mean() - MALIYET) if len(g) else None, "ort_anormal": float(A[maske][kol + "_anormal"].mean()) if len(g) else None,
                "kaynak": "havuzlanmış olay çalışması"}  # fmt: skip
    b = A["tur"].isin(BUYUME)
    pdo = A["pd_orani"].abs()
    out["dallar"] = {
        "olay_buyume_buyuk": dal(b & (pdo >= 0.03)),
        "olay_buyume_orta": dal(b & (pdo >= 0.01) & (pdo < 0.03)),
        "olay_buyume_kucuk": dal(b & (pdo >= 0.0025) & (pdo < 0.01)),
        "satin_alma": dal(A["tur"] == "birlesme_devralma"),
        "bedelsiz_beklenti": dal(A["tur"] == "bedelsiz", "ileri_20g"),
        "temettu_yakalama": dal(A["tur"] == "temettu"),
        "geri_alim": dal(A["tur"] == "geri_alim", "ileri_20g"),
        "pead": dal((A["tur"] == "bilanco") & (A["yon"] == "olumlu"), "ileri_20g"),
        "arz_baskisi": dal(A["tur"].isin(["pay_satisi", "bedelli"])),
    }
    return out


def rapor(o: dict) -> str:
    def y(x):
        return "-" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:+.2%}"

    L = ["# Havuzlanmış olay çalışması — tüm hisselerin kendi olayları", "",
         f"Olay: {o['olay']} (güven ≥ 0,4: {o['guvenli_olay']}, {o['hisse']} hisse). Tepki = tepki günü getirisi − XU100; ileri getiriler tepki günü kapanışından. "
         "Olaylar ajanların bulduğu haber olmuş olaylardır (seçilim yanlılığı); tarihler arama özetlerinden. Yatırım tavsiyesi değildir.", "",
         "## Türe göre", "", "| Tür | n | Tepki 1g (anormal) | t | 5g sonra (anormal) | t | 20g sonra (anormal) | t | 20g pozitif | Öncesi 5g |",
         "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]  # fmt: skip
    for r in sorted(o["tur"], key=lambda r: -r.get("tepki_1g_n", 0)):
        if r.get("tepki_1g_n", 0) < 3:
            continue
        L.append(f"| {r['tur']} | {r['tepki_1g_n']} | {y(r.get('tepki_1g_ort'))} | {r.get('tepki_1g_t', float('nan')):.1f} | {y(r.get('ileri_5g_anormal_ort'))} | "
                 f"{r.get('ileri_5g_anormal_t', float('nan')):.1f} | {y(r.get('ileri_20g_anormal_ort'))} | {r.get('ileri_20g_anormal_t', float('nan')):.1f} | "
                 f"{r.get('ileri_20g_anormal_pozitif', float('nan')):.0%} | {y(r.get('oncesi_5g_ort'))} |")  # fmt: skip
    L += ["", "## Büyüme haberleri (yatırım, sözleşme, ihale, yeni iş): tutarın piyasa değerine oranına göre", "",
          "| Büyüklük | n | Tepki 1g | t | 5g sonra (ham) | 5g (anormal) | 20g (anormal) | t |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]  # fmt: skip
    for r in o["buyume_buyukluk"]:
        L.append(f"| {r['buyukluk']} | {r.get('tepki_1g_n', 0)} | {y(r.get('tepki_1g_ort'))} | {r.get('tepki_1g_t', float('nan')):.1f} | {y(r.get('ileri_5g_ort'))} | "
                 f"{y(r.get('ileri_5g_anormal_ort'))} | {y(r.get('ileri_20g_anormal_ort'))} | {r.get('ileri_20g_anormal_t', float('nan')):.1f} |")  # fmt: skip
    L += ["", "## Yöne göre (tür × olumlu/olumsuz, n ≥ 3)", "", "| Tür | Yön | n | Tepki 1g | 20g (anormal) |", "| --- | --- | --- | --- | --- |"]
    for r in o["yon"]:
        L.append(f"| {r['tur']} | {r['yon']} | {r['tepki_1g_n']} | {y(r.get('tepki_1g_ort'))} | {y(r.get('ileri_20g_anormal_ort'))} |")
    L += ["", "## Bot dalları için geçmiş (net = ham getiri − %0,30)", "", "| Dal | n | Ort. net | Ort. anormal |", "| --- | --- | --- | --- |"]
    for d, v in o["dallar"].items():
        L.append(f"| {d} | {v['n']} | {y(v['ort_net'])} | {y(v['ort_anormal'])} |")
    return "\n".join(L)


def calistir(db_yolu: str | Path, cikti_json: str | Path, rapor_yolu: str | Path, istatistik_json: str | Path | None = None) -> dict:
    T = olay_tablosu(db_yolu)
    o = ozetle(T) if not T.empty else {"olay": 0}
    Path(cikti_json).parent.mkdir(parents=True, exist_ok=True)
    Path(cikti_json).write_text(json.dumps(o, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    T.drop(columns=[c for c in T.columns if c.startswith(("t_", "o_")) or c == "hane"], errors="ignore").to_csv(Path(cikti_json).with_name("olay_calismasi_olaylar.csv"), index=False)
    Path(rapor_yolu).parent.mkdir(parents=True, exist_ok=True)
    Path(rapor_yolu).write_text(rapor(o) if o.get("olay") else "Olay yok", encoding="utf-8")
    # Bot kapısı: strateji_istatistik.json'daki dal istatistiklerini havuzlanmış olay çalışmasıyla güncelle
    if istatistik_json and Path(istatistik_json).exists() and o.get("dallar"):
        ist = json.loads(Path(istatistik_json).read_text(encoding="utf-8"))
        ist.setdefault("dallar", {})
        for d, v in o["dallar"].items():
            if v["n"] >= 5:
                ist["dallar"][d] = v
        Path(istatistik_json).write_text(json.dumps(ist, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    return o
