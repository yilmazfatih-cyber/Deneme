"""Hisse dosyası ham veri çekicileri. Dış ağ gerektirir (GitHub Actions'ta çalışır).

Kaynaklar (ücretsiz, kayıt gerektirmez):
- İş Yatırım `HisseTekil`: günlük kapanış + F/K, PD/DD, FD/FAVÖK, piyasa değeri (TL ve USD), halka açıklık,
  dolar bazlı fiyat. Tarihsel oranlar o günkü bilinen mali tabloyla hesaplanır; yine de "açıklanma tarihi"
  disiplini için çeyreklik tablo ayrıca çekilir.
- İş Yatırım `MaliTablo`: çeyreklik mali tablo kalemleri (UFRS / XI_29), 4 dönem bir çağrıda.
- KAP: bildirim listesi (deneme; site JS tabanlı, API kapalıysa boş döner ve bu raporlanır).
- Yahoo: günlük çubuklar 2024-01-01'den itibaren (saatlik veri yalnız son 730 gün), USDTRY=X, XU100.IS.

Her çekici ham JSON/CSV'yi `veri/dosya/ham/` altına olduğu gibi yazar; yorumlama `kur.py`'de yapılır.
"""

from __future__ import annotations

import json
import time
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pandas as pd
import requests

ISY = "https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx"
KAP = "https://www.kap.org.tr"
BASLIK = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) yatirim-ajani/0.1", "Accept": "application/json, text/plain, */*"}


def _get(url: str, params: dict | None = None, deneme: int = 3, bekle: float = 1.5) -> requests.Response:
    son = None
    for i in range(deneme):
        try:
            r = requests.get(url, params=params, headers=BASLIK, timeout=40)
            if r.status_code == 200:
                return r
            son = RuntimeError(f"HTTP {r.status_code}: {url}")
        except requests.RequestException as e:  # noqa: PERF203
            son = e
        time.sleep(bekle * (i + 1))
    raise RuntimeError(f"İstek başarısız: {url} ({son})")


# --- İş Yatırım -----------------------------------------------------------------------------
def isy_gunluk(hisse: str, bas: date, bit: date) -> pd.DataFrame:
    """Günlük fiyat + değerleme oranları. Sütun adları kaynaktan olduğu gibi gelir; `kur.py` eşler."""
    parcalar = []
    # Uç nokta uzun aralıkta kesebiliyor; yıllık dilimle
    yil = bas.year
    while date(yil, 1, 1) <= bit:
        d_bas = max(bas, date(yil, 1, 1))
        d_bit = min(bit, date(yil, 12, 31))
        r = _get(f"{ISY}/HisseTekil", {"hisse": hisse, "startdate": d_bas.strftime("%d-%m-%Y"), "enddate": d_bit.strftime("%d-%m-%Y")})
        veri = r.json().get("value", [])
        if veri:
            parcalar.append(pd.DataFrame(veri))
        yil += 1
        time.sleep(0.4)
    if not parcalar:
        return pd.DataFrame()
    df = pd.concat(parcalar, ignore_index=True)
    if "HGDG_TARIH" in df.columns:
        df["tarih"] = pd.to_datetime(df["HGDG_TARIH"], dayfirst=True, errors="coerce")
        df = df.dropna(subset=["tarih"]).drop_duplicates("tarih").sort_values("tarih")
    return df


def isy_mali_tablo(hisse: str, donemler: list[tuple[int, int]], grup: str = "XI_29") -> pd.DataFrame:
    """Çeyreklik mali tablo. `donemler`: [(yil, ay)], ay ∈ {3,6,9,12}; 4'erli çağrılır.
    Döner: satır = kalem, sütunlar = itemCode, itemDescTr, itemDescEng ve her dönem için 'YYYY/M'."""
    out: pd.DataFrame | None = None
    for i in range(0, len(donemler), 4):
        grup4 = donemler[i : i + 4]
        p: dict[str, Any] = {"companyCode": hisse, "exchange": "TRY", "financialGroup": grup}
        for k, (y, m) in enumerate(grup4, start=1):
            p[f"year{k}"] = y
            p[f"period{k}"] = m
        for k in range(len(grup4) + 1, 5):  # eksik dönemleri son dönemle doldur (uç nokta 4 ister)
            p[f"year{k}"], p[f"period{k}"] = grup4[-1]
        r = _get(f"{ISY}/MaliTablo", p)
        veri = r.json().get("value", [])
        if not veri:
            continue
        df = pd.DataFrame(veri)
        kolon = {f"value{k}": f"{y}/{m}" for k, (y, m) in enumerate(grup4, start=1)}
        df = df.rename(columns=kolon)[["itemCode", "itemDescTr", "itemDescEng", *kolon.values()]]
        out = df if out is None else out.merge(df, on=["itemCode", "itemDescTr", "itemDescEng"], how="outer")
        time.sleep(0.4)
    if out is None:
        return pd.DataFrame()
    if all(c in ["itemCode", "itemDescTr", "itemDescEng"] or out[c].isna().all() for c in out.columns if c.startswith("20")):
        # XI_29 boşsa UFRS dene (bankalar / bazı holdingler)
        if grup == "XI_29":
            return isy_mali_tablo(hisse, donemler, grup="UFRS")
    return out


def endeks_uyeleri(endeks: str = "XU100") -> dict:
    """Endeks bileşenleri; sırayla İş Yatırım uç noktaları, TradingView tarayıcı API'si, Vikipedi tablosu denenir.
    Döner: {"endeks", "kodlar", "kaynak", "denemeler"}. Hiçbiri çalışmazsa kodlar boş."""
    denemeler = []
    # a) İş Yatırım (uç nokta adları tahmini; biri çalışırsa yeter)
    for url, p in ((f"{ISY}/EndeksHisseleri", {"endeks": endeks}), (f"{ISY}/EndeksHisse", {"endeks": endeks}), (f"{ISY}/Endeks", {"endeks": endeks})):
        try:
            r = _get(url, p, deneme=1)
            veri = r.json().get("value", [])
            kodlar = sorted({str(v.get("HISSE_KODU") or v.get("hisse") or v.get("KOD") or v.get("Kod") or "").strip() for v in veri} - {""})
            denemeler.append({"kaynak": url, "sonuc": len(kodlar)})
            if len(kodlar) >= 25:
                return {"endeks": endeks, "kodlar": kodlar, "kaynak": url, "denemeler": denemeler}
        except Exception as e:  # noqa: BLE001
            denemeler.append({"kaynak": url, "hata": str(e)[:120]})
    # b) TradingView tarayıcı
    try:
        govde = {"filter": [{"left": "index", "operation": "equal", "right": f"BIST:{endeks}"}], "options": {"lang": "tr"},
                 "symbols": {"query": {"types": []}, "tickers": []}, "columns": ["name", "description", "close", "market_cap_basic"], "sort": {"sortBy": "market_cap_basic", "sortOrder": "desc"}, "range": [0, 200]}  # fmt: skip
        r = requests.post("https://scanner.tradingview.com/turkey/scan", json=govde, headers=BASLIK, timeout=30)
        if r.status_code == 200:
            satirlar = [d["d"] for d in r.json().get("data", []) if d.get("d")]
            kodlar = sorted({str(x[0]).strip() for x in satirlar if "TERA" not in str(x[1]).upper()} - {""})
            denemeler.append({"kaynak": "tradingview-scanner", "sonuc": len(kodlar)})
            if len(kodlar) >= 25:
                return {"endeks": endeks, "kodlar": kodlar, "kaynak": "tradingview-scanner", "denemeler": denemeler}
        else:
            denemeler.append({"kaynak": "tradingview-scanner", "hata": f"HTTP {r.status_code}"})
    except Exception as e:  # noqa: BLE001
        denemeler.append({"kaynak": "tradingview-scanner", "hata": str(e)[:120]})
    # c) Vikipedi (TR) tablosu — biraz eski olabilir
    try:
        r = _get(f"https://tr.wikipedia.org/wiki/BIST_{endeks[2:]}" if endeks.startswith("XU") else f"https://tr.wikipedia.org/wiki/{endeks}", deneme=1)
        import io

        tablolar = pd.read_html(io.StringIO(r.text))
        kodlar: list[str] = []
        for t in tablolar:
            for c in t.columns:
                if str(c).lower().startswith(("kod", "sembol", "hisse")):
                    kodlar = sorted({str(v).strip().upper() for v in t[c].dropna() if 3 <= len(str(v).strip()) <= 6 and str(v).strip().isalpha()})
                    break
            if len(kodlar) >= 25:
                break
        denemeler.append({"kaynak": "wikipedia", "sonuc": len(kodlar)})
        if len(kodlar) >= 25:
            return {"endeks": endeks, "kodlar": kodlar, "kaynak": "wikipedia", "denemeler": denemeler}
    except Exception as e:  # noqa: BLE001
        denemeler.append({"kaynak": "wikipedia", "hata": str(e)[:120]})
    return {"endeks": endeks, "kodlar": [], "kaynak": None, "denemeler": denemeler}


# --- KAP -------------------------------------------------------------------------------------
def kap_bildirimler(hisse: str, bas: date, bit: date) -> list[dict]:
    """KAP bildirim listesi denemesi. Site JS/Cloudflare arkasında olabilir; başarısızsa [] döner."""
    denemeler = [
        ("GET", f"{KAP}/tr/api/disclosures", {"memberCode": hisse, "fromDate": bas.isoformat(), "toDate": bit.isoformat()}),
        ("POST", f"{KAP}/tr/api/memberDisclosureQuery", {"fromDate": bas.isoformat(), "toDate": bit.isoformat(), "memberType": "IGS",
                                                            "mkkMemberOidList": [], "stockCode": hisse, "disclosureClass": "", "subjectList": []}),
    ]  # fmt: skip
    for yontem, url, p in denemeler:
        try:
            r = requests.get(url, params=p, headers=BASLIK, timeout=10) if yontem == "GET" else requests.post(url, json=p, headers=BASLIK, timeout=10)
            if r.status_code == 200 and r.headers.get("content-type", "").startswith("application/json"):
                veri = r.json()
                if isinstance(veri, list) and veri:
                    return veri
                if isinstance(veri, dict) and veri.get("data"):
                    return list(veri["data"])
        except Exception:  # noqa: BLE001
            continue
    return []


# --- Yahoo ------------------------------------------------------------------------------------
def yahoo_gunluk(sembol: str, bas: date) -> pd.DataFrame:
    """Günlük çubuklar + temettü (hisse başı TL, hak kullanım günü) + bölünme/bedelsiz oranı.
    `Ticker.history` kullanılır: `yf.download` paylaşılan global durum kullandığından paralel çağrıda karışabilir."""
    import yfinance as yf  # lokal içe aktarma: paket isteğe bağlı

    df = yf.Ticker(sembol).history(start=bas.isoformat(), interval="1d", auto_adjust=False, actions=True)
    if df is None or df.empty:
        return pd.DataFrame()
    df = df.rename(columns={"Open": "acilis", "High": "yuksek", "Low": "dusuk", "Close": "kapanis", "Adj Close": "duz_kapanis",
                            "Volume": "hacim", "Dividends": "temettu", "Stock Splits": "bolunme"})  # fmt: skip
    df.index.name = "tarih"
    sutunlar = [c for c in ("acilis", "yuksek", "dusuk", "kapanis", "duz_kapanis", "hacim", "temettu", "bolunme") if c in df.columns]
    return df[sutunlar].reset_index()


def yahoo_temel(sembol: str) -> dict:
    """Anlık temel özet (yalnız bugünkü değer; tarihsel değil). Çeyreklik tablolar varsa eklenir."""
    import yfinance as yf

    t = yf.Ticker(sembol)
    out: dict[str, Any] = {"cekilme": datetime.now().isoformat(timespec="minutes")}
    try:
        info = t.info or {}
        out["info"] = {k: info.get(k) for k in ("trailingPE", "forwardPE", "priceToBook", "enterpriseToEbitda", "marketCap", "dividendYield",
                                                 "sharesOutstanding", "floatShares", "heldPercentInstitutions", "beta", "sector", "industry")}  # fmt: skip
    except Exception as e:  # noqa: BLE001
        out["info_hata"] = str(e)
    for ad in ("quarterly_income_stmt", "quarterly_balance_sheet", "quarterly_cashflow"):
        try:
            df = getattr(t, ad)
            if df is not None and not df.empty:
                df.columns = [str(c)[:10] for c in df.columns]
                out[ad] = json.loads(df.to_json(orient="split", date_format="iso"))
        except Exception as e:  # noqa: BLE001
            out[f"{ad}_hata"] = str(e)
    return out


# --- toplu çekim -----------------------------------------------------------------------------
def ceyrekler(bas: date, bit: date) -> list[tuple[int, int]]:
    out = []
    y, m = bas.year, 3
    while date(y, m, 1) <= bit:
        out.append((y, m))
        m += 3
        if m > 12:
            y, m = y + 1, 3
    return out


HARIC = {"TERA", "TEHOL", "TRHOL"}  # Kullanıcı kuralı: Tera hisseleri hiç analiz edilmez
ISY_SADE = ["HGDG_HS_KODU", "HGDG_TARIH", "HGDG_KAPANIS", "HGDG_AOF", "HGDG_MIN", "HGDG_MAX", "HGDG_HACIM", "END_DEGER", "DD_DEGER",
            "DOLAR_BAZLI_FIYAT", "DOLAR_HACIM", "SERMAYE", "PD", "PD_USD", "HAO_PD", "HAO_PD_USD", "tarih"]  # fmt: skip


def hisseleri_coz(simgeler: list[str], klasor: Path, yedek_klasor: str | Path = "dosya_kaynak") -> tuple[list[str], dict]:
    """'XU100', 'XU030' gibi endeks simgelerini bileşenlere açar (canlı kaynak; olmazsa dosya_kaynak/bist100.json yedeği).
    Tera hisseleri çıkarılır. Döner: (sıralı benzersiz hisse listesi, endeks raporu)."""
    out: list[str] = []
    rapor: dict = {}
    for s in simgeler:
        s = s.strip().upper()
        if not s:
            continue
        if s.startswith("XU") and len(s) >= 4:
            sonuc = endeks_uyeleri(s)
            kodlar = sonuc["kodlar"]
            kaynak = sonuc["kaynak"]
            if len(kodlar) < 25:
                yedek = Path(yedek_klasor) / ("bist100.json" if s == "XU100" else f"{s.lower()}.json")
                if yedek.exists():
                    d = json.loads(yedek.read_text(encoding="utf-8"))
                    kodlar = d.get("bist100" if s == "XU100" else "kodlar", []) if s != "XU030" else d.get("bist30", [])
                    kaynak = f"yedek:{yedek}"
            (klasor / f"endeks_{s}.json").write_text(json.dumps({**sonuc, "kodlar": kodlar, "kaynak": kaynak, "cekilme": datetime.now().isoformat(timespec="minutes")},
                                                                ensure_ascii=False, indent=1), encoding="utf-8")  # fmt: skip
            rapor[f"endeks_{s}"] = {"kod": len(kodlar), "kaynak": kaynak, "denemeler": sonuc["denemeler"]}
            out += kodlar
        else:
            out.append(s)
    goruldu: set[str] = set()
    sirali = [h for h in out if not (h in goruldu or goruldu.add(h)) and h not in HARIC]
    return sirali, rapor


def _tek_hisse(h: str, klasor: Path, bas: date, bit: date, kap: bool) -> dict[str, Any]:
    t0 = time.time()
    r: dict[str, Any] = {}
    try:
        df = isy_gunluk(h, bas, bit)
        df = df[[c for c in ISY_SADE if c in df.columns]]
        df.to_csv(klasor / f"{h}_isy_gunluk.csv", index=False)
        r["isy_gunluk"] = len(df)
    except Exception as e:  # noqa: BLE001
        r["isy_gunluk_hata"] = str(e)[:200]
    try:
        mt = isy_mali_tablo(h, ceyrekler(date(bas.year - 1, 1, 1), bit))  # bir yıl öncesinden: yıllık büyüme için
        mt.to_csv(klasor / f"{h}_isy_mali.csv", index=False)
        r["isy_mali_kalem"] = len(mt)
    except Exception as e:  # noqa: BLE001
        r["isy_mali_hata"] = str(e)[:200]
    if kap:
        try:
            b = kap_bildirimler(h, bas, bit)
            (klasor / f"{h}_kap.json").write_text(json.dumps(b, ensure_ascii=False), encoding="utf-8")
            r["kap"] = len(b)
        except Exception as e:  # noqa: BLE001
            r["kap_hata"] = str(e)[:200]
    try:
        df = yahoo_gunluk(f"{h}.IS", bas)
        df.to_csv(klasor / f"{h}_yahoo_1d.csv", index=False)
        r["yahoo_1d"] = len(df)
    except Exception as e:  # noqa: BLE001
        r["yahoo_1d_hata"] = str(e)[:200]
    try:
        (klasor / f"{h}_yahoo_temel.json").write_text(json.dumps(yahoo_temel(f"{h}.IS"), ensure_ascii=False, default=str), encoding="utf-8")
        r["yahoo_temel"] = True
    except Exception as e:  # noqa: BLE001
        r["yahoo_temel_hata"] = str(e)[:200]
    r["sure_sn"] = round(time.time() - t0, 1)
    return r


PIYASA_SERILERI = ("XU100.IS", "USDTRY=X", "EURTRY=X", "BZ=F", "GC=F", "^VIX", "^TNX", "DX-Y.NYB", "EEM", "^GSPC")


def seri_dosya_adi(sembol: str) -> str:
    """'USDTRY=X' → 'USDTRY_X', '^VIX' → 'VIX', 'DX-Y.NYB' → 'DX-Y.NYB' (dosya adı güvenli)."""
    import re

    return re.sub(r"[^A-Za-z0-9._-]", "_", sembol.lstrip("^"))


def dosya_veri_cek(hisseler: list[str], klasor: str | Path, bas: date, bit: date | None = None, gosterge: tuple[str, ...] = PIYASA_SERILERI,
                   kap: bool = False, endeksler: tuple[str, ...] = (), paralel: int = 6, yedek_klasor: str | Path = "dosya_kaynak") -> dict[str, dict]:
    """Her hisse için ham dosyaları yazar ({hisse}_isy_gunluk.csv, _isy_mali.csv, _yahoo_1d.csv, _yahoo_temel.json; istenirse _kap.json).
    `hisseler` içinde 'XU100' gibi endeks simgeleri bileşenlere açılır. Hisseler `paralel` iş parçacığıyla çekilir.
    Çözülen liste `_hisseler.txt`'ye yazılır (saatlik çekim adımı için)."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    bit = bit or date.today()
    klasor = Path(klasor)
    klasor.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    liste, rapor = hisseleri_coz(list(hisseler), klasor, yedek_klasor)
    for e in endeksler:  # yalnız liste kaydı (bileşenleri çekmeden)
        if f"endeks_{e}" not in rapor:
            _, r2 = hisseleri_coz([e], klasor, yedek_klasor)
            rapor.update(r2)
    (klasor / "_hisseler.txt").write_text(",".join(liste), encoding="utf-8")
    for g in gosterge:
        try:
            df = yahoo_gunluk(g, bas)
            df.to_csv(klasor / f"{seri_dosya_adi(g)}_yahoo_1d.csv", index=False)
            rapor[g] = {"yahoo_1d": len(df)}
        except Exception as e:  # noqa: BLE001
            rapor[g] = {"hata": str(e)[:200]}
    with ThreadPoolExecutor(max_workers=max(1, paralel)) as havuz:
        isler = {havuz.submit(_tek_hisse, h, klasor, bas, bit, kap): h for h in liste}
        for i, f in enumerate(as_completed(isler), start=1):
            h = isler[f]
            try:
                rapor[h] = f.result()
            except Exception as e:  # noqa: BLE001
                rapor[h] = {"hata": str(e)[:200]}
            print(f"[{i}/{len(liste)}] {h} {json.dumps(rapor[h], ensure_ascii=False)[:160]}", flush=True)
    ozet = {"hisse": len(liste), "tam": sum(1 for h in liste if rapor.get(h, {}).get("isy_gunluk", 0) and rapor.get(h, {}).get("yahoo_1d", 0)),
            "sure_dk": round((time.time() - t0) / 60, 1)}  # fmt: skip
    (klasor / "_cekim_raporu.json").write_text(json.dumps({"zaman": datetime.now().isoformat(timespec="minutes"), "bas": bas.isoformat(), "bit": bit.isoformat(),
                                                           "ozet": ozet, "rapor": rapor}, ensure_ascii=False, indent=1), encoding="utf-8")  # fmt: skip
    print("ÖZET", json.dumps(ozet, ensure_ascii=False))
    return rapor
