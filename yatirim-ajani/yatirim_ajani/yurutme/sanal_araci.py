"""Sanal aracı kurum: emirleri gerçekçi maliyetle (spread + kayma + komisyon) uygular.

Gerçek para HAREKET ETTİRMEZ. Canlı modda da yalnızca sanal portföyü günceller; gerçek emri
siz Midas'ta verirsiniz (bkz. `oneri.py`).
"""

from __future__ import annotations

import math
import sqlite3
from dataclasses import dataclass
from datetime import datetime

import pandas as pd

from ..ayarlar import Piyasa


@dataclass
class Emir:
    piyasa: str
    hisse: str
    yon: str  # "AL" | "SAT"
    adet: float
    referans_fiyat: float
    neden: str = ""


@dataclass
class Dolum:
    emir: Emir
    fiyat: float
    maliyet: float  # komisyon + spread + kayma toplamı (para biriminde)
    tutar: float  # nakitten çıkan (AL) ya da nakde giren (SAT) net tutar


@dataclass
class HesapDurumu:
    nakit: float
    pozisyonlar: dict[str, tuple[float, float]]  # hisse -> (adet, ortalama maliyet)
    zirve_varlik: float
    gun: str | None
    gun_basi_varlik: float | None
    gun_islem_sayisi: int
    durduruldu: bool
    durdurma_nedeni: str | None

    def varlik(self, fiyatlar: dict[str, float]) -> float:
        return self.nakit + sum(
            adet * fiyatlar.get(h, maliyet) for h, (adet, maliyet) in self.pozisyonlar.items()
        )

    def pozisyon_degeri(self, hisse: str, fiyat: float) -> float:
        return self.pozisyonlar.get(hisse, (0.0, 0.0))[0] * fiyat


def adet_yuvarla(adet: float, piyasa: Piyasa) -> float:
    if piyasa.kesirli_hisse:
        return math.floor(adet * 10_000) / 10_000
    return float(math.floor(adet))


