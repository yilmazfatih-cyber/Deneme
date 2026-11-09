"""Py botu: hane geldiğinde tetiklenir → bağlamı kurar → dallanma ağacını gezer → somut emir (gün, saat, limit, adet).

Geriye dönük işlem yok: emir penceresi max(şimdi, kamuya açılma) anından sonraki ilk uygun penceredir; defter de
pencere başlangıcı geçmişse reddeder. Her karar `bot_kararlari.jsonl`'e yol (dallar) ve gerekçeyle yazılır.
"""

from __future__ import annotations

import json
import math
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd

from ..dosya.kur import BAYRAMLAR
from ..portfoy.defter import Defter, adima_yuvarla, pay_hesapla
from .dallar import Baglam, Eylem, degerlendir, olay_agaci
from .haneler import KapHane
from .okuyucu import zenginlestir

TZ = "Europe/Istanbul"
SABIT_TATIL = {"01-01", "04-23", "05-01", "05-19", "07-15", "08-30", "10-29"}


def islem_gunu_mu(d: date) -> bool:
    return d.weekday() < 5 and d.strftime("%m-%d") not in SABIT_TATIL and d.isoformat() not in BAYRAMLAR


def sonraki_islem_gunu(d: date) -> date:
    d = d + timedelta(days=1)
    while not islem_gunu_mu(d):
        d += timedelta(days=1)
    return d


def islem_gunu_ekle(d: date, n: int) -> date:
    for _ in range(n):
        d = sonraki_islem_gunu(d)
    return d


def pencere_hesapla(tur: str, an: pd.Timestamp) -> tuple[str, str]:
    """Eylem penceresini somut (gün, 'SS:DD-SS:DD') yapar; `an` sonrasındaki ilk uygun pencere."""
    an = an.tz_convert(TZ) if an.tzinfo else an.tz_localize(TZ)
    gun = an.date()
    bugun_islem = islem_gunu_mu(gun)
    dk = an.hour * 60 + an.minute
    if tur == "sonraki_saat":
        if bugun_islem and dk < 17 * 60:
            saat = max(10, an.hour + 1) if dk >= 10 * 60 else 10
            return gun.isoformat(), f"{saat:02d}:00-{saat:02d}:50"
        return sonraki_islem_gunu(gun).isoformat(), "10:00-10:50"
    if tur == "gun_sonu":
        if bugun_islem and dk < 17 * 60:
            return gun.isoformat(), "17:00-17:50"
        return sonraki_islem_gunu(gun).isoformat(), "17:00-17:50"
    # ertesi_acilis
    if bugun_islem and dk < 10 * 60:
        return gun.isoformat(), "10:00-10:15"
    return sonraki_islem_gunu(gun).isoformat(), "10:00-10:15"


# --- bağlam -------------------------------------------------------------------------------------
def _satirlar(db_yolu: str | Path, hisse: str) -> pd.DataFrame:
    if not Path(db_yolu).exists():
        return pd.DataFrame()
    db = sqlite3.connect(db_yolu)
    try:
        R = pd.read_sql_query("SELECT * FROM omurga WHERE hisse = ? ORDER BY zaman", db, params=(hisse,))
    except Exception:  # noqa: BLE001
        return pd.DataFrame()
    finally:
        db.close()
    if R.empty:
        return R
    R["_z"] = pd.to_datetime(R["zaman"]).dt.tz_localize(TZ)
    return R


def _temel(db_yolu: str | Path, hisse: str, an: pd.Timestamp) -> dict:
    db = sqlite3.connect(db_yolu)
    try:
        T = pd.read_sql_query("SELECT * FROM temel_ceyrek WHERE hisse = ?", db, params=(hisse,))
    except Exception:  # noqa: BLE001
        return {}
    finally:
        db.close()
    if T.empty or "aciklanma" not in T.columns:
        return {}
    T["_a"] = pd.to_datetime(T["aciklanma"], utc=True).dt.tz_convert(TZ)
    T = T[T["_a"] <= an].sort_values("_a")
    if T.empty:
        return {}
    s = T.iloc[-1]
    return {"satis_ttm_tl": float(s["satis_ttm"]) * 1e6 if pd.notna(s.get("satis_ttm")) else None,
            "ozkaynak_tl": float(s["ozkaynak_ana"]) * 1e6 if pd.notna(s.get("ozkaynak_ana")) else None, "donem": s.get("donem")}  # fmt: skip


