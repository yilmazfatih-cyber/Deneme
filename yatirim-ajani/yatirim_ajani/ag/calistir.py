"""Ağ katmanının tamamını çalıştırır: paneller → ağaç → akış → yatırımcı tipleri → kural testleri → JSON çıktıları + Türkçe rapor.

Girdi: `veri/ag/*.csv.gz` (ag-veri-cek), `dosya_kaynak/ag/*.json` (araştırma ajanları). Çıktı: `veri/ag/analiz/*.json`, `raporlar/ag-analiz-YYYYMMDD.md`.
Her adım bağımsızdır; biri hata verirse rapora yazılır, diğerleri sürer.
"""

from __future__ import annotations

import json
import time
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from . import agac, akis, strateji, yatirimci
from .panel import panel_yukle, saat_getirileri, saatlik_yukle, seriler_yukle

BILESIK = {"zirveye_yakinlik": 1, "gunici_20g": 1, "devir_hizi_20g": -1, "max_20g": -1, "oynaklik_20g": -1, "hacim_soku": -1, "kazanc_verimi": 1}
TASFIYE = ("Pardus", "Hedef", "Bulls", "Pusula", "Atlas", "A1")  # SPK 17.09.2026 kararı (Tera kullanıcı kuralı gereği kapsam dışı)


