"""Ağ katmanı ham veri çekicileri. Dış ağ gerektirir (GitHub Actions `ag-veri` işi).

Kaynaklar (ücretsiz, kayıt gerektirmez):
- TradingView tarayıcı: tüm BIST payları (kod, ad, sektör, piyasa değeri, halka açık pay ...).
- Yahoo: tüm BIST günlük çubuklar; sektör endeksleri, madenler ve küresel seriler (uzun dönem günlük + 730 gün saatlik).
- İş Yatırım: günlük PD, halka açık PD, AOF, TL hacim; seçili mali tablo kalemleri; yabancı payı (haftalık).
- TEFAS: fon fiyatı, büyüklüğü, yatırımcı sayısı ve varlık dağılımı (yatırım ve emeklilik fonları).
- KAP: yalnız erişim sondası.

Her kaynak bağımsızdır: biri çalışmazsa `_cekim_raporu.json`'a yazılır, diğerleri sürer. Çıktılar sıkıştırılmış uzun tablolar
(`veri/ag/*.csv.gz`); tek tek hisse dosyaları yazılmaz (git'i şişirmemek için).
"""

from __future__ import annotations

import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd
import requests

from ..dosya.kaynaklar import BASLIK, HARIC, ISY_SADE, ceyrekler, isy_gunluk, isy_mali_tablo, yahoo_gunluk
from ..dosya.kur import KALEM_KOD

TV = "https://scanner.tradingview.com/turkey/scan"
TV_TEMEL = ["name", "description", "type", "subtype", "sector", "industry", "close", "market_cap_basic", "volume"]
TV_EK = ["float_shares_outstanding", "total_shares_outstanding", "float_shares_percent_current", "average_volume_30d_calc", "average_volume_90d_calc",
         "Value.Traded", "price_earnings_ttm", "price_book_fq", "dividends_yield", "dividends_yield_current", "Perf.W", "Perf.1M", "Perf.3M", "Perf.6M",
         "Perf.YTD", "Perf.Y", "Perf.5Y", "Perf.All", "Volatility.D", "Volatility.M", "beta_1_year", "relative_volume_10d_calc", "High.All", "Low.All",
         "price_52_week_high", "price_52_week_low", "ipo_offer_date", "ipo_offer_price_usd", "ipo_deal_amount_usd", "number_of_shareholders",
         "number_of_employees", "exchange", "typespecs", "indexes"]  # fmt: skip

ENDEKSLER = ["XU100", "XU030", "XU050", "XUTUM", "XYLDZ", "XBANA", "XBANK", "XUSIN", "XUMAL", "XUHIZ", "XUTEK", "XHOLD", "XGIDA", "XKMYA", "XMADN",
             "XMANA", "XMESY", "XTAST", "XTEKS", "XKAGT", "XELKT", "XILTM", "XTCRT", "XTRZM", "XULAS", "XGMYO", "XSGRT", "XINSA", "XBLSM", "XSPOR",
             "XFINK", "XYORT", "XAKUR", "XTMTU", "XHARZ", "XKTUM", "XK100", "XK050", "XK030", "XUSRD", "XKURY", "XSIST", "XYUZO", "XTUMY"]  # fmt: skip
MADEN_KURESEL = ["GC=F", "SI=F", "HG=F", "PL=F", "PA=F", "ALI=F", "HRC=F", "TIO=F", "BZ=F", "CL=F", "NG=F", "ZW=F", "CT=F", "USDTRY=X", "EURTRY=X",
                 "EURUSD=X", "DX-Y.NYB", "^VIX", "^TNX", "^GSPC", "^IXIC", "ES=F", "NQ=F", "EEM", "TUR", "GLD", "SLV", "GDX", "COPX", "XME",
                 "GLDTR.IS", "GMSTR.IS", "ZGOLD.IS", "ALTINS1.IS", "ISGLK.IS", "ZPX30.IS", "DJIST.IS", "Z30EA.IS", "USDTR.IS"]  # fmt: skip
SAATLIK = ["GC=F", "SI=F", "HG=F", "PL=F", "BZ=F", "NG=F", "ES=F", "NQ=F", "USDTRY=X", "EURTRY=X", "EURUSD=X", "TUR", "XU100.IS", "XU030.IS", "XBANK.IS",
           "XUSIN.IS", "XUTEK.IS", "XHOLD.IS", "XUHIZ.IS", "XGMYO.IS", "XMADN.IS", "XELKT.IS", "XULAS.IS", "XKMYA.IS", "XMANA.IS", "XGIDA.IS", "XTCRT.IS",
           "XILTM.IS", "XSGRT.IS", "XINSA.IS", "XTAST.IS", "XHARZ.IS", "GLDTR.IS", "GMSTR.IS", "ALTINS1.IS"]  # fmt: skip

YAB_URL = "https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/StockInfo/CompanyInfoAjax.aspx/GetYabanciOranlarXHR"
YAB_SAYFA = "https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/yabanci-oranlari.aspx"
TEFAS = "https://www.tefas.gov.tr"
TARAYICI = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"


def _yaz(df: pd.DataFrame, yol: Path) -> int:
    yol.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(yol, index=False, compression="gzip", float_format="%.7g")
    return int(len(df))


# --- TradingView ------------------------------------------------------------------------------
def _tv_iste(kolonlar: list[str], markets: bool = True) -> requests.Response:
    govde: dict[str, Any] = {"columns": kolonlar, "range": [0, 5000], "options": {"lang": "tr"}, "sort": {"sortBy": "name", "sortOrder": "asc"},
                             "symbols": {"query": {"types": []}, "tickers": []}}  # fmt: skip
    if markets:
        govde["markets"] = ["turkey"]
    return requests.post(TV, json=govde, headers=BASLIK, timeout=40)


def tv_tarama(ek: list[str] | None = None) -> tuple[pd.DataFrame, dict]:
    """Tüm Türkiye pazarı satırları. Ek kolonlar tek tek denenir (bilinmeyen kolon tüm isteği düşürür)."""
    rapor: dict[str, Any] = {}
    r = _tv_iste(TV_TEMEL)
    if r.status_code != 200:
        rapor["markets_hata"] = f"HTTP {r.status_code}: {r.text[:160]}"
        r = _tv_iste(TV_TEMEL, markets=False)
    if r.status_code != 200:
        return pd.DataFrame(), {**rapor, "hata": f"HTTP {r.status_code}: {r.text[:200]}"}
    veri = r.json().get("data", [])
    df = pd.DataFrame([[d.get("s"), *d.get("d", [])] for d in veri], columns=["sembol", *TV_TEMEL])
    gecerli, gecersiz = [], []
    for k in ek if ek is not None else TV_EK:
        try:
            r2 = _tv_iste(["name", k])
            if r2.status_code == 200:
                d2 = {d.get("s"): d.get("d", [None, None])[1] for d in r2.json().get("data", [])}
                df[k] = df["sembol"].map(d2).map(lambda v: json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict)) else v)
                gecerli.append(k)
            else:
                gecersiz.append(k)
        except Exception as e:  # noqa: BLE001
            gecersiz.append(f"{k}: {str(e)[:60]}")
        time.sleep(0.25)
    df["hisse"] = df["sembol"].astype(str).str.split(":").str[-1]
    rapor.update({"satir": int(len(df)), "tipler": df["type"].value_counts().to_dict(), "gecerli_ek": gecerli, "gecersiz_ek": gecersiz})
    return df, rapor