def _satir_sozluk(r: pd.Series | None) -> dict | None:
    if r is None:
        return None
    return {k: (None if (isinstance(v, float) and math.isnan(v)) else v) for k, v in r.drop(labels=["_z"], errors="ignore").to_dict().items()}


def portfoy_ozeti(defter: Defter | None, son_fiyatlar: dict[str, float], varsayilan_nakit: float = 1_000_000) -> dict:
    if defter is None:
        return {"nakit": varsayilan_nakit, "toplam": varsayilan_nakit, "pozisyonlar": {}, "gunluk_getiri": None, "zirveden": None}
    v = defter.veri
    hisse_deger = sum(p["adet"] * son_fiyatlar.get(h, p["maliyet"]) for h, p in v["pozisyonlar"].items())
    toplam = v["nakit"] + hisse_deger
    deg = v.get("degerleme", [])
    gunluk = (deg[-1]["toplam"] / deg[-2]["toplam"] - 1) if len(deg) >= 2 else None
    zirve = max([d["toplam"] for d in deg] + [v["baslangic_nakit"]])
    return {"nakit": v["nakit"], "toplam": toplam, "pozisyonlar": v["pozisyonlar"], "gunluk_getiri": gunluk, "zirveden": toplam / zirve - 1}


def baglam_kur(hane: KapHane, db_yolu: str | Path, simdi: pd.Timestamp, defter: Defter | None = None, istatistik: dict | None = None) -> Baglam:
    an = pd.Timestamp(hane.kamuya_acilma).tz_convert(TZ)
    R = _satirlar(db_yolu, hane.hisse)
    onceki = son = None
    tepki: dict = {"getiri": None, "tavan": False, "hacim_kat": None, "satir": 0}
    if not R.empty:
        once = R[R["_z"] < an]
        simdiye = R[R["_z"] <= simdi]
        onceki = once.iloc[-1] if not once.empty else None
        son = simdiye.iloc[-1] if not simdiye.empty else None
        sonrasi = R[(R["_z"] >= an) & (R["_z"] <= simdi)]
        if onceki is not None and not sonrasi.empty:
            tepki["getiri"] = float(sonrasi["kapanis"].iloc[-1] / onceki["kapanis"] - 1)
            tepki["tavan"] = bool((sonrasi["getiri_1g"] >= 0.095).any())
            tepki["satir"] = int(len(sonrasi))
            gun_satir = R[(R["gun"] == son["gun"]) & (R["_z"] <= son["_z"])]
            oran = son.get("hacim_gunici_oran")
            if oran is not None and not pd.isna(oran):
                tepki["hacim_kat"] = float(oran) / max(len(gun_satir) / 8, 0.125)
    temel = _temel(db_yolu, hane.hisse, an) if Path(db_yolu).exists() else {}
    fiyat = float(onceki["kapanis"]) if onceki is not None else (float(son["kapanis"]) if son is not None else None)
    ref = onceki if onceki is not None else son
    pd_tl = float(ref["piyasa_degeri_mn"]) * 1e6 if ref is not None and pd.notna(ref.get("piyasa_degeri_mn")) else None
    usdtry = float(ref["kapanis"] / ref["dolar_fiyat"]) if ref is not None and pd.notna(ref.get("dolar_fiyat")) and ref.get("dolar_fiyat") else None
    hane2 = zenginlestir(hane, fiyat, pd_tl, usdtry, temel.get("satis_ttm_tl"), temel.get("ozkaynak_tl"))
    son_fiyatlar = {hane.hisse: float(son["kapanis"])} if son is not None else {}
    return Baglam(hane2, _satir_sozluk(onceki), _satir_sozluk(son), tepki, portfoy_ozeti(defter, son_fiyatlar), istatistik or {})


