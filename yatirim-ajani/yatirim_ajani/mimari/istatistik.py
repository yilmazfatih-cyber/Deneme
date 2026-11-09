"""Strateji istatistiği: her strateji ne sıklıkla tetiklenir, maliyet sonrası ne kazandırır, HANGİ DURUMDA çalışır.

İşlem simülasyonu (hisse başına, sıralı, aynı hissede açık işlem varken yeni işlem yok):
- Giriş: tetik çubuğundan sonraki çubuğun açılışı (gece taşıma: tetik çubuğunun kapanışı).
- Çıkış: aynı çubukta stop ve hedef birlikte görülürse önce STOP (temkinli); boşlukta açılış fiyatından; süre dolunca
  ya da gün sonu kuralında son çubuğun kapanışından; planlı çıkışta (temettü/bedelsiz) planlanan çubuğun kapanışından.
- Maliyet: gidiş-dönüş 30 baz puan (yarım makas 10 + kayma 5, iki taraf; Midas BIST komisyonsuz varsayımı).
Durum (rejim) hücreleri giriş anında bilinen değerlerle: piyasa (XU100 MA200 üstü/altı), oynaklık (yıllık 20g: <%30,
%30–50, >%50), saat (günün ilk çubuğu / gün içi / son çubuk), haber (son 24 saatte olay var/yok).
Kanıt ölçütü: gün kümelemeli t (aynı günün işlemleri bağımsız sayılmaz) ve dönemin iki yarısında aynı işaret.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

from .kutuphane import KUTUPHANE, Strateji

MALIYET = 0.003  # temkinli: yarım makas 10 + kayma 5 baz puan, iki taraf
DUSUK_MALIYET = 0.001  # likit hisse, Midas komisyonsuz, 1 fiyat adımı makas
TZ = "Europe/Istanbul"


def _islem(df: dict, i: int, s: Strateji, ek: dict) -> tuple[int, float, float, str] | None:
    n = len(df["kapanis"])
    if s.giris == "kapanis":
        g_i, giris = i, df["kapanis"][i]
        bas = i + 1
    else:
        if i + 1 >= n:
            return None
        g_i, giris = i + 1, df["acilis"][i + 1]
        bas = i + 1
    if not np.isfinite(giris) or giris <= 0:
        return None
    if s.giris_tavani and s.giris != "kapanis" and giris >= df["kapanis"][i] * s.giris_tavani:
        return None  # tavanda kilitli açılış: emir dolmaz
    hedef = giris * (1 + s.hedef) if s.hedef else None
    if s.cikis == "hedef_fiyat" and "hedef_fiyat" in ek and np.isfinite(ek["hedef_fiyat"][i]) and ek["hedef_fiyat"][i] > giris:
        hedef = ek["hedef_fiyat"][i]
    stop = giris * (1 + s.stop) if s.stop else None
    planli = ek.get("planli_cikis", {}).get(i)
    son = min(n - 1, planli if planli is not None else bas + s.sure_cubuk - 1)
    if s.cikis == "sonraki_acilis":
        return (bas, giris, df["acilis"][bas], "sonraki_acilis") if bas < n else None
    for j in range(bas, son + 1):
        if stop is not None and df["dusuk"][j] <= stop:
            return j, giris, min(df["acilis"][j], stop) if j > bas or s.giris == "kapanis" else stop, "stop"
        if hedef is not None and df["yuksek"][j] >= hedef:
            return j, giris, max(df["acilis"][j], hedef) if j > bas or s.giris == "kapanis" else hedef, "hedef"
        if s.cikis in ("gun_sonu", "hedef_fiyat") and df["gun_sonu"][j]:
            return j, giris, df["kapanis"][j], "gun_sonu"
    return son, giris, df["kapanis"][son], "planli" if planli is not None else "sure"


def _hisse_verisi(db: sqlite3.Connection, hisse: str, ham: Path | None) -> tuple[pd.DataFrame, dict]:
    df = pd.read_sql_query(
        "SELECT zaman, gun, saat, gun_sonu, acilis, yuksek, dusuk, kapanis, hacim, getiri_1g, getiri_5g, gece_getiri, gunici_getiri, ma50_uzaklik, "
        "zirve_52h_yakinlik, xu100_ma200_uzaklik, xu100_getiri_1g, oynaklik_20g, olay_sayi_1g, olay_sayi_5g, hacim_z_20, endekse_gore_1g, endekse_gore_20g "
        "FROM omurga WHERE hisse = ? AND cozunurluk = '1h' ORDER BY zaman", db, params=(hisse,))
    df["gun_sonu"] = df["gun_sonu"].astype(bool)
    # saatlik veride günün son çubuğu: gün sonu bayrağı günlük satırlarla karışmasın diye yeniden hesapla
    df["gun_sonu"] = ~df["gun"].duplicated(keep="last")
    df["_z"] = pd.to_datetime(df["zaman"]).dt.tz_localize(TZ).dt.tz_convert("UTC").dt.tz_localize(None)
    ek: dict = {}
    try:
        cols = [r[1] for r in db.execute("PRAGMA table_info(olaylar)")]
        if "dosya" in cols:
            O = pd.read_sql_query("SELECT kamuya_acilma, tur, yon FROM olaylar WHERE dosya = ? AND hisse = ?", db, params=(hisse, hisse))
            O["_an"] = pd.to_datetime(O["kamuya_acilma"], utc=True, errors="coerce").dt.tz_localize(None)
            ek["olaylar"] = O.dropna(subset=["_an"])
    except Exception:  # noqa: BLE001
        pass
    if ham is not None and (ham / f"{hisse}_yahoo_1d.csv").exists() and (ham / f"{hisse}_yahoo_1d.csv").stat().st_size > 0:
        y = pd.read_csv(ham / f"{hisse}_yahoo_1d.csv")
        if "tarih" in y.columns:
            y["gun"] = pd.to_datetime(y["tarih"], utc=True).dt.tz_convert(TZ).dt.tz_localize(None).dt.normalize()
            if "temettu" in y.columns:
                ek["temettu_gunleri"] = list(y.loc[y["temettu"].fillna(0) > 0, "gun"])
            if "bolunme" in y.columns:
                ek["bolunme_gunleri"] = list(y.loc[y["bolunme"].fillna(0) > 0, "gun"])
    return df, ek


def _durum(df: pd.DataFrame, i: int) -> dict:
    x = df["xu100_ma200_uzaklik"].iat[i]
    o = df["oynaklik_20g"].iat[i]
    ilk = i == 0 or df["gun"].iat[i] != df["gun"].iat[i - 1]
    return {
        "piyasa": "bilinmiyor" if pd.isna(x) else ("boga" if x > 0 else "ayi"),
        "oynaklik": "bilinmiyor" if pd.isna(o) else ("dusuk" if o < 0.30 else "orta" if o < 0.50 else "yuksek"),
        "saat": "acilis" if ilk else ("kapanis" if df["gun_sonu"].iat[i] else "gun_ici"),
        "haber": "haberli" if (df["olay_sayi_1g"].iat[i] or 0) > 0 else "habersiz",
    }


def islemleri_uret(db_yolu: str | Path, ham: str | Path | None = None, hisseler: list[str] | None = None, stratejiler: list[Strateji] | None = None) -> pd.DataFrame:
    db = sqlite3.connect(db_yolu)
    try:
        hisseler = hisseler or [r[0] for r in db.execute("SELECT DISTINCT hisse FROM omurga WHERE cozunurluk = '1h' ORDER BY hisse")]
        stratejiler = stratejiler or KUTUPHANE
        kayit = []
        for h in hisseler:
            df, ek_taban = _hisse_verisi(db, h, Path(ham) if ham else None)
            if len(df) < 200:
                continue
            arr = {c: df[c].to_numpy(dtype=float) for c in ("acilis", "yuksek", "dusuk", "kapanis")}
            arr["gun_sonu"] = df["gun_sonu"].to_numpy()
            for s in stratejiler:
                ek = dict(ek_taban)
                tet = np.asarray(s.tetik(df, ek), dtype=bool)
                serbest = -1
                for i in np.flatnonzero(tet):
                    if i <= serbest:
                        continue
                    r = _islem(arr, int(i), s, ek)
                    if r is None:
                        continue
                    j, giris, cikis, sebep = r
                    if not (np.isfinite(cikis) and cikis > 0):
                        continue
                    serbest = j
                    d = _durum(df, int(i))
                    kayit.append({"strateji": s.kod, "hisse": h, "tetik": df["zaman"].iat[i], "gun": df["gun"].iat[i], "giris": giris, "cikis": cikis,
                                  "cubuk": int(j - i), "sebep": sebep, "brut": cikis / giris - 1, "net": cikis / giris - 1 - MALIYET, **d})  # fmt: skip
    finally:
        db.close()
    return pd.DataFrame(kayit)


def _ozet(g: pd.DataFrame, hisse_ay: float) -> dict:
    n = len(g)
    if n == 0:
        return {"n": 0}
    gunluk = g.groupby("gun")["net"].mean()
    t_gun = float(gunluk.mean() / (gunluk.std() / np.sqrt(len(gunluk)))) if len(gunluk) > 2 and gunluk.std() > 0 else float("nan")
    orta = g["gun"].sort_values().iloc[n // 2]
    y1, y2 = g[g["gun"] < orta]["net"].mean(), g[g["gun"] >= orta]["net"].mean()
    return {"n": int(n), "siklik_hisse_ay": round(n / hisse_ay, 3) if hisse_ay else None, "isabet": float((g["net"] > 0).mean()),
            "ort_net": float(g["net"].mean()), "medyan_net": float(g["net"].median()), "ort_brut": float(g["brut"].mean()),
            "t_gun": t_gun, "gun_sayisi": int(len(gunluk)), "yari1": float(y1) if pd.notna(y1) else None, "yari2": float(y2) if pd.notna(y2) else None,
            "tutarli": bool(pd.notna(y1) and pd.notna(y2) and np.sign(y1) == np.sign(y2)), "ort_cubuk": float(g["cubuk"].mean()),
            "ort_net_dusuk_maliyet": float(g["brut"].mean() - DUSUK_MALIYET),
            "t_gun_dusuk_maliyet": float((g.groupby("gun")["brut"].mean() - DUSUK_MALIYET).mean() / (gunluk.std() / np.sqrt(len(gunluk)))) if len(gunluk) > 2 and gunluk.std() > 0 else float("nan")}  # fmt: skip


def istatistik(I: pd.DataFrame, hisse_ay: float, min_n: int = 30) -> dict:
    out: dict = {"maliyet": MALIYET, "hisse_ay": hisse_ay, "strateji": {}, "hucreler": [], "harita": {}}
    if I.empty:
        return out
    for s, g in I.groupby("strateji"):
        out["strateji"][s] = _ozet(g, hisse_ay)
    for boyut in ("piyasa", "oynaklik", "saat", "haber"):
        for (s, deger), g in I.groupby(["strateji", boyut]):
            o = _ozet(g, hisse_ay)
            out["hucreler"].append({"strateji": s, "boyut": boyut, "deger": deger, **o})
    # Piyasa × oynaklık haritası: koşulu sağlayan stratejiler
    for (p, o), g in I.groupby(["piyasa", "oynaklik"]):
        satir = []
        for s, gg in g.groupby("strateji"):
            z = _ozet(gg, hisse_ay)
            if z["n"] >= min_n:
                z["karar"] = "takip" if (z["ort_net"] > 0 and z["t_gun"] >= 2 and z["tutarli"]) else ("zayıf artı" if z["ort_net"] > 0 else "kaçın")
                satir.append({"strateji": s, **z})
        out["harita"][f"{p}|{o}"] = sorted(satir, key=lambda r: -r["ort_net"])
    # bot kapısı için dal istatistikleri (ağaç stratejisi → kütüphane vekili)
    vekil = {"olay_buyume_buyuk": "haber_momentum", "olay_buyume_orta": "haber_momentum", "olay_buyume_kucuk": "haber_momentum", "satin_alma": "haber_momentum",
             "pead": "bilanco_sonrasi", "temettu_yakalama": "temettu_oncesi", "bedelsiz_beklenti": "bedelsiz_oncesi", "geri_alim": "haber_momentum"}  # fmt: skip
    out["dallar"] = {d: {**out["strateji"].get(k, {"n": 0}), "vekil": k} for d, k in vekil.items()}
    return out


def rapor(ist: dict, kayit: dict | None = None) -> str:
    def y(x):
        return "-" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:+.2%}"

    L = ["# Strateji haritası — BIST saatlik stratejiler, hangi durumda çalışır", "",
         f"Evren: {kayit.get('hisse', '?') if kayit else '?'} hisse, saatlik veri {kayit.get('donem', '') if kayit else ''}. Maliyet gidiş-dönüş {ist['maliyet']:.1%}. "
         "Sıklık = hisse başına aylık tetik. t = gün kümelemeli t-istatistiği. Tutarlı = dönemin iki yarısında aynı işaret. "
         "Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.", "",
         "## Genel tablo (ortalama net getiriye göre)", "",
         "| Strateji | Popülerlik | İşlem | Sıklık (hisse/ay) | İsabet | Ort. net (%0,30) | t | Ort. net (%0,10) | t | Başabaş maliyet | 1. yarı | 2. yarı | Tutarlı | Ort. süre (çubuk) |",
         "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]  # fmt: skip
    pop = (kayit or {}).get("populerlik", {})
    for s, z in sorted(ist["strateji"].items(), key=lambda kv: -(kv[1].get("ort_net") or -9)):
        if not z.get("n"):
            continue
        L.append(f"| {s} | {pop.get(s, '-')} | {z['n']} | {z['siklik_hisse_ay']:.2f} | {z['isabet']:.0%} | {y(z['ort_net'])} | {z['t_gun']:.1f} | {y(z['ort_net_dusuk_maliyet'])} | "
                 f"{z['t_gun_dusuk_maliyet']:.1f} | {y(z['ort_brut'])} | {y(z['yari1'])} | {y(z['yari2'])} | {'evet' if z['tutarli'] else 'hayır'} | {z['ort_cubuk']:.1f} |")  # fmt: skip
    L += ["", "## Durum haritası (XU100 rejimi × oynaklık): hangi strateji takip edilir", "",
          "Karar: **takip** = ort. net > 0, t ≥ 2 ve iki yarıda tutarlı; zayıf artı = ort. net > 0 ama kanıt zayıf; kaçın = ort. net ≤ 0. Hücrede en az 30 işlem.", ""]  # fmt: skip
    for hucre, satir in sorted(ist["harita"].items()):
        p, o = hucre.split("|")
        if not satir:
            continue
        takip = [r for r in satir if r["karar"] == "takip"]
        L.append(f"**Piyasa {p}, oynaklık {o}:** " + (", ".join(f"{r['strateji']} ({y(r['ort_net'])}, t={r['t_gun']:.1f}, n={r['n']})" for r in takip) if takip else "takip edilecek strateji yok")
                 + "; zayıf artı: " + (", ".join(r["strateji"] for r in satir if r["karar"] == "zayıf artı") or "-")
                 + "; kaçın: " + (", ".join(r["strateji"] for r in satir if r["karar"] == "kaçın") or "-") + ".")  # fmt: skip
    L += ["", "## Saat ve haber kırılımı (ort. net, n)", "", "| Strateji | Açılış | Gün içi | Kapanış | Haberli | Habersiz |", "| --- | --- | --- | --- | --- | --- |"]
    H = pd.DataFrame(ist["hucreler"])
    if not H.empty:
        for s in sorted(H["strateji"].unique()):
            def hc(b, d):
                r = H[(H["strateji"] == s) & (H["boyut"] == b) & (H["deger"] == d)]
                return "-" if r.empty or not r["n"].iat[0] else f"{y(r['ort_net'].iat[0])} ({int(r['n'].iat[0])})"
            L.append(f"| {s} | {hc('saat', 'acilis')} | {hc('saat', 'gun_ici')} | {hc('saat', 'kapanis')} | {hc('haber', 'haberli')} | {hc('haber', 'habersiz')} |")
    return "\n".join(L)


def calistir(db_yolu: str | Path, ham: str | Path | None, cikti_json: str | Path, rapor_yolu: str | Path | None = None) -> dict:
    I = islemleri_uret(db_yolu, ham)
    db = sqlite3.connect(db_yolu)
    try:
        h = db.execute("SELECT COUNT(DISTINCT hisse), MIN(gun), MAX(gun) FROM omurga WHERE cozunurluk = '1h'").fetchone()
    finally:
        db.close()
    ay = (pd.Timestamp(h[2]) - pd.Timestamp(h[1])).days / 30.44 if h[1] else 0
    ist = istatistik(I, hisse_ay=h[0] * ay)
    kayit = {"hisse": h[0], "donem": f"{h[1]} → {h[2]}", "islem": int(len(I)), "populerlik": {s.kod: s.populerlik for s in KUTUPHANE}}
    ist["kayit"] = kayit
    Path(cikti_json).parent.mkdir(parents=True, exist_ok=True)
    Path(cikti_json).write_text(json.dumps(ist, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    I.to_csv(Path(cikti_json).with_name("strateji_islemleri.csv.gz"), index=False, compression="gzip")
    if rapor_yolu:
        Path(rapor_yolu).parent.mkdir(parents=True, exist_ok=True)
        Path(rapor_yolu).write_text(rapor(ist, kayit), encoding="utf-8")
    return ist