def hisse_listesi(tv: pd.DataFrame) -> list[str]:
    """Tarama sonucundan pay kodları (yalnız 'stock' tipi; Tera hisseleri hariç)."""
    if tv.empty:
        return []
    d = tv[tv["type"].astype(str).str.lower() == "stock"]
    kodlar = [str(h).strip().upper() for h in d["hisse"] if re.fullmatch(r"[A-Z0-9]{3,6}", str(h).strip().upper())]
    return sorted({h for h in kodlar if h not in HARIC})


# --- hisse panelleri --------------------------------------------------------------------------
def _paralel(islev, ogeler: list, paralel: int, etiket: str) -> tuple[list[pd.DataFrame], dict]:
    parcalar: list[pd.DataFrame] = []
    hata: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=max(1, paralel)) as havuz:
        isler = {havuz.submit(islev, o): o for o in ogeler}
        for i, f in enumerate(as_completed(isler), start=1):
            o = isler[f]
            try:
                df = f.result()
                if df is not None and not df.empty:
                    parcalar.append(df)
                else:
                    hata[str(o)] = "boş"
            except Exception as e:  # noqa: BLE001
                hata[str(o)] = str(e)[:100]
            if i % 50 == 0:
                print(f"[{etiket}] {i}/{len(ogeler)} (hata {len(hata)})", flush=True)
    return parcalar, hata


def gunluk_panel(hisseler: list[str], bas: date, paralel: int = 4) -> tuple[pd.DataFrame, dict]:
    """Yahoo günlük çubuklar, uzun tablo: hisse, tarih, acilis, yuksek, dusuk, kapanis, duz_kapanis, hacim, temettu, bolunme."""

    def tek(h: str) -> pd.DataFrame:
        df = yahoo_gunluk(f"{h}.IS", bas)
        if df.empty:
            return df
        df["tarih"] = pd.to_datetime(df["tarih"]).dt.strftime("%Y-%m-%d")
        df.insert(0, "hisse", h)
        return df

    parcalar, hata = _paralel(tek, hisseler, paralel, "yahoo")
    if hata:  # hız sınırı olasılığına karşı ikinci tur (tek iş parçacığı)
        time.sleep(20)
        p2, hata = _paralel(tek, sorted(hata), 1, "yahoo-2")
        parcalar += p2
    df = pd.concat(parcalar, ignore_index=True) if parcalar else pd.DataFrame()
    return df, {"hisse": int(df["hisse"].nunique()) if not df.empty else 0, "satir": int(len(df)), "hata": hata}


def isy_panel(hisseler: list[str], bas: date, bit: date, paralel: int = 6) -> tuple[pd.DataFrame, dict]:
    """İş Yatırım günlük seri, uzun tablo (ISY_SADE sütunları): PD, HAO_PD, AOF, TL hacim, dolar bazlı fiyat, sermaye."""

    def tek(h: str) -> pd.DataFrame:
        df = isy_gunluk(h, bas, bit)
        if df.empty:
            return df
        df = df[[c for c in ISY_SADE if c in df.columns]].drop(columns=["HGDG_TARIH"], errors="ignore")
        df["tarih"] = pd.to_datetime(df["tarih"]).dt.strftime("%Y-%m-%d")
        return df.rename(columns={"HGDG_HS_KODU": "hisse"})

    parcalar, hata = _paralel(tek, hisseler, paralel, "isy")
    df = pd.concat(parcalar, ignore_index=True) if parcalar else pd.DataFrame()
    return df, {"hisse": int(df["hisse"].nunique()) if not df.empty else 0, "satir": int(len(df)), "hata_sayisi": len(hata), "hata_ornek": dict(list(hata.items())[:8])}


def mali_panel(hisseler: list[str], bas: date, bit: date, paralel: int = 6) -> tuple[pd.DataFrame, dict]:
    """Seçili mali tablo kalemleri (KALEM_KOD), uzun tablo: hisse, kod, donem ('YYYY/M'), deger (TL, yılbaşından kümülatif)."""
    kodlar = set(KALEM_KOD.values())
    donemler = ceyrekler(date(bas.year - 1, 1, 1), bit)

    def tek(h: str) -> pd.DataFrame:
        mt = isy_mali_tablo(h, donemler)
        if mt.empty:
            return mt
        mt = mt[mt["itemCode"].astype(str).str.strip().isin(kodlar)]
        uzun = mt.melt(id_vars=["itemCode"], value_vars=[c for c in mt.columns if c[:2] == "20"], var_name="donem", value_name="deger").dropna(subset=["deger"])
        uzun.insert(0, "hisse", h)
        return uzun.rename(columns={"itemCode": "kod"})

    parcalar, hata = _paralel(tek, hisseler, paralel, "mali")
    df = pd.concat(parcalar, ignore_index=True) if parcalar else pd.DataFrame()
    return df, {"hisse": int(df["hisse"].nunique()) if not df.empty else 0, "satir": int(len(df)), "hata_sayisi": len(hata)}


# --- seriler (endeks, maden, küresel) ----------------------------------------------------------
def seri_gunluk(semboller: list[str], bas: date, paralel: int = 4) -> tuple[pd.DataFrame, dict]:
    def tek(s: str) -> pd.DataFrame:
        df = yahoo_gunluk(s, bas)
        if len(df) < 10:  # bazı endekslerde erken başlangıç tek satır döndürüyor: tüm geçmişi dönem parametresiyle iste
            import yfinance as yf

            for donem in ("max", "10y", "5y", "2y"):
                try:
                    d2 = yf.Ticker(s).history(period=donem, interval="1d", auto_adjust=False)
                except Exception:  # noqa: BLE001
                    continue
                if d2 is not None and len(d2) >= 10:
                    d2 = d2.rename(columns={"Open": "acilis", "High": "yuksek", "Low": "dusuk", "Close": "kapanis", "Volume": "hacim"})
                    d2.index.name = "tarih"
                    df = d2[["acilis", "yuksek", "dusuk", "kapanis", "hacim"]].reset_index()
                    break
        if df.empty:
            return df
        df["tarih"] = pd.to_datetime(df["tarih"]).dt.strftime("%Y-%m-%d")
        df.insert(0, "sembol", s)
        return df[["sembol", "tarih", "acilis", "yuksek", "dusuk", "kapanis", "hacim"]]

    parcalar, hata = _paralel(tek, semboller, paralel, "seri")
    df = pd.concat(parcalar, ignore_index=True) if parcalar else pd.DataFrame()
    return df, {"sembol": int(df["sembol"].nunique()) if not df.empty else 0, "satir": int(len(df)), "hata": hata}


