"""Sanal hesap defteri: kullanıcıya saatli/fiyatlı emir yazılır, emir GERÇEK çubuklarla dolar.

Kural: emir verildiği anda ileriye dönüktür (pencere gelecekte). Dolum yalnız pencere geçtikten
sonra, o pencerenin 5 dakikalık (yoksa saatlik) çubuklarıyla belirlenir:
  AL limit: pencerede en düşük ≤ limit ise dolar; fiyat = ilk çubuk açılışı limitin altındaysa açılış, değilse limit.
  SAT limit: pencerede en yüksek ≥ limit ise dolar; fiyat = ilk açılış limitin üstündeyse açılış, değilse limit.
  PİYASA: pencerenin ilk çubuğunun açılışı (+ kayma).
Her dolumda tutarın `maliyet_bps`'i (varsayılan 5 bp = binde 0,5) masraf yazılır; komisyonsuz Midas
varsayımıdır, alış-satış farkını temsil eder. Geriye dönük emir yazılamaz: pencere başlangıcı emir
anından önceyse reddedilir.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from pathlib import Path

import pandas as pd

TZ = "Europe/Istanbul"
ADIMLAR = [(20, 0.01), (50, 0.02), (100, 0.05), (250, 0.10), (500, 0.25), (1000, 0.50), (float("inf"), 1.00)]


def fiyat_adimi(fiyat: float) -> float:
    for ust, adim in ADIMLAR:
        if fiyat < ust:
            return adim
    return 1.0


def adima_yuvarla(fiyat: float, yon: str = "asagi") -> float:
    adim = fiyat_adimi(fiyat)
    n = fiyat / adim
    n = int(n + 1e-9) if yon == "asagi" else int(n - 1e-9) + 1
    return round(n * adim, 2)


def pay_hesapla(atr_orani: float, risk_butcesi: float = 0.0035, tavan: float = 0.10) -> float:
    """Pozisyon payı: günlük ATR başına sabit risk (portföyün %0,35'i), tavan %10."""
    if not atr_orani or atr_orani <= 0:
        return 0.0
    return float(min(tavan, risk_butcesi / atr_orani))


@dataclass
class Defter:
    yol: Path
    veri: dict

    @classmethod
    def ac(cls, yol: str | Path) -> "Defter":
        yol = Path(yol)
        if yol.exists():
            return cls(yol, json.loads(yol.read_text(encoding="utf-8")))
        raise FileNotFoundError(f"Defter yok: {yol} (önce `defter-baslat`)")

    @classmethod
    def baslat(cls, yol: str | Path, nakit: float, gun: str, maliyet_bps: float = 5.0, not_: str = "") -> "Defter":
        yol = Path(yol)
        if yol.exists():
            raise FileExistsError(f"Defter zaten var: {yol}")
        d = cls(yol, {
            "baslangic_nakit": float(nakit), "baslangic_gun": gun, "maliyet_bps": maliyet_bps, "nakit": float(nakit),
            "pozisyonlar": {}, "emirler": [], "islemler": [], "degerleme": [], "notlar": [not_] if not_ else [], "sayac": 0,
        })  # fmt: skip
        d.kaydet()
        return d

    def kaydet(self) -> None:
        self.yol.parent.mkdir(parents=True, exist_ok=True)
        self.yol.write_text(json.dumps(self.veri, ensure_ascii=False, indent=1), encoding="utf-8")

    # --- emir -----------------------------------------------------------------------------
    def emir_ver(self, hisse: str, yon: str, adet: int, limit: float | None, gun: str, pencere: str,
                 neden: str, simdi: datetime | None = None) -> dict:
        yon = yon.upper()
        if yon not in ("AL", "SAT"):
            raise ValueError("yon AL ya da SAT olmalı")
        bas_s, bit_s = pencere.split("-")
        bas = pd.Timestamp(f"{gun} {bas_s}", tz=TZ)
        bit = pd.Timestamp(f"{gun} {bit_s}", tz=TZ)
        simdi_ts = pd.Timestamp(simdi or datetime.now()).tz_localize(TZ) if (simdi or datetime.now()).tzinfo is None else pd.Timestamp(simdi)
        if bas <= simdi_ts:
            raise ValueError(f"Geriye dönük emir yok: pencere {bas} şu andan ({simdi_ts}) önce")
        if bit <= bas:
            raise ValueError("pencere sonu başlangıçtan sonra olmalı")
        if adet <= 0:
            raise ValueError("adet pozitif tam sayı olmalı")
        if yon == "SAT":
            elde = self.veri["pozisyonlar"].get(hisse, {}).get("adet", 0)
            bekleyen = sum(e["adet"] for e in self.veri["emirler"] if e["hisse"] == hisse and e["yon"] == "SAT" and e["durum"] == "bekliyor")
            if adet + bekleyen > elde:
                raise ValueError(f"{hisse}: satılacak {adet} + bekleyen {bekleyen} > eldeki {elde}")
        else:
            rezerv = sum(e["adet"] * (e["limit"] or 0) for e in self.veri["emirler"] if e["yon"] == "AL" and e["durum"] == "bekliyor")
            if limit is not None and adet * limit + rezerv > self.veri["nakit"] * 1.001:
                raise ValueError(f"nakit yetersiz: {adet * limit:,.0f} + bekleyen {rezerv:,.0f} > {self.veri['nakit']:,.0f}")
        self.veri["sayac"] += 1
        e = {"id": self.veri["sayac"], "verildi": simdi_ts.isoformat(), "gun": gun, "hisse": hisse.upper(), "yon": yon, "adet": int(adet),
             "limit": None if limit is None else float(limit), "tip": "PIYASA" if limit is None else "LIMIT",
             "pencere": pencere, "durum": "bekliyor", "neden": neden, "dolum": None}  # fmt: skip
        self.veri["emirler"].append(e)
        self.kaydet()
        return e

    def iptal(self, emir_id: int) -> None:
        for e in self.veri["emirler"]:
            if e["id"] == emir_id and e["durum"] == "bekliyor":
                e["durum"] = "iptal"
        self.kaydet()

    # --- dolum ----------------------------------------------------------------------------
    def isle(self, cubuk_getir, simdi: datetime | None = None) -> list[dict]:
        """Penceresi geçmiş bekleyen emirleri gerçek çubuklarla doldurur. `cubuk_getir(hisse, gun) -> DataFrame`
        (dizin yerel saat, sütunlar acilis/yuksek/dusuk/kapanis; 5 dk tercih, yoksa 1 saat)."""
        simdi_ts = pd.Timestamp(simdi or datetime.now())
        simdi_ts = simdi_ts.tz_localize(TZ) if simdi_ts.tzinfo is None else simdi_ts.tz_convert(TZ)
        sonuc = []
        for e in self.veri["emirler"]:
            if e["durum"] != "bekliyor":
                continue
            bas_s, bit_s = e["pencere"].split("-")
            bas = pd.Timestamp(f"{e['gun']} {bas_s}", tz=TZ)
            bit = pd.Timestamp(f"{e['gun']} {bit_s}", tz=TZ)
            if simdi_ts < bit:
                continue  # pencere henüz kapanmadı
            df = cubuk_getir(e["hisse"], e["gun"])
            if df is None or df.empty:
                sonuc.append({**e, "not": "veri yok, bekliyor"})
                continue
            if df.index.tz is None:
                df = df.tz_localize(TZ)
            else:
                df = df.tz_convert(TZ)
            p = df[(df.index >= bas) & (df.index < bit)]
            if p.empty:
                if df.index.max() < bit - pd.Timedelta(minutes=5):
                    sonuc.append({**e, "not": "pencere verisi henüz gelmedi"})
                    continue
                e["durum"] = "dolmadi"
                e["dolum"] = {"not": "pencerede çubuk yok"}
                sonuc.append(e)
                continue
            ilk_acilis = float(p["acilis"].iloc[0])
            fiyat = None
            if e["tip"] == "PIYASA":
                fiyat = ilk_acilis * (1 + (0.0005 if e["yon"] == "AL" else -0.0005))
            elif e["yon"] == "AL" and float(p["dusuk"].min()) <= e["limit"]:
                fiyat = min(ilk_acilis, e["limit"])
            elif e["yon"] == "SAT" and float(p["yuksek"].max()) >= e["limit"]:
                fiyat = max(ilk_acilis, e["limit"])
            if fiyat is None:
                e["durum"] = "dolmadi"
                e["dolum"] = {"en_dusuk": float(p["dusuk"].min()), "en_yuksek": float(p["yuksek"].max()), "not": "limit görülmedi"}
                sonuc.append(e)
                continue
            self._uygula(e, fiyat, str(p.index[0]))
            sonuc.append(e)
        self.kaydet()
        return sonuc

    def _uygula(self, e: dict, fiyat: float, zaman: str) -> None:
        tutar = fiyat * e["adet"]
        masraf = tutar * self.veri["maliyet_bps"] / 1e4
        poz = self.veri["pozisyonlar"]
        if e["yon"] == "AL":
            self.veri["nakit"] -= tutar + masraf
            p = poz.setdefault(e["hisse"], {"adet": 0, "maliyet": 0.0, "giris": e["gun"]})
            yeni_adet = p["adet"] + e["adet"]
            p["maliyet"] = (p["maliyet"] * p["adet"] + fiyat * e["adet"]) / yeni_adet
            p["adet"] = yeni_adet
        else:
            p = poz[e["hisse"]]
            self.veri["nakit"] += tutar - masraf
            kar = (fiyat - p["maliyet"]) * e["adet"] - masraf
            p["adet"] -= e["adet"]
            if p["adet"] == 0:
                poz.pop(e["hisse"])
            e["kar"] = round(kar, 2)
        e["durum"] = "doldu"
        e["dolum"] = {"fiyat": round(fiyat, 4), "zaman": zaman, "tutar": round(tutar, 2), "masraf": round(masraf, 2)}
        self.veri["islemler"].append({"emir": e["id"], "gun": e["gun"], "hisse": e["hisse"], "yon": e["yon"], "adet": e["adet"],
                                      "fiyat": round(fiyat, 4), "masraf": round(masraf, 2), "zaman": zaman})  # fmt: skip

    # --- değerleme ------------------------------------------------------------------------
    def degerle(self, gun: str, kapanis: dict[str, float], xu100: float | None) -> dict:
        hisse_deger = sum(p["adet"] * kapanis[h] for h, p in self.veri["pozisyonlar"].items() if h in kapanis)
        eksik = [h for h in self.veri["pozisyonlar"] if h not in kapanis]
        satir = {"gun": gun, "nakit": round(self.veri["nakit"], 2), "hisse": round(hisse_deger, 2),
                 "toplam": round(self.veri["nakit"] + hisse_deger, 2), "xu100": xu100, "eksik": eksik}  # fmt: skip
        self.veri["degerleme"] = [d for d in self.veri["degerleme"] if d["gun"] != gun] + [satir]
        self.kaydet()
        return satir

    def rapor(self, kapanis: dict[str, float] | None = None) -> str:
        v = self.veri
        kapanis = kapanis or {}
        s = [f"# Defter — başlangıç {v['baslangic_gun']}, {v['baslangic_nakit']:,.0f} TL", ""]
        if v["degerleme"]:
            d = v["degerleme"][-1]
            getiri = d["toplam"] / v["baslangic_nakit"] - 1
            s.append(f"**Son değerleme {d['gun']}:** {d['toplam']:,.0f} TL ({getiri:+.2%}) · nakit {d['nakit']:,.0f} · hisse {d['hisse']:,.0f}")
            ilk = next((x for x in v["degerleme"] if x.get("xu100")), None)
            if ilk and d.get("xu100") and ilk["xu100"]:
                s.append(f"XU100 aynı dönem: {d['xu100'] / ilk['xu100'] - 1:+.2%} (ilk değerleme gününden)")
            s.append("")
        s.append("## Pozisyonlar")
        if not v["pozisyonlar"]:
            s.append("Yok (tamamı nakit).")
        for h, p in v["pozisyonlar"].items():
            son = kapanis.get(h)
            ek = f" · son {son:.2f} · {son / p['maliyet'] - 1:+.2%}" if son else ""
            s.append(f"- {h}: {p['adet']} adet · maliyet {p['maliyet']:.2f} · {p['adet'] * p['maliyet']:,.0f} TL · giriş {p['giris']}{ek}")
        bekleyen = [e for e in v["emirler"] if e["durum"] == "bekliyor"]
        s.append("")
        s.append("## Bekleyen emirler")
        if not bekleyen:
            s.append("Yok.")
        for e in bekleyen:
            lim = "PİYASA" if e["limit"] is None else f"limit {e['limit']:.2f}"
            s.append(f"- #{e['id']} {e['gun']} {e['pencere']} · {e['yon']} {e['hisse']} {e['adet']} adet · {lim} · {e['neden']}")
        son_islem = v["islemler"][-10:]
        if son_islem:
            s.append("")
            s.append("## Son işlemler")
            for i in son_islem:
                s.append(f"- {i['zaman'][:16]} {i['yon']} {i['hisse']} {i['adet']} × {i['fiyat']:.2f} (masraf {i['masraf']:.0f} TL)")
        dolmayan = [e for e in v["emirler"] if e["durum"] == "dolmadi"][-5:]
        if dolmayan:
            s.append("")
            s.append("## Dolmayan emirler (son 5)")
            for e in dolmayan:
                s.append(f"- #{e['id']} {e['gun']} {e['yon']} {e['hisse']} limit {e['limit']}: {e['dolum'].get('not')}"
                         + (f" (gün aralığı {e['dolum'].get('en_dusuk')}–{e['dolum'].get('en_yuksek')})" if e['dolum'].get('en_dusuk') else ""))  # fmt: skip
        return "\n".join(s)


def csv_cubuk_getirici(klasor: str | Path, ek: str = ".IS"):
    """veri/saatlik klasöründen (5 dk tercih, yoksa 1 saat) günün çubuklarını veren işlev."""
    klasor = Path(klasor)

    def getir(hisse: str, gun: str) -> pd.DataFrame | None:
        for aralik in ("5m", "1h"):
            f = klasor / f"{hisse}{ek}_{aralik}.csv"
            if not f.exists():
                continue
            df = pd.read_csv(f, index_col="zaman", parse_dates=True)
            df.index = pd.to_datetime(df.index, utc=True).tz_convert(TZ)
            g = df[df.index.date == pd.Timestamp(gun).date()]
            if not g.empty:
                return g
        return None

    return getir


def gun_kapanislari(klasor: str | Path, gun: str, hisseler: list[str], ek: str = ".IS") -> dict[str, float]:
    getir = csv_cubuk_getirici(klasor, ek)
    out = {}
    for h in hisseler:
        g = getir(h, gun)
        if g is not None and not g.empty:
            out[h] = float(g["kapanis"].iloc[-1])
    return out
