"""Başvuru verisi yükleyici: ``tr/`` klasöründeki tabloları ve yanlarındaki kayıtları okur.

Her tablo ``tr/<ad>.json`` (asıl kaynak) + ``tr/<ad>.csv`` (insan/Excel için kopya) +
``tr/<ad>.meta.json`` (kaynak, lisans, doğrulama, güven) üçlüsüdür.
Kullanım:  ``load("iller")`` → kayıt listesi;  ``load_meta("iller")`` → doğrulama kaydı.
Coğrafya ve takvim için hazır yardımcılar: ``geo.py`` ve ``calendar_tr.py``.
Genişletme: yeni tablo eklemek için AGENTS.md → "Yeni başvuru verisi ekle" tarifini izleyin;
burada kod değişikliği gerekmez (dosyalar klasörden bulunur).
"""

from __future__ import annotations

from functools import cache
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from verihavuzu.files import read_json
from verihavuzu.paths import tr_dir

Row = dict[str, Any]


class VerificationSource(BaseModel):
    """Karşılaştırma yapılan bağımsız kaynak."""

    model_config = ConfigDict(extra="forbid")
    ad: str = Field(min_length=1)
    adres: str = Field(min_length=1)
    lisans: str = Field(min_length=1)
    sonuc: str = Field(min_length=1)


class Verification(BaseModel):
    """Verinin nasıl ve ne zaman doğrulandığı."""

    model_config = ConfigDict(extra="forbid")
    # algoritma    : hesapla üretilir ya da denetlenir
    # capraz-kaynak: bağımsız kaynakla karşılaştırıldı
    # bilinen-kume : kapalı ve kesin bilinen küme
    # tasarim      : olgu iddiası taşımayan sözcük/kalıp listesi (sentetik veri için)
    yontem: Literal["algoritma", "capraz-kaynak", "bilinen-kume", "tasarim"]
    tarih: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    aciklama: str = Field(min_length=20)
    kaynaklar: list[VerificationSource] = []


class ReferenceMeta(BaseModel):
    """``tr/<ad>.meta.json`` dosyasının sözleşmesi."""

    model_config = ConfigDict(extra="forbid")
    ad: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    baslik: str = Field(min_length=3)
    aciklama: str = Field(min_length=10)
    dosyalar: list[str] = Field(min_length=1)
    kayit_sayisi: int = Field(ge=1)
    alanlar: dict[str, str] = Field(min_length=1)
    kaynak: str = Field(min_length=5)
    lisans: str = Field(min_length=5)
    dogrulama: Verification
    guven: Literal["yüksek", "orta"]
    notlar: list[str] = []


def dataset_names() -> list[str]:
    """``tr/`` altındaki tablo adlarını alfabetik döndürür."""
    return sorted(path.name.removesuffix(".meta.json") for path in tr_dir().glob("*.meta.json"))


@cache
def _load_cached(name: str) -> tuple[Row, ...]:
    path = tr_dir() / f"{name}.json"
    if not path.is_file():
        known = ", ".join(dataset_names())
        raise FileNotFoundError(f"Başvuru tablosu bulunamadı: {name}. Var olanlar: {known}")
    data = read_json(path)
    if not isinstance(data, list) or not all(isinstance(item, dict) for item in data):
        raise ValueError(f"{path}: kayıt listesi (nesne dizisi) bekleniyordu.")
    return tuple(data)


def load(name: str) -> list[Row]:
    """Tabloyu kayıt listesi olarak döndürür (her çağrıda kopya; değiştirmek güvenlidir)."""
    return [dict(row) for row in _load_cached(name)]


def column(name: str, field: str) -> list[Any]:
    """Tablonun tek sütununu liste olarak döndürür: ``column("soyadlar", "soyad")``."""
    return [row[field] for row in _load_cached(name)]


def load_meta(name: str) -> ReferenceMeta:
    """Tablonun kaynak/lisans/doğrulama kaydını döndürür."""
    path = tr_dir() / f"{name}.meta.json"
    if not path.is_file():
        raise FileNotFoundError(
            f"{path} yok. Her başvuru tablosunun yanında bir .meta.json bulunmalı "
            "(AGENTS.md → 'Yeni başvuru verisi ekle')."
        )
    return ReferenceMeta.model_validate(read_json(path))


def stopwords() -> frozenset[str]:
    """Durak sözcükler kümesi. Metni önce ``lower_tr`` ile küçültün."""
    return frozenset(column("durak_sozcukler", "sozcuk"))


def first_names(gender: Literal["K", "E"]) -> list[str]:
    """Sentetik veri için adlar: ``"K"`` kadın, ``"E"`` erkek. İstatistik değildir."""
    return [row["ad"] for row in _load_cached("adlar") if row["cinsiyet"] == gender]


def surnames() -> list[str]:
    """Sentetik veri için soyadlar. İstatistik değildir."""
    return column("soyadlar", "soyad")


def currency(code: str) -> Row:
    """ISO 4217 koduna göre para birimi kaydı: ``currency("TRY")["kusurat_basamagi"]`` → 2."""
    for row in _load_cached("para_birimleri"):
        if row["kod"] == code:
            return dict(row)
    raise KeyError(f"Para birimi listede yok: {code} (liste yalnız yaygın 40 kodu içerir).")


def letters(**filters: str) -> list[str]:
    """Alfabeden harf seçer: ``letters(tur="ünlü")``, ``letters(sertlik="sert")``."""
    rows = _load_cached("alfabe")
    return [
        row["kucuk"] for row in rows if all(row.get(key) == value for key, value in filters.items())
    ]