def seri_saatlik(semboller: list[str], gun: int = 725, paralel: int = 3) -> tuple[pd.DataFrame, dict]:
    """Saatlik çubuklar (Yahoo sınırı 730 gün); zaman Europe/Istanbul'a çevrilir."""
    import yfinance as yf

    bas = (date.today() - timedelta(days=gun)).isoformat()

    def tek(s: str) -> pd.DataFrame:
        df = yf.Ticker(s).history(start=bas, interval="1h", auto_adjust=False)
        if df is None or df.empty:
            return pd.DataFrame()
        df = df.rename(columns={"Open": "acilis", "High": "yuksek", "Low": "dusuk", "Close": "kapanis", "Volume": "hacim"})
        z = df.index.tz_convert("Europe/Istanbul") if df.index.tz is not None else df.index.tz_localize("UTC").tz_convert("Europe/Istanbul")
        df = df[["acilis", "yuksek", "dusuk", "kapanis", "hacim"]].reset_index(drop=True)
        df.insert(0, "zaman", z.strftime("%Y-%m-%d %H:%M"))
        df.insert(0, "sembol", s)
        return df

    parcalar, hata = _paralel(tek, semboller, paralel, "saatlik")
    df = pd.concat(parcalar, ignore_index=True) if parcalar else pd.DataFrame()
    return df, {"sembol": int(df["sembol"].nunique()) if not df.empty else 0, "satir": int(len(df)), "hata": hata}


# --- İş Yatırım yabancı payı -------------------------------------------------------------------
def _yab_coz(r: requests.Response) -> list[dict]:
    j = r.json()
    d = j.get("d", j) if isinstance(j, dict) else j
    if isinstance(d, str):
        d = json.loads(d)
    if isinstance(d, dict):
        d = d.get("value") or d.get("data") or []
    return [x for x in d if isinstance(x, dict)] if isinstance(d, list) else []


def yabanci_panel(bas: date, bit: date, adim_gun: int = 7) -> tuple[pd.DataFrame, dict]:
    """Haftalık yabancı payı (takas) oranları. Uç nokta iki tarih arası karşılaştırma döndürür; ardışık haftalar zincirlenir.
    Tarih biçimi ve gövde adları sitenin iç çağrısına göre; biçimler sırayla denenir, yanıt örneği rapora yazılır."""
    rapor: dict[str, Any] = {"denemeler": []}
    o = requests.Session()
    o.headers.update({"User-Agent": TARAYICI, "Accept": "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest",
                      "Content-Type": "application/json; charset=UTF-8", "Referer": YAB_SAYFA, "Origin": "https://www.isyatirim.com.tr"})  # fmt: skip
    try:
        o.get(YAB_SAYFA, timeout=30)
    except Exception as e:  # noqa: BLE001
        rapor["sayfa_hata"] = str(e)[:120]

    def iste(b: date, s: date, fmt: str, endeks: str) -> list[dict]:
        govde = {"baslangicTarih": b.strftime(fmt), "bitisTarih": s.strftime(fmt), "sektor": None, "endeks": endeks, "hisse": None}
        r = o.post(YAB_URL, data=json.dumps(govde), timeout=45)
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code}: {r.text[:150]}")
        return _yab_coz(r)

    # biçim sondası: son tam hafta
    s0 = bit - timedelta(days=3)
    b0 = s0 - timedelta(days=7)
    secim = None
    for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
        for endeks in ("09", "", "01"):
            try:
                v = iste(b0, s0, fmt, endeks)
                rapor["denemeler"].append({"fmt": fmt, "endeks": endeks, "satir": len(v), "ornek": json.dumps(v[:1], ensure_ascii=False)[:300]})
                if len(v) >= 100 and (secim is None or len(v) > secim[2]):
                    secim = (fmt, endeks, len(v))
            except Exception as e:  # noqa: BLE001
                rapor["denemeler"].append({"fmt": fmt, "endeks": endeks, "hata": str(e)[:200]})
        if secim:
            break
    if not secim:
        return pd.DataFrame(), rapor
    fmt, endeks, _ = secim
    rapor["secim"] = {"fmt": fmt, "endeks": endeks}
    parcalar = []
    bos = 0
    d = bas
    while d < bit:
        s = min(d + timedelta(days=adim_gun), bit)
        v: list[dict] = []
        for kay in (0, -1, -2, 1):  # tatil gününe denk gelirse kaydır
            try:
                v = iste(d, s + timedelta(days=kay), fmt, endeks)
            except Exception:  # noqa: BLE001
                v = []
            if v:
                s_kul = s + timedelta(days=kay)
                break
        if v:
            df = pd.DataFrame(v)
            df.insert(0, "bit", s_kul.isoformat())
            df.insert(0, "bas", d.isoformat())
            parcalar.append(df)
        else:
            bos += 1
        d = s
        time.sleep(0.35)
    df = pd.concat(parcalar, ignore_index=True) if parcalar else pd.DataFrame()
    rapor.update({"donem": len(parcalar), "bos_donem": bos, "satir": int(len(df)), "sutunlar": list(df.columns)[:20]})
    return df, rapor


# --- TEFAS -------------------------------------------------------------------------------------
def _tefas_oturum() -> requests.Session:
    o = requests.Session()
    o.headers.update({"User-Agent": TARAYICI, "Accept": "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest",
                      "Origin": TEFAS, "Referer": f"{TEFAS}/TarihselVeriler.aspx", "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.6"})  # fmt: skip
    try:
        o.get(f"{TEFAS}/TarihselVeriler.aspx", timeout=30)
    except Exception:  # noqa: BLE001
        pass
    return o


def _tefas_iste(o: requests.Session, uc: str, bas: date, bit: date, fontip: str) -> list[dict]:
    veri = {"fontip": fontip, "sfontur": "", "fonkod": "", "fongrup": "", "bastarih": bas.strftime("%d.%m.%Y"), "bittarih": bit.strftime("%d.%m.%Y"),
            "fonturkod": "", "fonunvantip": ""}  # fmt: skip
    son: Exception | None = None
    for i in range(3):
        try:
            r = o.post(f"{TEFAS}/api/DB/{uc}", data=veri, timeout=120)
            if r.status_code == 200 and "json" in r.headers.get("content-type", ""):
                return list(r.json().get("data", []))
            son = RuntimeError(f"HTTP {r.status_code} {r.headers.get('content-type', '')}: {r.text[:120]}")
        except Exception as e:  # noqa: BLE001, PERF203
            son = e
        time.sleep(3 * (i + 1))
    raise RuntimeError(str(son)[:220])


def _tefas_tarih(df: pd.DataFrame) -> pd.DataFrame:
    df["tarih"] = pd.to_datetime(pd.to_numeric(df["TARIH"], errors="coerce"), unit="ms").dt.strftime("%Y-%m-%d")
    return df.drop(columns=["TARIH"])


