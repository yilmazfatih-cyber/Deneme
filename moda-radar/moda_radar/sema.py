"""Veri sözleşmesi. Tüm modüller bu şemaları üretir ve tüketir (docs/PLAN.md bölüm 3-8).

Alan adları Türkçe; her kayıt kaynak ve tarih taşır (ilke 7). Görsel yolu YOKTUR: görsel saklanmaz (ADR-002).
"""

from __future__ import annotations

import re
from datetime import date
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

SEZON_DESENI = re.compile(r"^(SS|FW)\d{2}$")
TCX_DESENI = re.compile(r"^\d{2}-\d{4} TCX$")
HEX_DESENI = re.compile(r"^#[0-9A-Fa-f]{6}$")


class KaynakTuru(StrEnum):
    PODYUM = "podyum"
    PERAKENDE = "perakende"
    TOPTANCI = "toptanci"
    SAHA = "saha"
    TALEP = "talep"


class Yon(StrEnum):
    GIRIS = "giris"
    YUKSELIS = "yukselis"
    ZIRVE = "zirve"
    CIKIS = "cikis"
    DUZ = "duz"


class Karar(StrEnum):
    YATIR = "YATIR"
    DENE = "DENE"
    BEKLE = "BEKLE"
    GIRME = "GIRME"


class Kaynak(BaseModel):
    """Her kaydın taşıdığı köken bilgisi."""

    tur: KaynakTuru
    url: str = Field(min_length=1)
    tarama_tarihi: date
    sezon: str
    segment: str | None = None
    marka: str | None = None

    @field_validator("sezon")
    @classmethod
    def sezon_bicimi(cls, v: str) -> str:
        if not SEZON_DESENI.match(v):
            raise ValueError("sezon SS27 veya FW27 biçiminde olmalı")
        return v


class Lab(BaseModel):
    L: float = Field(ge=0, le=100)
    a: float = Field(ge=-128, le=128)
    b: float = Field(ge=-128, le=128)


class PantoneEslesme(BaseModel):
    kod: str
    hex: str
    delta_e: float = Field(ge=0)
    ad: str | None = Field(default=None, description="Pantone telifli ad; ikincil (ADR-001)")

    @field_validator("kod")
    @classmethod
    def kod_bicimi(cls, v: str) -> str:
        if not TCX_DESENI.match(v):
            raise ValueError("kod '17-1564 TCX' biçiminde olmalı")
        return v

    @field_validator("hex")
    @classmethod
    def hex_bicimi(cls, v: str) -> str:
        if not HEX_DESENI.match(v):
            raise ValueError("hex '#RRGGBB' biçiminde olmalı")
        return v.upper()

    @property
    def guven(self) -> Literal["eslesme", "yakin", "yaklasik"]:
        if self.delta_e <= 3:
            return "eslesme"
        if self.delta_e <= 5:
            return "yakin"
        return "yaklasik"


class RenkKaydi(BaseModel):
    """Bir parçanın baskın veya vurgu rengi."""

    kaynak: Kaynak
    parca_id: str
    rol: Literal["baskin", "vurgu"]
    pay: float = Field(ge=0, le=1, description="Parça yüzeyindeki piksel payı")
    lab: Lab
    hex: str
    pantone: PantoneEslesme
    ikinci_aday: PantoneEslesme | None = None

    @field_validator("hex")
    @classmethod
    def hex_bicimi(cls, v: str) -> str:
        if not HEX_DESENI.match(v):
            raise ValueError("hex '#RRGGBB' biçiminde olmalı")
        return v.upper()


class NitelikKaydi(BaseModel):
    """Görsel dil modelinin bir parça için ürettiği etiketler. Değerler content/taksonomi.json sözlüğündendir."""

    kaynak: Kaynak
    parca_id: str
    kategori: str
    parca_konumu: str
    siluet: str = "bilinmiyor"
    boy: str = "bilinmiyor"
    yaka: str = "bilinmiyor"
    kol: str = "bilinmiyor"
    kumas_gorunumu: str = "bilinmiyor"
    desen: str = "bilinmiyor"
    detay: str = "bilinmiyor"
    doku: str = "bilinmiyor"
    kapanma: str = "bilinmiyor"
    renk_sayisi: str = "tek"
    etiketleyen_model: str = Field(description="Ayar dosyasından gelen model kimliği; koda gömülmez")
    denetim: bool = Field(default=False, description="Örneklem denetim etiketi mi (ADR-004)")
    gomme: list[float] | None = Field(default=None, description="Adsız trend kümelemesi için")

    def eksen_degerleri(self) -> dict[str, str]:
        return {
            e: getattr(self, e)
            for e in (
                "kategori",
                "parca_konumu",
                "siluet",
                "boy",
                "yaka",
                "kol",
                "kumas_gorunumu",
                "desen",
                "detay",
                "doku",
                "kapanma",
                "renk_sayisi",
            )
        }