def _temiz(o):
    """JSON'a yazılabilir hale getir (numpy tipleri, NaN → None, Series/DataFrame atılır)."""
    if isinstance(o, dict):
        return {str(k): _temiz(v) for k, v in o.items() if not isinstance(v, (pd.Series, pd.DataFrame))}
    if isinstance(o, (list, tuple)):
        return [_temiz(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return None if (np.isnan(o) or np.isinf(o)) else float(o)
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, (pd.Timestamp,)):
        return o.strftime("%Y-%m-%d")
    return o


def _yaz(yol: Path, veri) -> None:
    yol.parent.mkdir(parents=True, exist_ok=True)
    yol.write_text(json.dumps(_temiz(veri), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def en_guclu_baglar(P, adet: int = 60, min_gun: int = 400) -> list[dict]:
    """İki ortak faktör ayıklandıktan sonra en yüksek korelasyonlu hisse çiftleri (grup/ortaklık ve gerçek sektör bağları)."""
    R = P.R.loc[:, P.R.notna().sum() >= min_gun]
    E, _ = agac.cok_faktor_artik(R, agac.faktorler(P))
    C = E.corr(min_periods=200)
    ust = np.triu_indices(len(C), 1)
    v = C.to_numpy()[ust]
    sira = np.argsort(-np.nan_to_num(v, nan=-9))[:adet]
    ev = P.evren
    return [{"a": C.index[ust[0][i]], "b": C.index[ust[1][i]], "kor": float(v[i]), "a_ad": str(ev.at[C.index[ust[0][i]], "ad"])[:40], "b_ad": str(ev.at[C.index[ust[1][i]], "ad"])[:40],
             "ayni_sektor": bool(ev.at[C.index[ust[0][i]], "sektor"] == ev.at[C.index[ust[1][i]], "sektor"])} for i in sira]  # fmt: skip


def calistir(klasor: str | Path = "veri/ag", cikti: str | Path | None = None, rapor_yolu: str | Path | None = None, arastirma: str | Path = "dosya_kaynak/ag") -> dict:
    klasor = Path(klasor)
    cikti = Path(cikti) if cikti else klasor / "analiz"
    rapor_yolu = Path(rapor_yolu) if rapor_yolu else Path("raporlar") / f"ag-analiz-{date.today():%Y%m%d}.md"
    arastirma = Path(arastirma)
    S: dict = {"hata": {}, "sure": {}}

    def adim(ad: str, islev):
        t = time.time()
        try:
            S[ad] = islev()
        except Exception as e:  # noqa: BLE001
            S["hata"][ad] = f"{type(e).__name__}: {str(e)[:200]}"
            S[ad] = {}
        S["sure"][ad] = round(time.time() - t, 1)
        print(f"[{ad}] {S['sure'][ad]} sn" + (f" HATA {S['hata'][ad]}" if ad in S["hata"] else ""), flush=True)
        return S[ad]

    P = panel_yukle(klasor)
    ev = P.evren
    S["veri"] = {"donem": [str(P.R.index[0].date()), str(P.R.index[-1].date())], "gun": int(len(P.R)), "hisse": int(P.R.shape[1]),
                 "grup": ev["grup"].value_counts().to_dict(), "sektor": ev["sektor"].value_counts().to_dict(),
                 "gece_gunici": {g: {"gece": float(P.GECE[idx].mean().mean()), "gunici": float(P.GI[idx].mean().mean()), "toplam": float(P.R[idx].mean().mean()), "hisse": int(len(idx))}
                                 for g, idx in ev.groupby("grup").groups.items()}}  # fmt: skip

    # --- ağaç
    A = adim("agac", lambda: agac.korelasyon_agi(P))
    adim("baglar", lambda: en_guclu_baglar(P))
    adim("zaman", lambda: agac.zaman_kirilimi(P))
    adim("oncu_grup", lambda: agac.oncu_takipci_grup(P, "grup"))
    adim("oncu_sektor", lambda: agac.oncu_takipci_grup(P, "sektor", artik=True))

    def _gecikme():
        D = agac.fiyat_gecikmesi(P)
        F = agac.faktorler(P)
        return {"grup": D.groupby("grup")[["beta", "gecikmeli_beta_toplam", "l1_beta", "gecikme_olcusu", "r2_esanli"]].mean().round(4).to_dict(orient="index"),
                "en_gecikmeli": D[D["hacim_60g"] > 2e7].sort_values("gecikmeli_beta_toplam", ascending=False).head(15).index.tolist(),
                "kucuk_faktor": {"gunluk_std": float(F["kucuk"].std()), "oz_iliski": float(F["kucuk"].autocorr(1)), "piyasa_once": float(F["piyasa"].shift(1).corr(F["kucuk"])),
                                 "kucuk_once": float(F["kucuk"].shift(1).corr(F["piyasa"])), "xu100_oz_iliski": float(P.xu100.autocorr(1))}}  # fmt: skip

    adim("gecikme", _gecikme)

    # --- saat ve akış
    H = SG = None
    if (klasor / "hisse_saatlik.csv.gz").exists():
        H = saatlik_yukle(klasor)
        SG = saat_getirileri(H, P)
        adim("saat_profili", lambda: akis.saat_profili(SG, P, "grup"))
        adim("saat_takvim", lambda: akis.saat_takvim(SG, P))
        adim("oncu_saatlik", lambda: agac.oncu_takipci_saatlik(SG, P, "grup"))
        adim("isaretli_akis", lambda: akis.akis_testi(akis.isaretli_akis(H, P), P))
    adim("ilgi_sektor", lambda: akis.islem_ilgisi(P, "sektor"))
    adim("ilgi_grup", lambda: akis.islem_ilgisi(P, "grup"))
    adim("rotasyon", lambda: akis.sektor_rotasyonu(P))
    if (klasor / "seriler_gunluk.csv.gz").exists():
        Sg = seriler_yukle(klasor)
        adim("mevsimsellik", lambda: akis.mevsimsellik(Sg))
        adim("varlik", lambda: akis.varlik_rotasyonu(Sg))
    SS = pd.read_csv(klasor / "seriler_saatlik.csv.gz") if (klasor / "seriler_saatlik.csv.gz").exists() else None
    if SS is not None:
        adim("kuresel", lambda: akis.kuresel_zincir(SS, P))

    # --- yatırımcı tipleri
    X = {}
    if (klasor / "mali_panel.csv.gz").exists():
        T = yatirimci.temel_panel(pd.read_csv(klasor / "mali_panel.csv.gz"), P)
        X = yatirimci.ozellikler(P, T)
    else:
        X = yatirimci.ozellikler(P, None)
    adim("tavan", lambda: yatirimci.tavan_dizileri(P))
    adim("taban_alimi", lambda: yatirimci.taban_alimi(P))
    adim("halka_arz", lambda: yatirimci.halka_arzlar(P))
    adim("faktor", lambda: yatirimci.faktor_primleri(P, X, 20))
    adim("kisa_vade", lambda: yatirimci.kisa_vade(P, X))
    oz = [k for k in ("buyukluk", "halka_aciklik", "defter_piyasa", "kazanc_verimi", "momentum_120_20", "getiri_20g", "oynaklik_20g", "max_20g", "devir_hizi_20g", "zirveye_yakinlik") if k in X]
    adim("fm", lambda: {g: yatirimci.fama_macbeth(P, X, oz, 20, g) for g in ("bist100", "bist100_disi")})
    fb = []
    if (arastirma / "fon_bildirimleri.json").exists():
        fb = json.loads((arastirma / "fon_bildirimleri.json").read_text(encoding="utf-8")).get("kayitlar", [])
    if fb:
        adim("fon", lambda: yatirimci.fon_olaylari(P, fb, X, 0.35))
        th = sorted({x["hisse"] for x in fb if any(a in str(x.get("fon_sirketi")) for a in TASFIYE) and x["hisse"] in P.R.columns})
        donemler = [("2024", "2024-01-02", "2024-12-31"), ("2025", "2025-01-02", "2025-12-31"), ("2026 Oca–Tem", "2026-01-02", "2026-07-31"), ("Ağu 2026", "2026-08-03", "2026-08-31"),
                    ("1–16 Eyl 2026", "2026-09-01", "2026-09-16"), ("17 Eyl–15 Eki 2026", "2026-09-17", "2026-10-15"), ("16 Eki–bugün", "2026-10-16", str(P.R.index[-1].date()))]  # fmt: skip
        adim("tasfiye", lambda: {"hisseler": th, "donem": {ad: yatirimci.olay_penceresi(P, th, b, e) for ad, b, e in donemler}})

    # --- kural testleri
    def _strateji():
        out: dict = {"deneme_sayisi": 60}
        s1 = strateji.gece_tasima(P, None, "bist100", 0.2, 5e7)
        s1g = strateji.gece_tasima(P, X["gece_20g"], "bist100", 0.2, 5e7)
        s1k = strateji.gece_tasima(P, X["gece_20g"], "bist100_disi", 0.2, 2e7)
        for ad, o in (("gece_bist100", s1), ("gece_bist100_gece20", s1g), ("gece_kucuk_gece20", s1k)):
            seri = o["seri"]
            out[ad] = {**{k: v for k, v in o.items() if k != "seri"}, "yil": {str(y): float(seri[seri.index.year == y].mean()) for y in sorted(set(seri.index.year))},
                       "basabas_maliyet": float(seri.mean()), "dsr_10bp": strateji.deflated_sharpe(seri - 0.001, 60), "dsr_brut": strateji.deflated_sharpe(seri, 60)}  # fmt: skip
        out["lider_takipci"] = {g: strateji.lider_takipci(P, 0.01, g, 2e7) for g in ("bist100", "bist100_disi")}
        dis = P.R.columns[(ev["bist100"].reindex(P.R.columns) != 1).to_numpy()]
        agirlik = {k: v for k, v in BILESIK.items() if k in X}
        puan = strateji.bilesik_puan({k: v[dis] for k, v in X.items()}, agirlik).reindex(columns=P.R.columns)
        o = strateji.donemsel_portfoy(P, puan, "bist100_disi", 0.2, 20, 5e6, (0.003, 0.006))
        g, k = o["seri"] - o["ort_devir"] * 0.003, o["kiyas_seri"]
        out["bilesik"] = {**{a: b for a, b in o.items() if a not in ("seri", "kiyas_seri")}, "agirlik": agirlik, "dsr_fazla": strateji.deflated_sharpe(g - k, 60), "dsr_mutlak": strateji.deflated_sharpe(g, 60)}
        out["bilesik"]["ikinci_yari"] = {a: b for a, b in strateji.donemsel_portfoy(P, puan, "bist100_disi", 0.2, 20, 5e6, (0.003, 0.006), "2025-09-01", None).items() if a not in ("seri", "kiyas_seri")}
        kf = (1 + agac.faktorler(P)["kucuk"].fillna(0)).cumprod()
        acik = pd.Series({t: kf.loc[:t].iloc[-2] / kf.loc[:t].iloc[-22] - 1 > 0 for t in g.index})
        out["bilesik"]["rejimli"] = {**strateji.ozet(g.where(acik, 0.0), None, yil_donem=250 / 20), "acik_donem": int(acik.sum()), "donem_sayisi": int(len(g))}
        out["bilesik"]["son_secim"] = puan.iloc[-1].where((P.HTL.tail(20).mean() > 5e6) & (P.R.iloc[-1].abs() < yatirimci.TAVAN)).dropna().sort_values().tail(15).index.tolist()[::-1]
        out["bilesik"]["rejim_acik_mi"] = bool(kf.iloc[-1] / kf.iloc[-21] - 1 > 0)
        b100 = P.R.columns[(ev["bist100"].reindex(P.R.columns) == 1).to_numpy()]
        if "kazanc_verimi" in X:
            pu = strateji.bilesik_puan({k: v[b100] for k, v in X.items()}, {"kazanc_verimi": 1}).reindex(columns=P.R.columns)
            out["bist100_kazanc"] = {a: b for a, b in strateji.donemsel_portfoy(P, pu, "bist100", 0.2, 20, 2e7, (0.002, 0.004)).items() if a not in ("seri", "kiyas_seri")}
        hs = X["hacim_soku"]
        out["hacim_patlamasi"] = {g2: strateji.olay_kurali(P, (hs >= 3) & (P.R.abs() < yatirimci.TAVAN), (1, 5, 20), g2) for g2 in ("bist100", "bist100_disi")}
        if SS is not None:
            ilk = pd.Timestamp(pd.to_datetime(SS["zaman"]).min()).normalize()
            K = akis.kuresel_degisimler(SS, P.R.index[P.R.index >= ilk])
            if "ES=F" in K:
                out["kotu_gece"] = {g2: {a: b for a, b in strateji.gunici(P, K["ES=F"]["gece"] <= -0.005, g2, 2e7).items()} for g2 in ("bist100", "bist100_disi")}
                out["iyi_gece"] = {g2: {a: b for a, b in strateji.gunici(P, K["ES=F"]["gece"] >= 0.005, g2, 2e7).items()} for g2 in ("bist100", "bist100_disi")}
        return out

    adim("strateji", _strateji)

    # --- çıktı dosyaları
    agac_json = {k: A.get(k) for k in ("donem", "gun", "hisse", "ort_kor_ham", "ort_kor_piyasa_artik", "ort_kor_artik", "ort_kor_ayni_sektor_artik", "ort_kor_farkli_sektor_artik", "kok",
                                       "kenar_ayni_sektor_orani", "rastgele_ayni_sektor_orani", "en_merkezi", "en_bagli", "dallar", "kumeler", "kume_safligi", "sektor_butunlugu", "dugumler",
                                       "kenarlar", "tema_agaci")} if A else {}  # fmt: skip
    _yaz(cikti / "agac.json", {**agac_json, "en_guclu_baglar": S.get("baglar")})
    _yaz(cikti / "zaman.json", S.get("zaman"))
    _yaz(cikti / "oncu.json", {k: S.get(k) for k in ("oncu_grup", "oncu_sektor", "gecikme", "oncu_saatlik")})
    _yaz(cikti / "akis.json", {k: S.get(k) for k in ("saat_profili", "saat_takvim", "isaretli_akis", "ilgi_sektor", "ilgi_grup", "rotasyon", "mevsimsellik", "varlik", "kuresel")})
    _yaz(cikti / "yatirimci.json", {k: S.get(k) for k in ("tavan", "taban_alimi", "halka_arz", "faktor", "kisa_vade", "fm", "fon", "tasfiye")})
    _yaz(cikti / "strateji.json", S.get("strateji"))
    _yaz(cikti / "ozet.json", {"veri": S["veri"], "hata": S["hata"], "sure": S["sure"], "zaman": date.today().isoformat()})
    from .rapor import rapor_yaz

    metin = rapor_yaz(S, arastirma)
    rapor_yolu.parent.mkdir(parents=True, exist_ok=True)
    rapor_yolu.write_text(metin, encoding="utf-8")
    print(f"rapor → {rapor_yolu} ({len(metin)} karakter); hata: {S['hata'] or 'yok'}")
    return S