def tefas_cek(bas: date, bit: date, hisse_esik: float = 30.0) -> tuple[dict[str, pd.DataFrame], dict]:
    """TEFAS: (a) ay sonu varlık dağılımı (tüm fonlar), (b) ay sonu büyüklük/kişi/fiyat (tüm fonlar),
    (c) hisse ağırlıklı fonların (ortalama hisse payı ≥ eşik) günlük fiyat/büyüklük/kişi serisi."""
    rapor: dict[str, Any] = {}
    o = _tefas_oturum()
    tablolar: dict[str, pd.DataFrame] = {}
    # (a) ay sonu dağılımları
    aylar = pd.period_range(bas, bit, freq="M")
    dag = []
    for fontip in ("YAT", "EMK", "BYF"):
        for ay in aylar:
            son = min(ay.end_time.date(), bit)
            try:
                v = _tefas_iste(o, "BindHistoryAllocation", son - timedelta(days=6), son, fontip)
            except Exception as e:  # noqa: BLE001
                rapor.setdefault("dagilim_hata", []).append(f"{fontip} {ay}: {str(e)[:140]}")
                if len(rapor["dagilim_hata"]) >= 4 and not dag:
                    break  # kaynak kapalı: boşuna deneme
                continue
            if v:
                df = _tefas_tarih(pd.DataFrame(v))
                df = df.sort_values("tarih").groupby("FONKODU").tail(1)
                df.insert(0, "fontip", fontip)
                dag.append(df)
            time.sleep(0.5)
    if dag:
        D = pd.concat(dag, ignore_index=True)
        D = D.dropna(axis=1, how="all")
        tablolar["tefas_dagilim"] = D
        rapor["dagilim"] = {"satir": int(len(D)), "fon": int(D["FONKODU"].nunique()), "sutun": list(D.columns)}
    # (b)+(c) günlük bilgi: 28 günlük pencereler
    hisse_fon: set[str] | None = None
    if dag and "HS" in tablolar["tefas_dagilim"].columns:
        ort = tablolar["tefas_dagilim"].assign(HS=lambda x: pd.to_numeric(x["HS"], errors="coerce").fillna(0)).groupby("FONKODU")["HS"].mean()
        hisse_fon = set(ort[ort >= hisse_esik].index)
        rapor["hisse_agirlikli_fon"] = len(hisse_fon)
    ay_sonu, gunluk = [], []
    for fontip in ("YAT", "EMK", "BYF"):
        d = bas
        while d <= bit:
            s = min(d + timedelta(days=27), bit)
            try:
                v = _tefas_iste(o, "BindHistoryInfo", d, s, fontip)
            except Exception as e:  # noqa: BLE001
                rapor.setdefault("bilgi_hata", []).append(f"{fontip} {d}: {str(e)[:140]}")
                if len(rapor["bilgi_hata"]) >= 4 and not ay_sonu:
                    break
                d = s + timedelta(days=1)
                continue
            if v:
                df = _tefas_tarih(pd.DataFrame(v)).drop(columns=["BORSABULTENFIYAT"], errors="ignore")
                df.insert(0, "fontip", fontip)
                df["ay"] = df["tarih"].str[:7]
                ay_sonu.append(df.sort_values("tarih").groupby(["FONKODU", "ay"]).tail(1))
                if hisse_fon is None:
                    u = df["FONUNVAN"].astype(str).str.upper()
                    g = df[u.str.contains("HİSSE|HISSE|ENDEKS|DEĞİŞKEN|SERBEST", regex=True)]
                else:
                    g = df[df["FONKODU"].isin(hisse_fon)]
                gunluk.append(g.drop(columns=["FONUNVAN", "ay"]))
            d = s + timedelta(days=1)
            time.sleep(0.5)
    if ay_sonu:
        A = pd.concat(ay_sonu, ignore_index=True).sort_values("tarih").groupby(["FONKODU", "ay"]).tail(1)
        tablolar["tefas_aylik"] = A
        rapor["aylik"] = {"satir": int(len(A)), "fon": int(A["FONKODU"].nunique())}
    if gunluk:
        G = pd.concat(gunluk, ignore_index=True).drop_duplicates(["FONKODU", "tarih"])
        tablolar["tefas_gunluk_hisse"] = G
        rapor["gunluk"] = {"satir": int(len(G)), "fon": int(G["FONKODU"].nunique())}
    return tablolar, rapor


# --- KAP sondası -------------------------------------------------------------------------------
def kap_sonda() -> dict:
    """KAP'a bu ortamdan erişilebiliyor mu? (bildirim taraması için ön koşul). Yalnız durum kodları ve kısa örnek döner."""
    out: dict[str, Any] = {}
    bugun = date.today()
    denemeler = [
        ("ana", "GET", "https://www.kap.org.tr/tr", None),
        ("bist-sirketler", "GET", "https://www.kap.org.tr/tr/bist-sirketler", None),
        ("api-sorgu", "POST", "https://www.kap.org.tr/tr/api/memberDisclosureQuery",
         {"fromDate": (bugun - timedelta(days=3)).isoformat(), "toDate": bugun.isoformat(), "year": "", "prd": "", "term": "", "ruleType": "", "bdkReview": "",
          "disclosureClass": "ODA", "index": "", "market": "", "isLate": "", "subjectList": [], "mkkMemberOidList": [], "inactiveMkkMemberOidList": [],
          "bdkMemberOidList": [], "mainSector": "", "sector": "", "subSector": "", "memberType": "IGS", "fromSrc": "N", "srcCategory": "", "discIndex": []}),
        ("api-liste", "GET", "https://www.kap.org.tr/tr/api/disclosures", None),
    ]  # fmt: skip
    for ad, yontem, url, govde in denemeler:
        try:
            h = {"User-Agent": TARAYICI, "Accept": "application/json, text/html, */*", "Accept-Language": "tr-TR,tr;q=0.9"}
            r = requests.get(url, headers=h, timeout=15) if yontem == "GET" else requests.post(url, json=govde, headers=h, timeout=15)
            out[ad] = {"durum": r.status_code, "tip": r.headers.get("content-type", "")[:40], "uzunluk": len(r.content), "ornek": r.text[:160].replace("\n", " ")}
        except Exception as e:  # noqa: BLE001
            out[ad] = {"hata": str(e)[:160]}
    return out