class PaletSatiri(BaseModel):
    """Sezon paletinin bir satırı (docs/PLAN.md bölüm 5)."""

    sezon: str
    kume_merkezi: Lab
    hex: str
    pantone: PantoneEslesme
    ikinci_aday: PantoneEslesme
    podyum_payi: float = Field(ge=0, le=1)
    onceki_sezon_farki: float = Field(description="Puan cinsinden fark; önceki sezon yoksa 0")
    yon: Yon
    marka_sayisi: int = Field(ge=0, description="Rengi kullanan defile sayısı; çeşitlilik ölçüsü")
    segment_raf_tahmini: dict[str, str] = Field(
        default_factory=dict, description="segment kodu → beklenen raf dönemi, ör. {'premium': 'SS27-Mart'}"
    )


class TahminKaydi(BaseModel):
    """Nitelik × segment olasılık kaydı. 'Tutacak' yok; olasılık + ufuk + eşik var (ilke 1)."""

    sezon: str
    ulke: str = "TR"
    segment: str
    kategori: str
    nitelik_ekseni: str = Field(description="renk | siluet | kumas_gorunumu | desen | detay | ...")
    nitelik_degeri: str = Field(description="TCX kodu veya taksonomi değeri")
    olasilik: float = Field(ge=0, le=1)
    esik_raf_payi: float = Field(ge=0, le=1)
    ufuk_sezon: str
    yon: Yon
    gecikme_sezon: float = Field(ge=0)
    gecikme_kaynagi: Literal["olculen", "onsel", "karma"]
    kaynak_sayisi: int = Field(ge=0)
    model_surumu: str
    gerekce: str = Field(max_length=400)

    @model_validator(mode="after")
    def kesinlik_dili_yok(self) -> TahminKaydi:
        yasak = ("kesin", "mutlaka", "garanti")
        g = self.gerekce.lower()
        if any(k in g for k in yasak):
            raise ValueError("gerekçede kesinlik dili olamaz (ilke 1)")
        return self


class YatirimBoyutlari(BaseModel):
    trend_ivmesi: float = Field(ge=0, le=1)
    trend_yonu: Yon
    segment_uyumu: float = Field(ge=0, le=1)
    zamanlama: Literal["erken", "zamaninda", "gec"]
    marj_yuzde: float
    stok_riski: Literal["dusuk", "orta", "yuksek"]
    rakip_sayisi: int = Field(ge=0)


class YatirimKarti(BaseModel):
    """Ürün bazlı karar. Beş boyut ayrı görünür; tek skor yoktur (ilke 6)."""

    sezon: str
    ulke: str = "TR"
    segment: str
    urun: dict[str, str] = Field(description="kategori, siluet, kumas_gorunumu, desen, renk_tcx anahtarları")
    boyutlar: YatirimBoyutlari
    karar: Karar
    gerekce: str = Field(max_length=400)
    degistirecek_sinyal: str = Field(max_length=200)
    kaynak_sayisi: int = Field(ge=0)
    model_surumu: str
    uyari: str = "Yatırım tavsiyesi değildir; karar satın almacınındır."

    @model_validator(mode="after")
    def zorunlu_anahtarlar(self) -> YatirimKarti:
        eksik = {"kategori", "siluet", "kumas_gorunumu", "desen", "renk_tcx"} - set(self.urun)
        if eksik:
            raise ValueError(f"urun eksik anahtarlar: {sorted(eksik)}")
        return self


class SegmentTanimi(BaseModel):
    kod: str
    ad: str
    cipa_markalar: list[str] = Field(default_factory=list)
    gecikme_onsel: dict[Literal["alt", "ust", "mod"], float]
    oncu_kaynak: str
    fiyat_bandi_try: dict[str, float] = Field(default_factory=dict)
    notlar: str = ""
    oncu_kanallar: list[str] = Field(default_factory=list)
    referans_pazarlar: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def gecikme_tutarli(self) -> SegmentTanimi:
        g = self.gecikme_onsel
        if not (g["alt"] <= g["mod"] <= g["ust"]):
            raise ValueError("gecikme_onsel: alt ≤ mod ≤ ust olmalı")
        return self


class KesenBoyut(BaseModel):
    kod: str
    ad: str
    aciklama: str = ""


class SegmentDosyasi(BaseModel):
    surum: str
    ulke: str
    sehir: str
    segmentler: list[SegmentTanimi]
    kesen_boyutlar: list[KesenBoyut] = Field(default_factory=list)
    not_: str | None = Field(default=None, alias="not")

    @model_validator(mode="after")
    def kodlar_tekil(self) -> SegmentDosyasi:
        kodlar = [s.kod for s in self.segmentler]
        if len(kodlar) != len(set(kodlar)):
            raise ValueError("segment kodları tekil olmalı")
        return self


class TaksonomiDosyasi(BaseModel):
    surum: str
    eksenler: dict[str, list[str]]
    not_: str | None = Field(default=None, alias="not")

    @model_validator(mode="after")
    def eksen_kurallari(self) -> TaksonomiDosyasi:
        for eksen, degerler in self.eksenler.items():
            if len(degerler) != len(set(degerler)):
                raise ValueError(f"{eksen}: yinelenen değer")
            if eksen != "renk_sayisi" and "bilinmiyor" not in degerler and eksen != "parca_konumu":
                raise ValueError(f"{eksen}: 'bilinmiyor' değeri zorunlu (ADR-004)")
            if not 3 <= len(degerler) <= 16:
                raise ValueError(f"{eksen}: eksen başına 3-16 değer (ADR-004)")
        return self