# --- eylem → emir --------------------------------------------------------------------------------
def kapilar(b: Baglam, e: Eylem) -> tuple[Eylem, list[str]]:
    """Ağaç dışı genel kapılar: portföy kayıp sınırları ve istatistik kapısı (yalnız AL'ı düşürür)."""
    notlar = []
    if e.karar != "AL":
        return e, notlar
    p = b.portfoy
    if p.get("gunluk_getiri") is not None and p["gunluk_getiri"] <= -0.02:
        return Eylem("IZLE", e.strateji, "Portföy bugün −%2 altında: yeni alım yok (HAFTA.md)"), notlar
    if p.get("zirveden") is not None and p["zirveden"] <= -0.15:
        return Eylem("IZLE", e.strateji, "Portföy zirveden −%15: yeni alım yok"), notlar
    ist = b.istatistik.get(e.strateji)
    if ist and ist.get("n", 0) >= 20 and ist.get("ort_net", 0) < 0:
        return Eylem("IZLE", e.strateji, f"İstatistik kapısı: bu dal geçmişte maliyet sonrası eksi (n={ist['n']}, ort {ist['ort_net']:+.2%})"), notlar
    if not ist:
        notlar.append(f"'{e.strateji}' için geçmiş istatistik yok; kural öncül (literatür/uzman) olarak uygulandı")
    return e, notlar