def kesif() -> dict:
    """Uç nokta keşfi: İş Yatırım yabancı oranları sayfasındaki çağrı ve KAP sitesinin API yolları (betiklerden)."""
    out: dict[str, Any] = {}
    h = {"User-Agent": TARAYICI, "Accept-Language": "tr-TR,tr;q=0.9"}
    try:
        r = requests.get(YAB_SAYFA, headers=h, timeout=40)
        html = r.text
        out["isy_sayfa"] = {"durum": r.status_code, "uzunluk": len(html)}
        metinler = [("sayfa", html)]
        for src in re.findall(r'<script[^>]+src="([^"]+)"', html)[:60]:
            u = src if src.startswith("http") else "https://www.isyatirim.com.tr" + src
            if "isyatirim" not in u:
                continue
            try:
                metinler.append((src[-60:], requests.get(u, headers=h, timeout=30).text))
            except Exception:  # noqa: BLE001, PERF203
                continue
        baglam = []
        for ad, m in metinler:
            for e in re.finditer(r"GetYabanci\w*|YabanciOran\w*XHR|yabanciOran\w*", m):
                baglam.append({"kaynak": ad, "metin": m[max(0, e.start() - 500) : e.end() + 900].replace("\n", " ")})
                if len(baglam) >= 8:
                    break
        out["isy_baglam"] = baglam
        out["isy_betik_sayisi"] = len(metinler) - 1
    except Exception as e:  # noqa: BLE001
        out["isy_hata"] = str(e)[:200]
    try:
        yollar: set[str] = set()
        betikler: set[str] = set()
        ornek: dict[str, str] = {}
        for sayfa in ("/tr", "/tr/bildirim-sorgu", "/tr/bist-sirketler", "/tr/yatirim-fonlari", "/tr/portfoy-yonetim-sirketleri"):
            try:
                r = requests.get("https://www.kap.org.tr" + sayfa, headers=h, timeout=30)
            except Exception as e:  # noqa: BLE001
                ornek[sayfa] = f"hata {str(e)[:80]}"
                continue
            ornek[sayfa] = f"{r.status_code} {len(r.text)}"
            betikler |= set(re.findall(r'(/_next/static/[^"\\ ]+?\.js)', r.text))
            yollar |= set(re.findall(r'["\'`](/?(?:tr/)?api/[A-Za-z0-9_\-/${}.?=&]+)', r.text))
            if sayfa == "/tr/bist-sirketler":
                i = r.text.find("THYAO")
                out["kap_sirket_ornek"] = r.text[max(0, i - 700) : i + 500] if i >= 0 else "THYAO yok"
        toplam = 0
        for src in sorted(betikler)[:220]:
            try:
                js = requests.get("https://www.kap.org.tr" + src, headers=h, timeout=30).text
            except Exception:  # noqa: BLE001, PERF203
                continue
            toplam += len(js)
            for e in re.finditer(r'["\'`](/?(?:tr/)?api/[A-Za-z0-9_\-/${}.?=&]+)', js):
                yollar.add(e.group(1))
            for e in re.finditer(r"byCriteria|memberDisclosureQuery|disclosureClass", js):
                if len(out.setdefault("kap_baglam", [])) < 6:
                    out["kap_baglam"].append(js[max(0, e.start() - 500) : e.end() + 900])
            if toplam > 40_000_000:
                break
        out["kap_sayfalar"] = ornek
        out["kap_betik"] = {"sayi": len(betikler), "bayt": toplam}
        out["kap_api"] = sorted(yollar)[:500]
    except Exception as e:  # noqa: BLE001
        out["kap_hata"] = str(e)[:200]
    return out


# --- KAP bildirim sorgusu ----------------------------------------------------------------------
KAP_API = "https://www.kap.org.tr/tr/api"
KAP_KONU_DESEN = r"pay al[ıi]m sat[ıi]m|geri al[ıi]n|sermaye art[ıi]r[ıi]m|bedelsiz|bedelli|k[aâ]r pay[ıi]|halka arz|yeni i[sş] ili[sş]kisi|finansal rapor|birle[sş]me|tedbir|i[sş]lem yasa"


def _kap_oturum() -> requests.Session:
    o = requests.Session()
    o.headers.update({"User-Agent": TARAYICI, "Accept": "application/json, text/plain, */*", "Accept-Language": "tr-TR,tr;q=0.9",
                      "Content-Type": "application/json", "Origin": "https://www.kap.org.tr", "Referer": "https://www.kap.org.tr/tr/bildirim-sorgu"})  # fmt: skip
    try:
        o.get("https://www.kap.org.tr/tr/bildirim-sorgu", timeout=40)
    except Exception:  # noqa: BLE001
        pass
    return o


def _kap_govde(bas: date, bit: date, fmt: str, uye_tipi: str = "IGS", sinif: str = "", konular: list[str] | None = None) -> dict:
    return {"fromDate": bas.strftime(fmt), "toDate": bit.strftime(fmt), "memberType": uye_tipi, "mkkMemberOidList": [], "inactiveMkkMemberOidList": [],
            "disclosureClass": sinif, "subjectList": konular or [], "isLate": "", "mainSector": "", "sector": "", "subSector": "", "marketOid": "", "index": "",
            "bdkReview": "", "bdkMemberOidList": [], "year": "", "term": "", "ruleType": "", "period": "", "fromSrc": False, "srcCategory": "", "disclosureIndexList": []}  # fmt: skip


def _metin(html: str) -> str:
    """HTML'den düz metin (betik/stil atılır, etiketler boşluk olur)."""
    import html as _html

    t = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", html)
    t = re.sub(r"(?s)<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", _html.unescape(t)).strip()


def _kap_iste(o: requests.Session, yontem: str, url: str, sayac: dict, govde: dict | None = None, bekle: float = 1.2, deneme: int = 4) -> requests.Response | None:
    """KAP isteği: istekler arası bekleme, 200 dışı yanıtta artan beklemeyle yeniden deneme; durum kodları `sayac`ta sayılır."""
    for i in range(deneme):
        try:
            r = o.post(url, data=json.dumps(govde), timeout=120) if yontem == "POST" else o.get(url, timeout=60)
        except Exception as e:  # noqa: BLE001
            sayac["hata"] = sayac.get("hata", 0) + 1
            sayac.setdefault("hata_ornek", str(e)[:120])
            time.sleep(15 * (i + 1))
            continue
        sayac[str(r.status_code)] = sayac.get(str(r.status_code), 0) + 1
        if r.status_code == 200:
            time.sleep(bekle)
            return r
        sayac.setdefault(f"ornek_{r.status_code}", r.text[:160].replace("\n", " "))
        time.sleep(20 * (i + 1))
    return None