class SanalAraci:
    def __init__(self, db: sqlite3.Connection, piyasa: Piyasa) -> None:
        self.db = db
        self.piyasa = piyasa

    # --- hesap ---------------------------------------------------------------------------
    def hesap_ac(self, nakit: float) -> None:
        self.db.execute(
            "INSERT OR IGNORE INTO hesap (piyasa, nakit, zirve_varlik) VALUES (?, ?, ?)",
            (self.piyasa.kod, nakit, nakit),
        )
        self.db.commit()

    def durum(self) -> HesapDurumu:
        h = self.db.execute("SELECT * FROM hesap WHERE piyasa = ?", (self.piyasa.kod,)).fetchone()
        if h is None:
            raise RuntimeError(f"{self.piyasa.kod} için sanal hesap yok; önce hesap_ac() çağırın")
        poz = {
            r["hisse"]: (r["adet"], r["ort_maliyet"])
            for r in self.db.execute(
                "SELECT * FROM pozisyonlar WHERE piyasa = ? AND adet > 0", (self.piyasa.kod,)
            )
        }
        return HesapDurumu(
            nakit=h["nakit"],
            pozisyonlar=poz,
            zirve_varlik=h["zirve_varlik"],
            gun=h["gun"],
            gun_basi_varlik=h["gun_basi_varlik"],
            gun_islem_sayisi=h["gun_islem_sayisi"],
            durduruldu=bool(h["durduruldu"]),
            durdurma_nedeni=h["durdurma_nedeni"],
        )

    def gun_guncelle(self, an: datetime, fiyatlar: dict[str, float], max_dusus_limiti: float) -> HesapDurumu:
        """Yeni işlem gününde sayaçları sıfırlar, zirveyi günceller, düşüş sınırını denetler."""
        d = self.durum()
        varlik = d.varlik(fiyatlar)
        gun = pd.Timestamp(an).tz_convert(self.piyasa.saat_dilimi).date().isoformat()
        if gun != d.gun:
            self.db.execute(
                "UPDATE hesap SET gun = ?, gun_basi_varlik = ?, gun_islem_sayisi = 0 WHERE piyasa = ?",
                (gun, varlik, self.piyasa.kod),
            )
        zirve = max(d.zirve_varlik, varlik)
        self.db.execute("UPDATE hesap SET zirve_varlik = ? WHERE piyasa = ?", (zirve, self.piyasa.kod))
        if not d.durduruldu and varlik < zirve * (1 - max_dusus_limiti):
            self.durdur(f"Zirveden düşüş %{max_dusus_limiti:.0%} sınırını aştı ({varlik:,.2f} / {zirve:,.2f})")
        self.db.commit()
        return self.durum()

    def durdur(self, neden: str) -> None:
        self.db.execute(
            "UPDATE hesap SET durduruldu = 1, durdurma_nedeni = ? WHERE piyasa = ?",
            (neden, self.piyasa.kod),
        )
        self.db.commit()

    def yeniden_baslat(self) -> None:
        """Düşüş sınırıyla duran hesabı elle yeniden açar; zirve bugünkü değere çekilir."""
        self.db.execute(
            "UPDATE hesap SET durduruldu = 0, durdurma_nedeni = NULL, zirve_varlik = "
            "COALESCE(gun_basi_varlik, zirve_varlik) WHERE piyasa = ?",
            (self.piyasa.kod,),
        )
        self.db.commit()

    # --- işlem ---------------------------------------------------------------------------
    def dolum_fiyati(self, yon: str, fiyat: float) -> float:
        kayip = (self.piyasa.spread_bps + self.piyasa.kayma_bps) / 10_000
        return fiyat * (1 + kayip) if yon == "AL" else fiyat * (1 - kayip)

    def komisyon(self, tutar: float) -> float:
        return tutar * self.piyasa.komisyon_orani + self.piyasa.sabit_komisyon

    def uygula(self, emir: Emir, piyasa_fiyati: float, an: datetime) -> Dolum:
        d = self.durum()
        fiyat = self.dolum_fiyati(emir.yon, piyasa_fiyati)
        brut = emir.adet * fiyat
        komisyon = self.komisyon(brut)
        maliyet = komisyon + abs(fiyat - piyasa_fiyati) * emir.adet
        adet0, maliyet0 = d.pozisyonlar.get(emir.hisse, (0.0, 0.0))
        if emir.yon == "AL":
            tutar = brut + komisyon
            if tutar > d.nakit + 1e-9:
                raise ValueError(f"Yetersiz nakit: {tutar:.2f} > {d.nakit:.2f}")
            yeni_adet = adet0 + emir.adet
            yeni_maliyet = (adet0 * maliyet0 + tutar) / yeni_adet
            nakit = d.nakit - tutar
        elif emir.yon == "SAT":
            if emir.adet > adet0 + 1e-9:
                raise ValueError("Açığa satış yok: elde olandan fazla satılamaz")
            tutar = brut - komisyon
            yeni_adet = adet0 - emir.adet
            yeni_maliyet = maliyet0 if yeni_adet > 1e-9 else 0.0
            nakit = d.nakit + tutar
        else:
            raise ValueError(f"Bilinmeyen yön: {emir.yon}")

        self.db.execute("UPDATE hesap SET nakit = ?, gun_islem_sayisi = gun_islem_sayisi + 1 WHERE piyasa = ?",
                        (nakit, self.piyasa.kod))  # fmt: skip
        if yeni_adet > 1e-9:
            self.db.execute(
                "INSERT INTO pozisyonlar (piyasa, hisse, adet, ort_maliyet) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(piyasa, hisse) DO UPDATE SET adet = excluded.adet, ort_maliyet = excluded.ort_maliyet",
                (self.piyasa.kod, emir.hisse, yeni_adet, yeni_maliyet),
            )
        else:
            self.db.execute("DELETE FROM pozisyonlar WHERE piyasa = ? AND hisse = ?", (self.piyasa.kod, emir.hisse))
        self.db.execute(
            "INSERT INTO islemler (piyasa, hisse, zaman, yon, adet, fiyat, maliyet, neden) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (self.piyasa.kod, emir.hisse, pd.Timestamp(an).isoformat(), emir.yon, emir.adet, fiyat, maliyet, emir.neden),
        )
        self.db.commit()
        return Dolum(emir=emir, fiyat=fiyat, maliyet=maliyet, tutar=tutar)