def emir_uret(b: Baglam, e: Eylem, simdi: pd.Timestamp) -> dict | None:
    if e.karar not in ("AL", "SAT") or b.son is None:
        return None
    an = max(simdi, pd.Timestamp(b.hane.kamuya_acilma).tz_convert(TZ))
    gun, pencere = pencere_hesapla(e.pencere, an)
    ref = float(b.son["kapanis"])
    if e.karar == "AL":
        onceki = float(b.onceki["kapanis"]) if b.onceki else ref
        limit = adima_yuvarla(min(ref * (1 + e.limit_tolerans), onceki * (1 + e.kovalama_tavani)), "asagi")
        pay = pay_hesapla(b.f("atr_20g_oran") or 0.03) * e.boyut
        tutar = min(pay * b.portfoy["toplam"], b.portfoy["nakit"] * 0.98)
        adet = int(tutar // limit)
        if adet <= 0:
            return None
        bitis = islem_gunu_ekle(date.fromisoformat(gun), e.ufuk_gun)
        return {"hisse": b.hane.hisse, "yon": "AL", "adet": adet, "limit": limit, "gun": gun, "pencere": pencere, "tutar": round(adet * limit, 2),
                "pay": round(adet * limit / b.portfoy["toplam"], 4), "zarar_kes": adima_yuvarla(limit * (1 + e.zarar_kes), "asagi"),
                "kar_al": adima_yuvarla(limit * (1 + e.kar_al), "yukari") if e.kar_al else None, "en_gec_cikis": bitis.isoformat()}  # fmt: skip
    adet = int(math.floor(b.elde * e.sat_orani)) or b.elde
    if adet <= 0:
        return None
    limit = adima_yuvarla(ref * (1 - e.limit_tolerans), "yukari")
    return {"hisse": b.hane.hisse, "yon": "SAT", "adet": adet, "limit": limit, "gun": gun, "pencere": pencere, "tutar": round(adet * limit, 2)}


def olay_isle(hane: KapHane, db_yolu: str | Path, simdi: datetime | pd.Timestamp | None = None, defter_yolu: str | Path | None = None,
              yaz: bool = False, kayit: str | Path | None = None, istatistik_yolu: str | Path | None = None) -> dict:
    simdi = pd.Timestamp(simdi or datetime.now())
    simdi = simdi.tz_localize(TZ) if simdi.tzinfo is None else simdi.tz_convert(TZ)
    defter = Defter.ac(defter_yolu) if defter_yolu and Path(defter_yolu).exists() else None
    ist = json.loads(Path(istatistik_yolu).read_text(encoding="utf-8")).get("dallar", {}) if istatistik_yolu and Path(istatistik_yolu).exists() else {}
    b = baglam_kur(hane, db_yolu, simdi, defter, ist)
    yol, eylem = degerlendir(olay_agaci(), b)
    eylem, notlar = kapilar(b, eylem)
    emir = emir_uret(b, eylem, simdi)
    yazildi = None
    if yaz and emir and defter is not None:
        try:
            neden = f"[bot:{eylem.strateji}] {eylem.gerekce}" + (f" · stop {emir.get('zarar_kes')} hedef {emir.get('kar_al')} en geç {emir.get('en_gec_cikis')}" if emir["yon"] == "AL" else "")
            yazildi = defter.emir_ver(emir["hisse"], emir["yon"], emir["adet"], emir["limit"], emir["gun"], emir["pencere"], neden, simdi.to_pydatetime())
        except ValueError as hata:
            notlar.append(f"Defter emri reddetti: {hata}")
    karar = {
        "zaman": simdi.isoformat(timespec="minutes"), "hane": json.loads(b.hane.model_dump_json()), "yol": yol,
        "eylem": {"karar": eylem.karar, "strateji": eylem.strateji, "gerekce": eylem.gerekce, "pencere": eylem.pencere},
        "baglam": {"onceki_fiyat": b.onceki.get("kapanis") if b.onceki else None, "son_fiyat": b.son.get("kapanis") if b.son else None,
                   "son_satir": b.son.get("zaman") if b.son else None, "tepki": b.tepki, "xu100_ma200_uzaklik": b.f("xu100_ma200_uzaklik"),
                   "ma50_uzaklik": b.f("ma50_uzaklik"), "atr_20g_oran": b.f("atr_20g_oran"), "portfoy_toplam": b.portfoy.get("toplam"), "elde": b.elde},
        "emir": emir, "deftere_yazildi": bool(yazildi), "defter_emir_id": yazildi["id"] if yazildi else None, "notlar": notlar + b.hane.notlar,
    }  # fmt: skip
    if kayit:
        Path(kayit).parent.mkdir(parents=True, exist_ok=True)
        with open(kayit, "a", encoding="utf-8") as f:
            f.write(json.dumps(karar, ensure_ascii=False, default=str) + "\n")
    return karar


def karar_metni(k: dict) -> str:
    h, e, m, bg = k["hane"], k["eylem"], k["emir"], k["baglam"]
    tutar = f"{h['tutar']:,.0f} {h['para_birimi']}" if h.get("tutar") else "-"
    L = [f"BOT KARARI — {h['hisse']} · {h['tur']} · açıklama {str(h['kamuya_acilma'])[:16]} · şimdi {k['zaman'][:16]}",
         f"Haneler: tutar {tutar}" + (f" ≈ {h['tutar_tl'] / 1e6:,.0f} mn TL" if h.get("tutar_tl") else "")
         + (f" · PD'ye oran {h['pd_orani']:.2%}" if h.get("pd_orani") is not None else "") + (f" · büyüklük {h['buyukluk']}" if h.get("buyukluk") else "")
         + (f" · oran {h['oran']:.0%}" if h.get("oran") is not None else "") + (f" · pay başı {h['pay_basi_tl']} TL" if h.get("pay_basi_tl") else "")
         + f" · yön {h.get('yon') or 'türden'} · güven {h['guven']:.1f} ({h['okuyan']})",
         f"Bağlam: haber öncesi {bg['onceki_fiyat']} → son {bg['son_fiyat']} ({bg['son_satir']}); tepki {bg['tepki']}; XU100/MA200 {bg['xu100_ma200_uzaklik']}; "
         f"hisse/MA50 {bg['ma50_uzaklik']}; ATR {bg['atr_20g_oran']}",
         "Yol: " + " → ".join(k["yol"]),
         f"Karar: {e['karar']} [{e['strateji']}] — {e['gerekce']}"]  # fmt: skip
    if m:
        L.append(f"EMİR: {m['gun']} {m['pencere']} · {m['yon']} {m['hisse']} {m['adet']} adet · limit {m['limit']:.2f} TL · tutar {m['tutar']:,.0f} TL"
                 + (f" · pay {m['pay']:.1%} · stop {m['zarar_kes']:.2f} · hedef {m['kar_al']:.2f} · en geç çıkış {m['en_gec_cikis']}" if m["yon"] == "AL" and m.get("kar_al")
                    else (f" · pay {m['pay']:.1%} · stop {m['zarar_kes']:.2f} · en geç çıkış {m['en_gec_cikis']}" if m["yon"] == "AL" else "")))  # fmt: skip
        L.append("Deftere yazıldı (#%s)" % k["defter_emir_id"] if k["deftere_yazildi"] else "Deftere yazılmadı (deneme modu; --yaz ile yazılır)")
    for n in k["notlar"]:
        L.append(f"Not: {n}")
    return "\n".join(L)