def kap_bildirim(bas: date, bit: date, pencere_gun: int = 2, detay_sinir: int = 1800, sure_siniri_dk: float = 75) -> tuple[dict[str, pd.DataFrame], dict]:
    """KAP bildirim sorgusu (işlem gören şirketlerin özel durum açıklamaları): seçili konularda 2024→bugün liste ve
    pay alım satım / halka arzda %5 üstü alım bildirimlerinin metni. Gövde biçimi sitenin kendi sorgu sayfasından alınmıştır.
    Site hız sınırı uyguladığı için istekler yavaş ve yeniden denemeli gider; süre sınırı dolarsa eldeki kısım yazılır."""
    t0 = time.time()
    rapor: dict[str, Any] = {}
    sayac: dict[str, Any] = {}
    o = _kap_oturum()
    tablolar: dict[str, pd.DataFrame] = {}
    parcalar: list[pd.DataFrame] = []
    ham_satir = 0
    en_buyuk = 0
    bos_pencere = 0
    d = bit  # yeniden eskiye: süre biterse en güncel dönem elde kalsın
    while d >= bas and (time.time() - t0) / 60 < sure_siniri_dk * 0.6:
        b = max(bas, d - timedelta(days=pencere_gun - 1))
        r = _kap_iste(o, "POST", f"{KAP_API}/disclosure/members/byCriteria", sayac, _kap_govde(b, d, "%Y-%m-%d", "IGS", "ODA"))
        v = r.json() if r is not None and r.text[:1] == "[" else None
        if v is None:
            bos_pencere += 1
        elif v:
            ham_satir += len(v)
            en_buyuk = max(en_buyuk, len(v))
            df = pd.DataFrame(v)
            if "subject" in df.columns:
                df = df[df["subject"].astype(str).str.lower().str.contains(KAP_KONU_DESEN, regex=True)]
            if len(df):
                parcalar.append(df)
        d = b - timedelta(days=1)
    rapor["liste"] = {"ham_satir": ham_satir, "en_buyuk_pencere": en_buyuk, "yanitsiz_pencere": bos_pencere, "en_eski_gun": (d + timedelta(days=1)).isoformat(),
                      "durum": dict(sayac), "sure_dk": round((time.time() - t0) / 60, 1)}  # fmt: skip
    if not parcalar:
        return tablolar, rapor
    L = pd.concat(parcalar, ignore_index=True)
    for c in L.columns:
        if L[c].map(lambda v: isinstance(v, (list, dict))).any():
            L[c] = L[c].map(lambda v: json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict)) else v)
    L = L.drop_duplicates("disclosureIndex") if "disclosureIndex" in L.columns else L
    tablolar["kap_bildirimler"] = L
    rapor["liste"].update({"satir": int(len(L)), "konu": L["subject"].astype(str).value_counts().head(25).to_dict()})
    # ayrıntı metni: önce halka arzda %5 üstü alanlar ve fon/portföy şirketlerinin pay alım satımları, sonra diğer pay alım satımlar
    konu = L["subject"].astype(str).str.lower()
    unvan = L["kapTitle"].astype(str).str.upper()
    oncelik = pd.Series(9, index=L.index)
    oncelik[konu.str.contains(r"pay al[ıi]m sat[ıi]m", regex=True)] = 2
    oncelik[konu.str.contains(r"pay al[ıi]m sat[ıi]m", regex=True) & unvan.str.contains(r"PORTF|FON|YATIRIM ORTAKLI|G[İI]R[İI][ŞS][İI]M", regex=True)] = 1
    oncelik[konu.str.contains(r"% ?5", regex=True)] = 0
    secim = L[oncelik < 9].assign(_o=oncelik[oncelik < 9]).sort_values(["_o", "disclosureIndex"], ascending=[True, False])
    rapor["detay_aday"] = {str(k): int(v) for k, v in secim["_o"].value_counts().sort_index().items()}
    sayac2: dict[str, Any] = {}
    satir = []
    o.headers.update({"Accept": "text/html,application/xhtml+xml"})
    o.headers.pop("Content-Type", None)
    for i, (idx, onc) in enumerate(zip(secim["disclosureIndex"].astype(str), secim["_o"])):
        if i >= detay_sinir or (time.time() - t0) / 60 > sure_siniri_dk:
            break
        r = _kap_iste(o, "GET", f"https://www.kap.org.tr/tr/Bildirim/{idx}", sayac2, bekle=0.9, deneme=2)
        satir.append({"disclosureIndex": idx, "oncelik": int(onc), "durum": r.status_code if r is not None else -1, "metin": _metin(r.text)[:12000] if r is not None else ""})
        if i % 100 == 0:
            print(f"[kap-detay] {i}/{min(len(secim), detay_sinir)} {sayac2}", flush=True)
    if satir:
        tablolar["kap_pay_detay"] = pd.DataFrame(satir)
        rapor["detay"] = {"satir": len(satir), "tamam": sum(1 for x in satir if x["durum"] == 200), "durum": dict(sayac2),
                          "ornek": next((x["metin"][:700] for x in satir if x["durum"] == 200), "")}  # fmt: skip
    rapor["toplam_sure_dk"] = round((time.time() - t0) / 60, 1)
    return tablolar, rapor


def _html_tablo(html: str) -> pd.DataFrame:
    """Tek bir <table> parçasından satırlar (başlık + gövde); hücreler düz metin."""
    satirlar = []
    for tr in re.findall(r"(?is)<tr[^>]*>(.*?)</tr>", html):
        h = [_metin(c) for c in re.findall(r"(?is)<t[hd][^>]*>(.*?)</t[hd]>", tr)]
        if h:
            satirlar.append(h)
    if len(satirlar) < 2:
        return pd.DataFrame()
    bas = satirlar[0]
    govde = [s for s in satirlar[1:] if len(s) == len(bas)]
    return pd.DataFrame(govde, columns=bas)


def isy_ek() -> tuple[dict[str, pd.DataFrame], dict]:
    """İş Yatırım ek kaynakları: (a) Temel Değerler sayfasındaki yabancı oranları tablosu (güncel kesit) ve sayfanın tarih
    parametresi mantığı (betik bağlamı rapora), (b) sektör endekslerinin uzun dönem günlük geçmişi (IndexHistoricalAll)."""
    rapor: dict[str, Any] = {}
    tablolar: dict[str, pd.DataFrame] = {}
    h = {"User-Agent": TARAYICI, "Accept-Language": "tr-TR,tr;q=0.9"}
    sayfa = "https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Temel-Degerler-Ve-Oranlar.aspx"
    try:
        r = requests.get(sayfa, headers=h, timeout=60)
        html = r.text
        i = html.find('id="yabanciOranlarUC"')
        if i >= 0:
            j = html.find("</table>", i)
            T = _html_tablo(html[i:j])
            if not T.empty:
                T.insert(0, "cekilme", date.today().isoformat())
                tablolar["yabanci_oran_guncel"] = T
                rapor["yabanci_tablo"] = {"satir": int(len(T)), "sutun": list(T.columns), "ornek": T.head(2).to_dict(orient="records"),
                                          "tarih_ozniteligi": re.findall(r'data-start="([^"]*)" data-end="([^"]*)"', html[i : i + 600])}  # fmt: skip
        betik = []
        for m in re.finditer(r"(?is)<script[^>]*>(.*?)</script>", html):
            govde = m.group(1)
            if re.search(r"(?i)yabanc|getUrlVars|data-start|XHR", govde):
                betik.append(re.sub(r"\s+", " ", govde)[:5000])
        rapor["yabanci_betik"] = betik[:6]
        rapor["betik_kaynak"] = [x for x in re.findall(r'<script[^>]+src="([^"]+)"', html) if "isyatirim" in x or x.startswith("/")][:40]
    except Exception as e:  # noqa: BLE001
        rapor["yabanci_hata"] = str(e)[:200]
    # tarih parametresi denemeleri: sayfa ve bilinen XHR uç noktası
    try:
        denemeler = []
        for u in (sayfa + "?startdate=02-01-2026&enddate=30-01-2026", sayfa + "?baslangic=02-01-2026&bitis=30-01-2026", sayfa + "?start=02-01-2026&end=30-01-2026"):
            r = requests.get(u, headers=h, timeout=60)
            denemeler.append({"url": u[-60:], "durum": r.status_code, "tarih": re.findall(r'data-start="([^"]*)" data-end="([^"]*)"', r.text)[:3]})
        o = requests.Session()
        o.headers.update({**h, "Accept": "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/json; charset=UTF-8", "Referer": sayfa})
        for yol in ("StockInfo/CompanyInfoAjax.aspx/GetYabanciOranlarXHR", "Common/Data.aspx/YabanciOranlarXHR", "StockInfo/CompanyInfoAjax.aspx/GetYabanciOranlar"):
            for govde in ({"baslangicTarih": "02-01-2026", "bitisTarih": "30-01-2026", "sektor": "", "endeks": "", "hisse": ""},
                          {"startDate": "02-01-2026", "endDate": "30-01-2026", "sector": ""},
                          {"baslangicTarihi": "02-01-2026", "bitisTarihi": "30-01-2026", "sektor": None, "endeks": "09", "hisse": None}):
                r = o.post(f"https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/{yol}", data=json.dumps(govde), timeout=40)
                denemeler.append({"yol": yol[-34:], "govde": list(govde)[:2], "durum": r.status_code, "ornek": r.text[:200].replace("\n", " ")})
        rapor["tarih_denemeleri"] = denemeler
    except Exception as e:  # noqa: BLE001
        rapor["deneme_hata"] = str(e)[:200]
    # sektör endeksleri uzun dönem
    try:
        parcalar = []
        hatalar = {}
        for e in ENDEKSLER:
            try:
                r = requests.get("https://www.isyatirim.com.tr/_Layouts/15/IsYatirim.Website/Common/ChartData.aspx/IndexHistoricalAll",
                                 params={"period": "1440", "from": "20100101000000", "to": date.today().strftime("%Y%m%d") + "235959", "endeks": e}, headers=h, timeout=60)  # fmt: skip
                veri = r.json().get("data", []) if r.status_code == 200 else []
                if veri:
                    df = pd.DataFrame(veri, columns=["zaman", "kapanis"][: len(veri[0])] if len(veri[0]) == 2 else None)
                    df = df.iloc[:, :2]
                    df.columns = ["zaman", "kapanis"]
                    df["tarih"] = pd.to_datetime(pd.to_numeric(df["zaman"], errors="coerce"), unit="ms").dt.strftime("%Y-%m-%d")
                    df.insert(0, "endeks", e)
                    parcalar.append(df[["endeks", "tarih", "kapanis"]].drop_duplicates(["endeks", "tarih"], keep="last"))
                else:
                    hatalar[e] = f"HTTP {r.status_code} {r.text[:60]}"
            except Exception as ex:  # noqa: BLE001
                hatalar[e] = str(ex)[:80]
            time.sleep(0.3)
        if parcalar:
            E = pd.concat(parcalar, ignore_index=True)
            tablolar["endeks_gunluk"] = E
            o2 = E.groupby("endeks")["tarih"].agg(["min", "max", "count"])
            rapor["endeks"] = {"endeks": int(E["endeks"].nunique()), "satir": int(len(E)), "ornek": o2.head(8).reset_index().to_dict(orient="records"), "hata": dict(list(hatalar.items())[:10])}
        else:
            rapor["endeks"] = {"hata": dict(list(hatalar.items())[:6])}
    except Exception as e:  # noqa: BLE001
        rapor["endeks_hata"] = str(e)[:200]
    return tablolar, rapor


