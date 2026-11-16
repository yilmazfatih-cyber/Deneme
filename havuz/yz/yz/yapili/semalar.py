"""Örnek çıkarım şemaları — yeni şema yazarken KOPYALANACAK örnekler.

Küçük model için şema tasarımı kuralları (docs/KUCUK_MODEL_REHBERI.md):
    1. Az alan (≤ 8), düz yapı; iç içe en çok bir seviye.
    2. Alan adları Türkçe ve açıklayıcı; her alana `description` yazın (modele gösterilir).
    3. Serbest metin yerine `Literal[...]` (sabit seçenekler) kullanın.
    4. Metinde olmayabilecek alanı `X | None = None` yapın; model uydurmak yerine null yazar.
    5. Sayılar sayı tipinde olsun; para birimi ayrı alanda.
Kim kullanır: gorevler/*.yaml (sema: yz.yapili.semalar:Fatura), testler, `python -m yz cikar`.
Genişletme: yeni şema → bu dosyaya sınıf ekleyin (ya da kendi modülünüzde yazıp
`--sema paket.modul:Sinif` ile verin) ve tests/test_yapili.py'deki şema kural testini çalıştırın.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class FaturaKalemi(BaseModel):
    ad: str = Field(description="Ürün ya da hizmetin adı")
    adet: int = Field(description="Miktar (tam sayı)")
    birim_fiyat: float = Field(description="Birim fiyat (sayı)")


class Fatura(BaseModel):
    fatura_no: str = Field(description="Fatura numarası")
    tarih: date | None = Field(default=None, description="Fatura tarihi")
    satici: str | None = Field(default=None, description="Satıcı firmanın adı")
    toplam: float = Field(description="Genel toplam tutar (sayı)")
    para_birimi: Literal["TRY", "USD", "EUR"] = Field(description="Para birimi kodu")
    kalemler: list[FaturaKalemi] = Field(default_factory=list, description="Fatura kalemleri")


class Iletisim(BaseModel):
    ad_soyad: str = Field(description="Kişinin adı ve soyadı")
    telefon: str | None = Field(default=None, description="Telefon numarası (metindeki gibi)")
    eposta: str | None = Field(default=None, description="E-posta adresi")
    sehir: str | None = Field(default=None, description="Yaşadığı şehir")


class MesajSinifi(BaseModel):
    kategori: Literal["iade", "fatura", "teknik", "kargo", "diger"] = Field(
        description="Müşteri mesajının konusu"
    )
    aciliyet: Literal["dusuk", "orta", "yuksek"] = Field(description="Ne kadar acil")
    ozet: str = Field(description="Mesajın tek cümlelik özeti")


# YENİ ŞEMA BURAYA (yukarıdakilerden birini kopyalayıp uyarlayın)
