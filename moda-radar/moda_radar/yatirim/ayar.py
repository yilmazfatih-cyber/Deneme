"""İçerik dosyalarının yüklenmesi ve biçim denetimi: eşikler, maliyet bantları, segmentler, taksonomi.

Eşikler ve bantlar koda gömülmez; `content/esikler.json` ve `content/maliyet/<kategori>.json`'dan gelir.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from moda_radar.sema import SegmentDosyasi, SegmentTanimi, TaksonomiDosyasi

KOK = Path(__file__).resolve().parent.parent.parent
ICERIK = KOK / "content"

SEGMENT_KODLARI = ("luks", "premium", "orta", "deger", "pazar")
EkSeviye = Literal["yok", "dusuk", "orta", "yuksek"]


class Bant(BaseModel):
    alt: float = Field(ge=0)
    ust: float = Field(ge=0)

    @model_validator(mode="after")
    def sirali(self) -> Bant:
        if self.alt > self.ust:
            raise ValueError("bant: alt ≤ ust olmalı")
        return self

    @property
    def orta(self) -> float:
        return (self.alt + self.ust) / 2


class MaliyetDosyasi(BaseModel):
    """`content/maliyet/<kategori>.json`. Tahmini banttır; kesin veri iddiası yoktur."""

    surum: str
    kategori: str
    para_birimi: Literal["TRY"] = "TRY"
    kaynak: str = Field(min_length=1)
    tarih: str = Field(min_length=10)
    not_: str | None = Field(default=None, alias="not")
    kumas_maliyeti: dict[str, dict[str, Bant]]
    ek_maliyet_seviyeleri: dict[str, dict[Literal["dusuk", "orta", "yuksek"], float]]
    desen_ek_maliyet: dict[str, EkSeviye]
    detay_ek_maliyet: dict[str, EkSeviye]
    hedef_satis_fiyati: dict[str, Bant]

    @model_validator(mode="after")
    def segmentler_tam(self) -> MaliyetDosyasi:
        beklenen = set(SEGMENT_KODLARI)
        for kumas, segmentler in self.kumas_maliyeti.items():
            if set(segmentler) != beklenen:
                raise ValueError(f"kumas_maliyeti.{kumas}: segmentler {sorted(beklenen)} olmalı")
        for ad, tablo in (("ek_maliyet_seviyeleri", self.ek_maliyet_seviyeleri), ("hedef", self.hedef_satis_fiyati)):
            if set(tablo) != beklenen:
                raise ValueError(f"{ad}: segmentler {sorted(beklenen)} olmalı")
        return self


class Takvim(BaseModel):
    bas_ay: int = Field(ge=1, le=12)
    son_ay: int = Field(ge=1, le=12)
    yil_farki: int
    aciklama: str = ""


class EsikDosyasi(BaseModel):
    """`content/esikler.json`: karar kuralı eşikleri (PLAN bölüm 8)."""

    surum: str
    kaynak: str
    tarih: str
    yatir_ivme: float = Field(ge=0, le=1)
    dene_ivme_alt: float = Field(ge=0, le=1)
    uyum_alt: float = Field(ge=0, le=1)
    marj_hedef: dict[str, float]
    marj_taban: float
    rakip_yogun: int = Field(ge=1)
    deneme_partisi_yuzde: dict[Literal["alt", "ust"], float]
    celiski_olasilik_farki: float = Field(ge=0, le=1)
    cikis_baskin_agirlik: float = Field(ge=0, le=1)
    eksen_agirliklari: dict[str, float]
    uyum_agirliklari: dict[str, float]
    stok_riski: dict[str, float]
    notr_renk: dict
    satin_alma_takvimi: dict[Literal["SS", "FW"], Takvim]
    varsayilan_esik_raf_payi: float = Field(ge=0, le=1)
    cikis: dict

    @model_validator(mode="after")
    def tutarli(self) -> EsikDosyasi:
        if not self.dene_ivme_alt < self.yatir_ivme:
            raise ValueError("dene_ivme_alt < yatir_ivme olmalı")
        if set(self.marj_hedef) != set(SEGMENT_KODLARI):
            raise ValueError("marj_hedef her segment için tanımlı olmalı")
        if abs(sum(self.eksen_agirliklari.values()) - 1) > 1e-6:
            raise ValueError("eksen_agirliklari toplamı 1 olmalı")
        if abs(sum(self.uyum_agirliklari.values()) - 1) > 1e-6:
            raise ValueError("uyum_agirliklari toplamı 1 olmalı")
        return self


def _json(yol: Path) -> dict:
    return json.loads(yol.read_text("utf-8"))


@lru_cache(maxsize=4)
def esikler(yol: Path | None = None) -> dict:
    """Eşikleri doğrulayıp sözlük olarak döner."""
    veri = _json(yol or ICERIK / "esikler.json")
    EsikDosyasi.model_validate(veri)
    return veri


def maliyet(kategori: str, klasor: Path | None = None) -> dict | None:
    """Kategori için maliyet dosyası; yoksa None."""
    yol = (klasor or ICERIK / "maliyet") / f"{kategori}.json"
    if not yol.exists():
        return None
    veri = _json(yol)
    MaliyetDosyasi.model_validate(veri)
    return veri


@lru_cache(maxsize=4)
def segment_dosyasi(yol: Path | None = None) -> SegmentDosyasi:
    return SegmentDosyasi.model_validate(_json(yol or ICERIK / "segmentler.json"))


def segment(kod: str) -> SegmentTanimi:
    for s in segment_dosyasi().segmentler:
        if s.kod == kod:
            return s
    raise KeyError(kod)


@lru_cache(maxsize=4)
def taksonomi(yol: Path | None = None) -> TaksonomiDosyasi:
    return TaksonomiDosyasi.model_validate(_json(yol or ICERIK / "taksonomi.json"))


@lru_cache(maxsize=2)
def pantone_tablosu(yol: Path | None = None) -> dict[str, dict]:
    """TCX kodu → {hex, ad}. Renk modülü yokken yalnız kod → hex araması için (eşleme yapmaz)."""
    yol = yol or ICERIK / "pantone" / "tcx.json"
    if not yol.exists():
        return {}
    return {r["kod"]: r for r in _json(yol).get("renkler", [])}