def kesif2() -> dict:
    """İkinci keşif: TEFAS'ın yeni API yolları ve İş Yatırım'da yabancı payı sayfasının adresi."""
    out: dict[str, Any] = {}
    h = {"User-Agent": TARAYICI, "Accept-Language": "tr-TR,tr;q=0.9"}
    try:
        yollar: set[str] = set()
        ornek = {}
        for sayfa in ("https://www.tefas.gov.tr/", "https://www.tefas.gov.tr/TarihselVeriler.aspx", "https://www.tefas.gov.tr/FonKarsilastirma.aspx", "https://fundturkey.com.tr/"):
            try:
                r = requests.get(sayfa, headers=h, timeout=40)
            except Exception as e:  # noqa: BLE001
                ornek[sayfa] = f"hata {str(e)[:80]}"
                continue
            ornek[sayfa] = f"{r.status_code} {len(r.text)} {r.url}"
            metinler = [r.text]
            taban = "/".join(r.url.split("/")[:3])
            for src in re.findall(r'<script[^>]+src="([^"]+)"', r.text)[:50]:
                u = src if src.startswith("http") else taban + ("" if src.startswith("/") else "/") + src
                if taban.split("//")[1] not in u:
                    continue
                try:
                    metinler.append(requests.get(u, headers=h, timeout=30).text)
                except Exception:  # noqa: BLE001, PERF203
                    continue
            for m in metinler:
                yollar |= set(re.findall(r'["\'`]((?:https?://[a-z0-9.\-]+)?/?api/[A-Za-z0-9_\-/${}.?=&]+)', m))
                for e in re.finditer(r"BindHistory\w+|fonkod|bastarih", m):
                    if len(out.setdefault("tefas_baglam", [])) < 5:
                        out["tefas_baglam"].append(m[max(0, e.start() - 400) : e.end() + 700].replace("\n", " "))
        out["tefas_sayfalar"] = ornek
        out["tefas_api"] = sorted(yollar)[:300]
    except Exception as e:  # noqa: BLE001
        out["tefas_hata"] = str(e)[:200]
    try:
        baglanti: set[str] = set()
        for sayfa in ("https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/default.aspx", "https://www.isyatirim.com.tr/tr-tr/analiz/Sayfalar/default.aspx",
                      "https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Temel-Degerler-Ve-Oranlar.aspx"):  # fmt: skip
            try:
                r = requests.get(sayfa, headers=h, timeout=40)
            except Exception as e:  # noqa: BLE001
                out.setdefault("isy_sayfalar", {})[sayfa[-50:]] = f"hata {str(e)[:60]}"
                continue
            out.setdefault("isy_sayfalar", {})[sayfa[-50:]] = f"{r.status_code} {len(r.text)}"
            for b in re.findall(r'href="([^"]+)"', r.text):
                if re.search(r"(?i)abanc|takas|yatirimci|oran", b):
                    baglanti.add(b[:160])
            for e in re.finditer(r"(?i)yabanc[ıi]\s*oran", r.text):
                if len(out.setdefault("isy_baglam", [])) < 4:
                    out["isy_baglam"].append(r.text[max(0, e.start() - 300) : e.end() + 300].replace("\n", " "))
        out["isy_baglanti"] = sorted(baglanti)[:80]
    except Exception as e:  # noqa: BLE001
        out["isy_hata"] = str(e)[:200]
    return out


def hisse_saatlik(hisseler: list[str], gun: int = 725, paralel: int = 4) -> tuple[pd.DataFrame, dict]:
    """Payların ham saatlik çubukları (Yahoo'nun kendi ızgarası: 09:30, 10:30 ... 17:30; ilk çubuk açılış seansını ve
    10:00–10:30'u içerir). `veri/saatlik` dosyaları seans süzgeci yüzünden 09:30 çubuğunu içermez; saat-içi analiz bunu kullanır."""
    df, r = seri_saatlik([f"{h}.IS" for h in hisseler], gun=gun, paralel=paralel)
    if not df.empty:
        df["sembol"] = df["sembol"].str.replace(".IS", "", regex=False)
        df = df.rename(columns={"sembol": "hisse"})
    return df, r


