"""Araştırma ajanının kullanabildiği araçlar.

Her araç `ZamanKilitliVeri` üzerinden çalışır; ajan karar anından sonrasını göremez.
Araç sonuçları JSON metni olarak döner.
"""

from __future__ import annotations

import json
import math
import sqlite3
from datetime import datetime
from typing import Any, Callable

import numpy as np
import pandas as pd

from ..ayarlar import Piyasa
from ..tahmin.gunluk import karne
from ..veri.zaman_kilidi import GelecekVerisiHatasi, ZamanKilitliVeri
from ..yurutme.sanal_araci import SanalAraci


def _yuvarla(x: Any, basamak: int = 4) -> Any:
    if isinstance(x, (float, np.floating)):
        return None if math.isnan(x) else round(float(x), basamak)
    return x


def fiyat_istatistikleri(df: pd.DataFrame) -> dict[str, Any]:
    k = df["kapanis"]
    son = float(k.iloc[-1])

    def getiri(n: int) -> float | None:
        return float(son / k.iloc[-n - 1] - 1) if len(k) > n else None

    gunluk = k.pct_change().dropna()
    yil = k.iloc[-252:]
    dusus = float((yil / yil.cummax() - 1).min())
    return {
        "son_kapanis": _yuvarla(son),
        "son_tarih": str(k.index[-1].date()),
        "getiri_1h": _yuvarla(getiri(5)),
        "getiri_1a": _yuvarla(getiri(21)),
        "getiri_3a": _yuvarla(getiri(63)),
        "getiri_6a": _yuvarla(getiri(126)),
        "getiri_1y": _yuvarla(getiri(252)),
        "yillik_oynaklik": _yuvarla(float(gunluk.iloc[-252:].std() * np.sqrt(252))),
        "max_dusus_1y": _yuvarla(dusus),
        "zirve_52h": _yuvarla(float(df["yuksek"].iloc[-252:].max())),
        "dip_52h": _yuvarla(float(df["dusuk"].iloc[-252:].min())),
        "ort_50g": _yuvarla(float(k.iloc[-50:].mean())),
        "ort_200g": _yuvarla(float(k.iloc[-200:].mean())),
        "gun_sayisi": len(k),
    }


