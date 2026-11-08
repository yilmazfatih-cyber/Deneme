"""Saatlik veri seti: çekme, kaymalı saat çubukları, diske önbellek.

Yahoo sınırları (ücretsiz): 1 saatlik çubuk son ~730 gün, 5 dakikalık son ~60 gün, 1 dakikalık
son 7 gün. "2024'ten beri" isteği bu yüzden en fazla ~2 yıl geriye gider; daha eskisi için
ücretli kaynak ya da CSV gerekir (`CsvKaynak`).

Kaymalı saat: Saat çubuğunun 10:00'da değil 10:15 ya da 10:30'da başlaması da denenebilir.
Kaymalar 5 dakikalık veriden üretilir (00, 05, …, 55). Her kayma AYRI bir veri setidir; hangisinin
"daha iyi" olduğuna yalnız eğitim günlerinde bakılır, test günleri bu seçime karışmaz.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

from .kaynak import SUTUNLAR, VeriKaynagi, bos_cubuklar

SEANS_BASI = "10:00"
SEANS_SONU = "18:00"


def seans_ici(df: pd.DataFrame, saat_dilimi: str = "Europe/Istanbul") -> pd.DataFrame:
    """Seans dışı ve hafta sonu çubuklarını atar; dizini yerel saate çevirir."""
    if df.empty:
        return df
    yerel = df.tz_convert(saat_dilimi)
    yerel = yerel[yerel.index.weekday < 5]
    return yerel.between_time(SEANS_BASI, SEANS_SONU, inclusive="left")


def kaymali_saat(bes_dakika: pd.DataFrame, kayma_dk: int) -> pd.DataFrame:
    """5 dakikalık çubuklardan `kayma_dk` dakika kaymış saatlik çubuklar üretir.

    kayma_dk=0 → 10:00-11:00, 11:00-12:00…; kayma_dk=30 → 10:30-11:30… Çubuk zaman damgası
    çubuğun başlangıcıdır; yalnızca tam (12 adet 5 dk) çubuklar tutulur.
    """
    if kayma_dk % 5 or not 0 <= kayma_dk < 60:
        raise ValueError("kayma 0-55 arasında ve 5'in katı olmalı")
    if bes_dakika.empty:
        return bes_dakika
    gruplar = []
    for gun, g in bes_dakika.groupby(bes_dakika.index.date):
        bas = pd.Timestamp(gun, tz=bes_dakika.index.tz) + pd.Timedelta(hours=10, minutes=kayma_dk)
        g = g[g.index >= bas]
        oh = g.resample("1h", origin=bas, label="left", closed="left").agg(
            {"acilis": "first", "yuksek": "max", "dusuk": "min", "kapanis": "last", "hacim": "sum"}
        )
        sayim = g["kapanis"].resample("1h", origin=bas, label="left", closed="left").count()
        gruplar.append(oh[sayim == 12])
    out = pd.concat(gruplar) if gruplar else bos_cubuklar(str(bes_dakika.index.tz))
    out.index.name = "zaman"
    return out[SUTUNLAR].dropna()


def temizle(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    """Haiku'nun (stajyerin) yapacağı temizlik, sabit kurallarla. Rapor sayaçları döndürür."""
    rapor = {"cift_zaman": 0, "sifir_hacim": 0, "gecersiz_fiyat": 0, "buyuk_sicrama": 0}
    if df.empty:
        return df, rapor
    n0 = len(df)
    df = df[~df.index.duplicated(keep="last")].sort_index()
    rapor["cift_zaman"] = n0 - len(df)
    gecersiz = (df["dusuk"] > df["yuksek"]) | (df[["acilis", "yuksek", "dusuk", "kapanis"]] <= 0).any(axis=1)
    rapor["gecersiz_fiyat"] = int(gecersiz.sum())
    df = df[~gecersiz]
    rapor["sifir_hacim"] = int((df["hacim"] <= 0).sum())  # atılmaz, yalnız sayılır
    sicrama = df["kapanis"].pct_change().abs() > 0.15
    rapor["buyuk_sicrama"] = int(sicrama.sum())  # elle inceleme listesi; atılmaz
    return df, rapor


class SaatlikVeriSeti:
    """`klasor/SEMBOL_1h.csv` ve `klasor/SEMBOL_5m.csv` dosyalarını yönetir."""

    def __init__(self, klasor: str | Path, saat_dilimi: str = "Europe/Istanbul") -> None:
        self.klasor = Path(klasor)
        self.saat_dilimi = saat_dilimi

    def yol(self, sembol: str, aralik: str) -> Path:
        return self.klasor / f"{sembol}_{aralik}.csv"

    def kaydet(self, sembol: str, aralik: str, df: pd.DataFrame) -> Path:
        yol = self.yol(sembol, aralik)
        yol.parent.mkdir(parents=True, exist_ok=True)
        eski = self.yukle(sembol, aralik)
        if not eski.empty:
            df = pd.concat([eski, df])
            df = df[~df.index.duplicated(keep="last")].sort_index()
        df.to_csv(yol, index_label="zaman")
        return yol

    def yukle(self, sembol: str, aralik: str) -> pd.DataFrame:
        yol = self.yol(sembol, aralik)
        if not yol.exists():
            return bos_cubuklar(self.saat_dilimi)
        df = pd.read_csv(yol, index_col="zaman", parse_dates=True)
        if df.index.tz is None:
            df.index = df.index.tz_localize("UTC")
        df.index = df.index.tz_convert(self.saat_dilimi)
        df.index.name = "zaman"
        return df[SUTUNLAR].astype(float)

    def cek(
        self,
        kaynak: VeriKaynagi,
        semboller: list[str],
        baslangic: datetime,
        bitis: datetime | None = None,
        bes_dakika: bool = True,
    ) -> dict[str, dict[str, int]]:
        """Her sembol için 1h (ve isteğe bağlı 5m) çeker, temizler, diske ekler. Rapor döndürür."""
        bitis = bitis or datetime.now().astimezone()
        rapor: dict[str, dict[str, int]] = {}
        for s in semboller:
            df = seans_ici(kaynak.cubuklar(s, baslangic, bitis, "1h"), self.saat_dilimi)
            df, r = temizle(df)
            r["satir_1h"] = len(df)
            if not df.empty:
                self.kaydet(s, "1h", df)
            if bes_dakika:
                bes = seans_ici(kaynak.cubuklar(s, bitis - timedelta(days=59), bitis, "5m"), self.saat_dilimi)
                bes, _ = temizle(bes)
                r["satir_5m"] = len(bes)
                if not bes.empty:
                    self.kaydet(s, "5m", bes)
            rapor[s] = r
        return rapor

    def saatlik(self, sembol: str, kayma_dk: int = 0) -> pd.DataFrame:
        """kayma 0 → uzun 1h seti; kayma > 0 → 5m'den üretilen (yalnız son ~60 gün) set."""
        if kayma_dk == 0:
            return self.yukle(sembol, "1h")
        return kaymali_saat(self.yukle(sembol, "5m"), kayma_dk)
