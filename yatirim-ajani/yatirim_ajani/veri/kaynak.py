"""Fiyat ve temel veri kaynakları.

Her kaynak aynı biçimde çubuk (OHLCV) döndürür: saat dilimli zaman damgası dizinli, sütunları
`acilis, yuksek, dusuk, kapanis, hacim` olan bir DataFrame. Zaman damgası çubuğun BAŞLANGICIDIR.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Protocol

import numpy as np
import pandas as pd

SUTUNLAR = ["acilis", "yuksek", "dusuk", "kapanis", "hacim"]
_INGILIZCE = {"Open": "acilis", "High": "yuksek", "Low": "dusuk", "Close": "kapanis", "Volume": "hacim"}


def aralik_suresi(aralik: str) -> pd.Timedelta:
    """'1m', '5m', '15m', '1h', '1d' gibi aralıkları süreye çevirir."""
    birimler = {"m": "min", "h": "h", "d": "D"}
    sayi, birim = aralik[:-1], aralik[-1]
    if birim not in birimler or not sayi.isdigit():
        raise ValueError(f"Geçersiz aralık: {aralik!r} (örnek: 1m, 5m, 1h, 1d)")
    return pd.Timedelta(int(sayi), unit=birimler[birim])


def bos_cubuklar(saat_dilimi: str = "UTC") -> pd.DataFrame:
    return pd.DataFrame(
        columns=SUTUNLAR, index=pd.DatetimeIndex([], tz=saat_dilimi, name="zaman"), dtype=float
    )


class VeriKaynagi(Protocol):
    def cubuklar(
        self, sembol: str, baslangic: datetime, bitis: datetime, aralik: str = "1d"
    ) -> pd.DataFrame: ...

    def temel(self, sembol: str) -> dict[str, Any]:
        """Şirketin ANLIK temel verileri (çarpanlar, bilanço özeti). Geçmişe dönük değildir."""
        ...


class YahooKaynak:
    """Yahoo Finance (yfinance) üzerinden ücretsiz veri.

    Sınırlar: 1 dakikalık veri yalnız son ~7 gün, gün içi veri son ~60 gün için gelir; veri
    gecikmeli olabilir. Gerçek dakika seviyesi işlem için aracı kurumunuzun canlı verisini bağlayın.
    """

    def __init__(self) -> None:
        try:
            import yfinance  # noqa: F401
        except ImportError as hata:  # pragma: no cover - ortam bağımlı
            raise RuntimeError("yfinance kurulu değil: pip install yfinance") from hata

    def cubuklar(
        self, sembol: str, baslangic: datetime, bitis: datetime, aralik: str = "1d"
    ) -> pd.DataFrame:
        import yfinance as yf

        df = yf.download(
            sembol,
            start=baslangic,
            end=bitis,
            interval=aralik,
            auto_adjust=True,
            progress=False,
            multi_level_index=False,
        )
        if df is None or df.empty:
            return bos_cubuklar()
        df = df.rename(columns=_INGILIZCE)[SUTUNLAR].astype(float)
        if df.index.tz is None:
            df.index = df.index.tz_localize("UTC")
        df.index.name = "zaman"
        return df.dropna()

    def temel(self, sembol: str) -> dict[str, Any]:
        import yfinance as yf

        bilgi = yf.Ticker(sembol).info or {}
        anahtarlar = [
            "longName", "sector", "industry", "marketCap", "currency", "trailingPE", "forwardPE",
            "priceToBook", "enterpriseToEbitda", "profitMargins", "returnOnEquity",
            "debtToEquity", "revenueGrowth", "earningsGrowth", "dividendYield", "freeCashflow",
            "totalCash", "totalDebt", "beta", "fiftyTwoWeekHigh", "fiftyTwoWeekLow",
            "targetMeanPrice", "recommendationKey", "numberOfAnalystOpinions",
        ]  # fmt: skip
        return {k: bilgi.get(k) for k in anahtarlar if bilgi.get(k) is not None}


class CsvKaynak:
    """Kendi verileriniz: `klasor/SEMBOL_ARALIK.csv` (ör. `THYAO.IS_1d.csv`).

    Sütunlar: zaman + acilis/yuksek/dusuk/kapanis/hacim (ya da Open/High/Low/Close/Volume).
    Matriks, Foreks veya aracı kurum dışa aktarımlarını bu biçime çevirip kullanabilirsiniz.
    """

    def __init__(self, klasor: str | Path, saat_dilimi: str = "Europe/Istanbul") -> None:
        self.klasor = Path(klasor)
        self.saat_dilimi = saat_dilimi

    def cubuklar(
        self, sembol: str, baslangic: datetime, bitis: datetime, aralik: str = "1d"
    ) -> pd.DataFrame:
        yol = self.klasor / f"{sembol}_{aralik}.csv"
        if not yol.exists():
            return bos_cubuklar(self.saat_dilimi)
        df = pd.read_csv(yol).rename(columns=_INGILIZCE)
        zaman_sutunu = next(c for c in df.columns if c.lower() in ("zaman", "date", "datetime"))
        df.index = pd.DatetimeIndex(pd.to_datetime(df.pop(zaman_sutunu)), name="zaman")
        if df.index.tz is None:
            df.index = df.index.tz_localize(self.saat_dilimi)
        df = df[SUTUNLAR].astype(float).sort_index()
        return df[(df.index >= pd.Timestamp(baslangic)) & (df.index < pd.Timestamp(bitis))]

    def temel(self, sembol: str) -> dict[str, Any]:
        yol = self.klasor / f"{sembol}_temel.json"
        if yol.exists():
            import json

            return json.loads(yol.read_text(encoding="utf-8"))
        return {}


class SentetikKaynak:
    """İnternetsiz deneme ve testler için tekrarlanabilir rastgele yürüyüş verisi.

    Gerçek piyasa DEĞİLDİR; yalnızca boru hattının uçtan uca çalıştığını göstermek içindir.
    """

    BASLANGIC = pd.Timestamp("2018-01-01")

    def __init__(self, saat_dilimi: str = "Europe/Istanbul", tohum: int = 7) -> None:
        self.saat_dilimi = saat_dilimi
        self.tohum = tohum
        self._gunluk_onbellek: dict[str, pd.DataFrame] = {}

    def _rng(self, *parcalar: object) -> np.random.Generator:
        anahtar = "|".join(str(p) for p in (self.tohum, *parcalar)).encode()
        return np.random.default_rng(int(hashlib.sha256(anahtar).hexdigest()[:16], 16))

    def _gunluk(self, sembol: str) -> pd.DataFrame:
        if sembol in self._gunluk_onbellek:
            return self._gunluk_onbellek[sembol]
        rng = self._rng(sembol)
        gunler = pd.bdate_range(self.BASLANGIC, "2030-12-31", tz=self.saat_dilimi, name="zaman")
        n = len(gunler)
        egilim = rng.uniform(-0.0002, 0.0008)
        oynaklik = rng.uniform(0.012, 0.03)
        getiriler = rng.normal(egilim, oynaklik, n)
        kapanis = rng.uniform(20, 300) * np.exp(np.cumsum(getiriler))
        acilis = np.r_[kapanis[0], kapanis[:-1]] * np.exp(rng.normal(0, oynaklik / 4, n))
        yuksek = np.maximum(acilis, kapanis) * (1 + np.abs(rng.normal(0, oynaklik / 2, n)))
        dusuk = np.minimum(acilis, kapanis) * (1 - np.abs(rng.normal(0, oynaklik / 2, n)))
        hacim = rng.lognormal(13, 0.5, n)
        df = pd.DataFrame(
            {"acilis": acilis, "yuksek": yuksek, "dusuk": dusuk, "kapanis": kapanis, "hacim": hacim},
            index=gunler,
        )
        self._gunluk_onbellek[sembol] = df
        return df

    def _gun_ici(self, sembol: str, gun: pd.Timestamp, adim: pd.Timedelta) -> pd.DataFrame:
        gunluk = self._gunluk(sembol)
        if gun not in gunluk.index:
            return bos_cubuklar(self.saat_dilimi)
        satir = gunluk.loc[gun]
        zamanlar = pd.date_range(
            gun + pd.Timedelta(hours=10), gun + pd.Timedelta(hours=18), freq=adim, inclusive="left"
        )
        n = len(zamanlar)
        rng = self._rng(sembol, gun.date(), adim)
        # Açılıştan başlayan saf rastgele yürüyüş. Günün kapanışına doğru ÇEKİLMEZ: öyle yapılsaydı
        # gün içi yol günün sonucunu önceden "bilir" ve trend kuralları sahte kâr gösterirdi.
        olcek = max(abs(np.log(satir.yuksek / satir.dusuk)) / 2, 1e-4) / max(np.sqrt(n), 1)
        kapanis = satir.acilis * np.exp(np.cumsum(rng.normal(0, olcek, n)))
        acilis = np.r_[satir.acilis, kapanis[:-1]]
        sapma = np.abs(rng.normal(0, olcek, n))
        return pd.DataFrame(
            {
                "acilis": acilis,
                "yuksek": np.maximum(acilis, kapanis) * (1 + sapma),
                "dusuk": np.minimum(acilis, kapanis) * (1 - sapma),
                "kapanis": kapanis,
                "hacim": rng.lognormal(8, 0.6, n),
            },
            index=pd.DatetimeIndex(zamanlar, name="zaman"),
        )

    def cubuklar(
        self, sembol: str, baslangic: datetime, bitis: datetime, aralik: str = "1d"
    ) -> pd.DataFrame:
        bas = pd.Timestamp(baslangic)
        bit = pd.Timestamp(bitis)
        bas = bas.tz_localize(self.saat_dilimi) if bas.tzinfo is None else bas.tz_convert(self.saat_dilimi)
        bit = bit.tz_localize(self.saat_dilimi) if bit.tzinfo is None else bit.tz_convert(self.saat_dilimi)
        adim = aralik_suresi(aralik)
        if adim >= pd.Timedelta(days=1):
            df = self._gunluk(sembol)
        else:
            gunler = pd.bdate_range(bas.normalize(), bit.normalize(), tz=self.saat_dilimi)
            parcalar = [self._gun_ici(sembol, g, adim) for g in gunler]
            df = pd.concat(parcalar) if parcalar else bos_cubuklar(self.saat_dilimi)
        return df[(df.index >= bas) & (df.index < bit)]

    def temel(self, sembol: str) -> dict[str, Any]:
        rng = self._rng(sembol, "temel")
        return {
            "longName": f"Sentetik {sembol}",
            "trailingPE": round(float(rng.uniform(4, 35)), 1),
            "priceToBook": round(float(rng.uniform(0.6, 6)), 2),
            "profitMargins": round(float(rng.uniform(-0.05, 0.3)), 3),
            "debtToEquity": round(float(rng.uniform(10, 180)), 1),
            "revenueGrowth": round(float(rng.uniform(-0.1, 0.5)), 3),
            "not": "Sentetik veri - gerçek şirket bilgisi değildir.",
        }


class OnbellekliKaynak:
    """Bir kaynaktan aralığın tamamını bir kez çeker, sonraki istekleri bellekten keser.

    Geriye dönük testte her adımda yeniden indirmeyi önler. Zaman kilidi bunun ÜSTÜNDE çalışır.
    """

    def __init__(self, kaynak: VeriKaynagi, baslangic: datetime, bitis: datetime) -> None:
        self.kaynak = kaynak
        self.baslangic = baslangic
        self.bitis = bitis
        self._bellek: dict[tuple[str, str], pd.DataFrame] = {}

    def tum(self, sembol: str, aralik: str = "1d") -> pd.DataFrame:
        anahtar = (sembol, aralik)
        if anahtar not in self._bellek:
            self._bellek[anahtar] = self.kaynak.cubuklar(sembol, self.baslangic, self.bitis, aralik)
        return self._bellek[anahtar]

    def cubuklar(
        self, sembol: str, baslangic: datetime, bitis: datetime, aralik: str = "1d"
    ) -> pd.DataFrame:
        df = self.tum(sembol, aralik)
        if df.empty:
            return df
        bas, bit = pd.Timestamp(baslangic), pd.Timestamp(bitis)
        sol = df.index.searchsorted(bas, side="left")
        sag = df.index.searchsorted(bit, side="left")
        return df.iloc[sol:sag]

    def temel(self, sembol: str) -> dict[str, Any]:
        return self.kaynak.temel(sembol)


def kaynak_olustur(ad: str, csv_klasoru: str | None = None) -> VeriKaynagi:
    if ad == "yahoo":
        return YahooKaynak()
    if ad == "csv":
        if not csv_klasoru:
            raise ValueError("CSV kaynağı için --csv-klasoru verin")
        return CsvKaynak(csv_klasoru)
    if ad == "sentetik":
        return SentetikKaynak()
    raise ValueError(f"Bilinmeyen veri kaynağı: {ad}")


def simdi() -> datetime:
    return datetime.now().astimezone()


def gun_once(an: datetime, gun: int) -> datetime:
    return an - timedelta(days=gun)
