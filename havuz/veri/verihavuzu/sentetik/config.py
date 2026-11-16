"""Üreteç ayarları (Pydantic): KDV oranları, kampanya günleri, iade oranları, kargo kuralı.

Komut satırında ``--ayar ayar.json`` ile bir JSON dosyası verilirse burada doğrulanır; bilinmeyen
alan ya da yanlış tür açık bir Türkçe hatayla reddedilir. Varsayılanlar KURGUSAL senaryodur.
KDV: varsayılan oranlar %1, %10, %20'dir (Temmuz 2023'ten beri yürürlükte olan oranlar; 2026-11-16
tarihinde ikincil kaynaklarla teyit edildi, resmî metinden değil). Ürün → oran eşlemesi kurgusaldır;
gerçek bir ürünün oranı için mevzuata bakın.
Genişletme: yeni bir ayar alanı ekleyin, varsayılanını verin ve üreteçte ``config.alan`` ile okuyun.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from verihavuzu.files import read_json

MUSTERI_BASINA_GUNLUK_SIPARIS = 0.02  # 300 müşteri → günde ~6 sipariş (kurgusal)


class Campaign(BaseModel):
    """Kampanya dönemi: sipariş yoğunluğu çarpanı ve ürünlerde indirim aralığı."""

    model_config = ConfigDict(extra="forbid")
    ad: str
    baslangic: date
    bitis: date
    talep_carpani: float = Field(default=2.5, gt=0)
    en_az_indirim: float = Field(default=0.10, ge=0, lt=1)
    en_cok_indirim: float = Field(default=0.30, ge=0, lt=1)

    @model_validator(mode="after")
    def _ordered(self) -> Campaign:
        if self.bitis < self.baslangic:
            raise ValueError(f"'{self.ad}' kampanyasının bitişi başlangıçtan önce olamaz.")
        if self.en_cok_indirim < self.en_az_indirim:
            raise ValueError(f"'{self.ad}': en_cok_indirim, en_az_indirim'den küçük olamaz.")
        return self


def _default_campaigns() -> list[Campaign]:
    return [
        Campaign(ad="Kış indirimi", baslangic=date(2025, 1, 10), bitis=date(2025, 1, 12)),
        Campaign(ad="Bahar fırsatları", baslangic=date(2025, 4, 18), bitis=date(2025, 4, 19)),
        Campaign(ad="Yaz indirimi", baslangic=date(2025, 7, 4), bitis=date(2025, 7, 6)),
        Campaign(
            ad="Kasım kampanyası",
            baslangic=date(2025, 11, 21),
            bitis=date(2025, 11, 24),
            talep_carpani=4.0,
        ),
    ]


class CommerceConfig(BaseModel):
    """E-ticaret ve fatura üreteçlerinin ayarları."""

    model_config = ConfigDict(extra="forbid")
    baslangic: date = date(2025, 1, 1)
    bitis: date = date(2025, 12, 31)
    # Taban günlük sipariş beklentisi; boşsa müşteri sayısı × MUSTERI_BASINA_GUNLUK_SIPARIS.
    gunluk_siparis: float | None = Field(default=None, gt=0)
    yillik_buyume: float = Field(default=0.25, ge=-0.9, description="dönem boyunca doğrusal büyüme")
    # Pazartesi … Pazar çarpanları (kurgusal haftalık desen)
    haftalik: list[float] = Field(default=[0.95, 0.9, 0.92, 0.95, 1.05, 1.15, 1.08])
    # Ocak … Aralık çarpanları (kurgusal yıllık desen)
    aylik: list[float] = Field(
        default=[0.9, 0.85, 0.9, 0.95, 1.0, 0.95, 0.9, 0.9, 1.0, 1.05, 1.25, 1.35]
    )
    tatil_carpani: float = Field(default=0.6, gt=0, description="sabit resmî tatillerde talep")
    kampanyalar: list[Campaign] = Field(default_factory=_default_campaigns)
    kdv_oranlari: dict[str, int] = Field(default={"dusuk": 1, "indirimli": 10, "genel": 20})
    kargo_ucreti: Decimal = Decimal("49.90")
    ucretsiz_kargo_esigi: Decimal = Decimal("500.00")
    kargo_kdv_grubu: str = "genel"
    iptal_orani: float = Field(default=0.03, ge=0, le=1)
    iade_orani: dict[str, float] = Field(
        default={"Giyim": 0.14, "Ayakkabı": 0.12, "Elektronik": 0.05, "Gıda": 0.01},
        description="kategori başına kalem iade olasılığı; listede olmayanlar için 'diger'",
    )
    diger_iade_orani: float = Field(default=0.04, ge=0, le=1)

    @model_validator(mode="after")
    def _check(self) -> CommerceConfig:
        if self.bitis < self.baslangic:
            raise ValueError("bitis, baslangic'tan önce olamaz.")
        if len(self.haftalik) != 7 or len(self.aylik) != 12:
            raise ValueError("haftalik 7, aylik 12 değer içermeli.")
        for group in ("dusuk", "indirimli", "genel"):
            if group not in self.kdv_oranlari:
                raise ValueError(f"kdv_oranlari içinde '{group}' grubu eksik.")
        if self.kargo_kdv_grubu not in self.kdv_oranlari:
            raise ValueError("kargo_kdv_grubu, kdv_oranlari içinde tanımlı olmalı.")
        return self

    def base_daily_orders(self, customers: int) -> float:
        """Taban günlük sipariş beklentisi (ayarda yoksa müşteri sayısından)."""
        if self.gunluk_siparis is not None:
            return self.gunluk_siparis
        return max(0.1, customers * MUSTERI_BASINA_GUNLUK_SIPARIS)

    def campaign_on(self, day: date) -> Campaign | None:
        for campaign in self.kampanyalar:
            if campaign.baslangic <= day <= campaign.bitis:
                return campaign
        return None

    def return_rate(self, category: str) -> float:
        return self.iade_orani.get(category, self.diger_iade_orani)


def load_commerce_config(path: Path | None) -> CommerceConfig:
    """Ayar dosyasını okur; dosya verilmezse varsayılanları döndürür."""
    if path is None:
        return CommerceConfig()
    try:
        return CommerceConfig.model_validate(read_json(path))
    except ValidationError as error:
        problems = "; ".join(
            f"{'.'.join(str(p) for p in item['loc'])}: {item['msg']}" for item in error.errors()
        )
        raise ValueError(f"Ayar dosyası geçersiz ({path}): {problems}") from error
