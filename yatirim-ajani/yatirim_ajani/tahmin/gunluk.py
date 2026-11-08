"""Tahmin günlüğü: ajanın olasılıklı tahminlerini kaydeder, vadesi gelince çözer, puanlar.

ILE'nin bulgusu: modeller araştırmada iyi, tahminde zayıf. Bunu ancak ölçerek görebilirsiniz.
Her tez "H hissesi U gün içinde en az E getiri sağlar" önermesine bir olasılık (p) verir.
Vadesi gelince sonuç 1 ya da 0 olur ve şu ölçülür:

* Brier skoru  = ortalama (p - sonuç)^2   (0 mükemmel; hep 0,5 demek 0,25 verir)
* Temel oran Brier'i: hep gerçekleşme sıklığını söyleyen saf tahmincinin skoru. Ajan bunu
  geçemiyorsa tahminleri bilgi taşımıyordur.
* Kalibrasyon: "%70 dediklerinin" yüzde kaçı gerçekleşti?
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta

import pandas as pd

from ..veri.zaman_kilidi import ZamanKilitliVeri


def tahmin_ekle(
    db: sqlite3.Connection,
    tez_id: int | None,
    piyasa: str,
    hisse: str,
    an: datetime,
    ufuk_gun: int,
    giris_fiyati: float,
    esik_getiri: float,
    olasilik: float,
) -> int:
    if not 0.0 <= olasilik <= 1.0:
        raise ValueError("Olasılık 0 ile 1 arasında olmalı")
    vade = an + timedelta(days=ufuk_gun)
    imlec = db.execute(
        """INSERT INTO tahminler (tez_id, piyasa, hisse, olusturma, vade, giris_fiyati,
           esik_getiri, olasilik) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (tez_id, piyasa, hisse, an.isoformat(), vade.isoformat(), giris_fiyati, esik_getiri, olasilik),
    )
    db.commit()
    return int(imlec.lastrowid or 0)


def tahminleri_coz(db: sqlite3.Connection, veri: ZamanKilitliVeri, piyasa_sembol, aralik: str = "1d") -> int:
    """Vadesi `veri.an`'dan önce dolmuş tahminleri, vadedeki kapanış fiyatıyla çözer.

    `piyasa_sembol(piyasa, hisse)` veri kaynağındaki sembolü döndürür.
    """
    satirlar = db.execute(
        "SELECT * FROM tahminler WHERE sonuc IS NULL AND vade <= ?", (veri.an.isoformat(),)
    ).fetchall()
    cozulen = 0
    for t in satirlar:
        vade = pd.Timestamp(t["vade"])
        sembol = piyasa_sembol(t["piyasa"], t["hisse"])
        df = veri.cubuklar(sembol, (vade - pd.Timedelta(days=10)).to_pydatetime(), vade.to_pydatetime(), aralik)
        if df.empty:
            continue
        son = float(df["kapanis"].iloc[-1])
        getiri = son / t["giris_fiyati"] - 1
        db.execute(
            "UPDATE tahminler SET sonuc = ?, gerceklesen_getiri = ?, cozulme = ? WHERE id = ?",
            (int(getiri >= t["esik_getiri"]), getiri, veri.an.isoformat(), t["id"]),
        )
        cozulen += 1
    db.commit()
    return cozulen


@dataclass
class Karne:
    adet: int
    brier: float | None
    temel_oran_brier: float | None
    gerceklesme_orani: float | None
    kalibrasyon: list[tuple[str, int, float, float]]  # (aralık, adet, ort. tahmin, gerçekleşen)

    @property
    def beceri(self) -> float | None:
        """Brier beceri skoru: >0 ise ajan temel orandan iyi, <=0 ise değil."""
        if self.brier is None or not self.temel_oran_brier:
            return None
        return 1 - self.brier / self.temel_oran_brier

    def metin(self) -> str:
        if self.adet == 0:
            return "Henüz vadesi dolmuş tahmin yok."
        satirlar = [
            f"Çözülen tahmin: {self.adet}",
            f"Brier skoru: {self.brier:.4f}  (temel oran: {self.temel_oran_brier:.4f})",
            "Beceri skoru: "
            + ("-" if self.beceri is None else f"{self.beceri:+.3f}")
            + "  (> 0 ise ajan saf tahminciden iyi)",
            f"Gerçekleşme oranı: {self.gerceklesme_orani:.1%}",
            "Kalibrasyon (tahmin aralığı → adet, ortalama tahmin, gerçekleşen):",
        ]
        for aralik, n, ort, gercek in self.kalibrasyon:
            satirlar.append(f"  {aralik}: {n:3d}  tahmin {ort:.0%}  gerçek {gercek:.0%}")
        if self.adet < 30:
            satirlar.append("Not: 30'dan az tahminle bu sayılar güvenilir değildir.")
        return "\n".join(satirlar)


def karne(db: sqlite3.Connection, piyasa: str | None = None, hisse: str | None = None) -> Karne:
    sorgu = "SELECT olasilik, sonuc FROM tahminler WHERE sonuc IS NOT NULL"
    parametreler: list[str] = []
    if piyasa:
        sorgu += " AND piyasa = ?"
        parametreler.append(piyasa)
    if hisse:
        sorgu += " AND hisse = ?"
        parametreler.append(hisse)
    df = pd.DataFrame(db.execute(sorgu, parametreler).fetchall(), columns=["p", "y"])
    if df.empty:
        return Karne(0, None, None, None, [])
    df = df.astype(float)
    brier = float(((df.p - df.y) ** 2).mean())
    oran = float(df.y.mean())
    temel = float(((oran - df.y) ** 2).mean())
    kovalar = pd.cut(df.p, [0, 0.2, 0.4, 0.6, 0.8, 1.0], include_lowest=True)
    kalibrasyon = [
        (str(k), len(g), float(g.p.mean()), float(g.y.mean()))
        for k, g in df.groupby(kovalar, observed=True)
    ]
    return Karne(len(df), brier, temel, oran, kalibrasyon)