class AracKutusu:
    """Ajanın araçları + JSON şemaları."""

    def __init__(
        self,
        veri: ZamanKilitliVeri,
        piyasa: Piyasa,
        db: sqlite3.Connection,
    ) -> None:
        self.veri = veri
        self.piyasa = piyasa
        self.db = db
        self._araclar: dict[str, Callable[..., Any]] = {
            "fiyat_ozeti": self.fiyat_ozeti,
            "fiyat_gecmisi": self.fiyat_gecmisi,
            "gosterge_ozeti": self.gosterge_ozeti,
            "temel_veriler": self.temel_veriler,
            "gecmis_tahminlerim": self.gecmis_tahminlerim,
            "portfoy_durumu": self.portfoy_durumu,
        }

    # --- şemalar -------------------------------------------------------------------------
    def tanimlar(self) -> list[dict[str, Any]]:
        hisse = {"type": "string", "description": "Hisse kodu, ör. THYAO veya AAPL"}
        tanimlar = [
            {
                "name": "fiyat_ozeti",
                "description": "Bir hissenin karar anına kadarki fiyat istatistikleri: 1 hafta-1 yıl getiriler, "
                "yıllık oynaklık, 1 yıllık en büyük düşüş, 52 haftalık zirve/dip, 50 ve 200 günlük ortalama.",
                "input_schema": {"type": "object", "properties": {"hisse": hisse}, "required": ["hisse"], "additionalProperties": False},
            },
            {
                "name": "fiyat_gecmisi",
                "description": "Karar anına kadarki kapanış fiyatları (en fazla 60 satıra seyreltilir).",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "hisse": hisse,
                        "gun": {"type": "integer", "description": "Kaç takvim günü geriye (en fazla 1825)"},
                        "aralik": {"type": "string", "enum": ["1d", "1h", "5m"]},
                    },
                    "required": ["hisse", "gun", "aralik"],
                    "additionalProperties": False,
                },
            },
            {
                "name": "gosterge_ozeti",
                "description": f"Piyasa göstergesinin ({self.piyasa.gosterge}) fiyat istatistikleri; hisseyi piyasayla kıyaslamak için.",
                "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
            },
            {
                "name": "gecmis_tahminlerim",
                "description": "Bu hisse ve genel olarak senin geçmiş tahminlerin ve karnen (Brier skoru, kalibrasyon). "
                "Olasılıklarını ayarlamak için kullan.",
                "input_schema": {"type": "object", "properties": {"hisse": hisse}, "required": ["hisse"], "additionalProperties": False},
            },
            {
                "name": "portfoy_durumu",
                "description": "Sanal portföydeki nakit ve pozisyonlar.",
                "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
            },
        ]
        if self.veri.canli:
            tanimlar.append(
                {
                    "name": "temel_veriler",
                    "description": "Şirketin güncel temel verileri: F/K, PD/DD, FD/FAVÖK, kâr marjı, özsermaye kârlılığı, "
                    "borç/özsermaye, büyüme, temettü verimi, analist hedef ortalaması. Yalnız canlı modda.",
                    "input_schema": {"type": "object", "properties": {"hisse": hisse}, "required": ["hisse"], "additionalProperties": False},
                }
            )
        return [{**t, "strict": True} for t in tanimlar]

    # --- çalıştırma ----------------------------------------------------------------------
    def calistir(self, ad: str, girdi: dict[str, Any]) -> tuple[str, bool]:
        """(sonuç metni, hata mı) döndürür. Hata ajana iletilir; döngü kırılmaz."""
        islev = self._araclar.get(ad)
        if islev is None:
            return f"Bilinmeyen araç: {ad}", True
        try:
            return json.dumps(islev(**girdi), ensure_ascii=False, default=str), False
        except GelecekVerisiHatasi as h:
            return f"Erişim engellendi (zaman kilidi): {h}", True
        except (TypeError, ValueError, KeyError) as h:
            return f"Araç hatası: {h}", True

    def _baslangic(self, gun: int) -> datetime:
        return (self.veri.an - pd.Timedelta(days=gun)).to_pydatetime()

    def fiyat_ozeti(self, hisse: str) -> dict[str, Any]:
        df = self.veri.cubuklar(self.piyasa.sembol(hisse), self._baslangic(400))
        if df.empty:
            raise ValueError(f"{hisse} için veri yok")
        return {"hisse": hisse.upper(), "para_birimi": self.piyasa.para_birimi, **fiyat_istatistikleri(df)}

    def fiyat_gecmisi(self, hisse: str, gun: int, aralik: str = "1d") -> dict[str, Any]:
        gun = max(1, min(int(gun), 1825))
        df = self.veri.cubuklar(self.piyasa.sembol(hisse), self._baslangic(gun), aralik=aralik)
        if df.empty:
            raise ValueError(f"{hisse} için {aralik} verisi yok")
        adim = max(1, math.ceil(len(df) / 60))
        secim = df["kapanis"].iloc[::adim]
        if secim.index[-1] != df.index[-1]:
            secim = pd.concat([secim, df["kapanis"].iloc[-1:]])
        return {
            "hisse": hisse.upper(),
            "aralik": aralik,
            "seyreltme": adim,
            "kapanislar": {str(z): _yuvarla(float(v)) for z, v in secim.items()},
        }

    def gosterge_ozeti(self) -> dict[str, Any]:
        df = self.veri.cubuklar(self.piyasa.gosterge, self._baslangic(400))
        if df.empty:
            raise ValueError("Gösterge verisi yok")
        return {"gosterge": self.piyasa.gosterge, **fiyat_istatistikleri(df)}

    def temel_veriler(self, hisse: str) -> dict[str, Any]:
        return {"hisse": hisse.upper(), **self.veri.temel(self.piyasa.sembol(hisse))}

    def gecmis_tahminlerim(self, hisse: str) -> dict[str, Any]:
        satirlar = self.db.execute(
            "SELECT olusturma, vade, olasilik, esik_getiri, sonuc, gerceklesen_getiri FROM tahminler "
            "WHERE piyasa = ? AND hisse = ? AND olusturma <= ? ORDER BY olusturma DESC LIMIT 10",
            (self.piyasa.kod, hisse.upper(), self.veri.an.isoformat()),
        ).fetchall()
        genel = karne(self.db, piyasa=self.piyasa.kod)
        return {
            "bu_hisse_son_tahminler": [dict(r) for r in satirlar],
            "genel_karne": {
                "cozulen": genel.adet,
                "brier": _yuvarla(genel.brier),
                "temel_oran_brier": _yuvarla(genel.temel_oran_brier),
                "beceri": _yuvarla(genel.beceri),
                "kalibrasyon": genel.kalibrasyon,
            },
        }

    def portfoy_durumu(self) -> dict[str, Any]:
        try:
            d = SanalAraci(self.db, self.piyasa).durum()
        except RuntimeError:
            return {"not": "Sanal hesap henüz açılmadı"}
        return {
            "para_birimi": self.piyasa.para_birimi,
            "nakit": _yuvarla(d.nakit, 2),
            "pozisyonlar": {h: {"adet": a, "ort_maliyet": _yuvarla(m)} for h, (a, m) in d.pozisyonlar.items()},
            "durduruldu": d.durduruldu,
        }