def saatlik_hisse_sec(tv: pd.DataFrame, adet: int = 250, ek: list[str] | None = None) -> list[str]:
    """Saatlik çekilecek paylar: piyasa değerine göre ilk `adet` + verilen ek liste (ör. mevcut saatlik evren)."""
    if tv.empty:
        return sorted(set(ek or []))
    d = tv[tv["type"].astype(str).str.lower() == "stock"].copy()
    d["pd"] = pd.to_numeric(d["market_cap_basic"], errors="coerce")
    ust = [str(h).upper() for h in d.sort_values("pd", ascending=False)["hisse"].head(adet)]
    return sorted({h for h in ust + [e.upper() for e in (ek or [])] if h not in HARIC})


# --- toplu -------------------------------------------------------------------------------------
TUM_KAYNAKLAR = ("tv", "yahoo", "isy", "mali", "seri", "saatlik", "hisse_saatlik", "yabanci", "tefas", "kap", "kesif", "kesif2", "kap_bildirim", "isy_ek")


def ag_veri_cek(klasor: str | Path, bas: date, bit: date | None = None, kaynaklar: tuple[str, ...] = TUM_KAYNAKLAR, paralel: int = 6,
                uzun_bas: date = date(2010, 1, 1), hisseler: list[str] | None = None, yedek_liste: str | Path = "dosya_kaynak/bist_tum.json") -> dict:
    """Seçili kaynakları çekip `klasor` altına yazar. Hisse listesi: verilen liste → TradingView taraması → yedek dosya."""
    bit = bit or date.today()
    klasor = Path(klasor)
    klasor.mkdir(parents=True, exist_ok=True)
    rapor_yolu = klasor / "_cekim_raporu.json"
    rapor: dict[str, Any] = json.loads(rapor_yolu.read_text(encoding="utf-8")).get("rapor", {}) if rapor_yolu.exists() else {}
    t0 = time.time()

    def adim(ad: str, islev) -> None:
        t = time.time()
        try:
            rapor[ad] = islev()
        except Exception as e:  # noqa: BLE001
            rapor[ad] = {"hata": str(e)[:300]}
        rapor[ad]["sure_sn"] = round(time.time() - t, 1)
        rapor[ad]["zaman"] = datetime.now().isoformat(timespec="minutes")
        print(f"== {ad}: {json.dumps(rapor[ad], ensure_ascii=False, default=str)[:700]}", flush=True)
        rapor_yolu.write_text(json.dumps({"zaman": datetime.now().isoformat(timespec="minutes"), "rapor": rapor}, ensure_ascii=False, indent=1, default=str), encoding="utf-8")

    liste: list[str] = [h.strip().upper() for h in (hisseler or []) if h.strip() and h.strip().upper() not in HARIC]

    def _tv() -> dict:
        nonlocal liste
        df, r = tv_tarama()
        if not df.empty:
            df.to_csv(klasor / "tv_tarama.csv", index=False)
            if not liste:
                liste = hisse_listesi(df)
            r["hisse_listesi"] = len(liste)
        return r

    if "tv" in kaynaklar:
        adim("tv", _tv)
    if not liste:
        if (klasor / "tv_tarama.csv").exists():
            liste = hisse_listesi(pd.read_csv(klasor / "tv_tarama.csv"))
        if not liste and Path(yedek_liste).exists():
            liste = [h for h in json.loads(Path(yedek_liste).read_text(encoding="utf-8")).get("kodlar", []) if h not in HARIC]
    (klasor / "_hisseler.txt").write_text(",".join(liste), encoding="utf-8")
    print(f"hisse listesi: {len(liste)}", flush=True)

    def _yahoo() -> dict:
        df, r = gunluk_panel(liste, bas, paralel=min(paralel, 4))
        if not df.empty:
            _yaz(df, klasor / "gunluk_panel.csv.gz")
        return r

    def _isy() -> dict:
        df, r = isy_panel(liste, bas, bit, paralel=paralel)
        if not df.empty:
            _yaz(df, klasor / "isy_panel.csv.gz")
        return r

    def _mali() -> dict:
        df, r = mali_panel(liste, bas, bit, paralel=paralel)
        if not df.empty:
            _yaz(df, klasor / "mali_panel.csv.gz")
        return r

    def _seri() -> dict:
        df, r = seri_gunluk([f"{e}.IS" for e in ENDEKSLER] + MADEN_KURESEL, uzun_bas)
        if not df.empty:
            _yaz(df, klasor / "seriler_gunluk.csv.gz")
        return r

    def _saatlik() -> dict:
        df, r = seri_saatlik(SAATLIK)
        if not df.empty:
            _yaz(df, klasor / "seriler_saatlik.csv.gz")
        return r

    def _yabanci() -> dict:
        df, r = yabanci_panel(bas, bit)
        if not df.empty:
            _yaz(df, klasor / "yabanci_oran.csv.gz")
        return r

    def _tefas() -> dict:
        tablolar, r = tefas_cek(bas, bit)
        for ad, df in tablolar.items():
            _yaz(df, klasor / f"{ad}.csv.gz")
        return r

    def _hisse_saatlik() -> dict:
        tv = pd.read_csv(klasor / "tv_tarama.csv") if (klasor / "tv_tarama.csv").exists() else pd.DataFrame()
        mevcut = sorted({p.name.split(".")[0] for p in (klasor.parent / "saatlik").glob("*.IS_1h.csv")} - {"XU100"})
        secim = saatlik_hisse_sec(tv, 250, mevcut) if not tv.empty else (mevcut or liste[:250])
        df, r = hisse_saatlik(secim)
        if not df.empty:
            _yaz(df, klasor / "hisse_saatlik.csv.gz")
        r["secilen"] = len(secim)
        r["hata"] = dict(list(r.get("hata", {}).items())[:10])
        return r

    def _kap_bildirim() -> dict:
        tablolar, r = kap_bildirim(bas, bit)
        for ad2, df in tablolar.items():
            _yaz(df, klasor / f"{ad2}.csv.gz")
        return r

    def _isy_ek() -> dict:
        tablolar, r = isy_ek()
        for ad2, df in tablolar.items():
            _yaz(df, klasor / f"{ad2}.csv.gz")
        return r

    for ad, islev in (("kesif", kesif), ("kesif2", kesif2), ("isy_ek", _isy_ek), ("kap_bildirim", _kap_bildirim), ("seri", _seri), ("saatlik", _saatlik), ("yabanci", _yabanci), ("kap", kap_sonda), ("tefas", _tefas),
                      ("yahoo", _yahoo), ("hisse_saatlik", _hisse_saatlik), ("isy", _isy), ("mali", _mali)):  # fmt: skip
        if ad in kaynaklar:
            if ad in ("yahoo", "isy", "mali") and not liste:
                rapor[ad] = {"hata": "hisse listesi boş"}
                continue
            adim(ad, islev)
    rapor["_toplam"] = {"sure_dk": round((time.time() - t0) / 60, 1), "hisse": len(liste)}
    rapor_yolu.write_text(json.dumps({"zaman": datetime.now().isoformat(timespec="minutes"), "rapor": rapor}, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    print("ÖZET", json.dumps(rapor["_toplam"], ensure_ascii=False))
    return rapor
