"""Ayarlar: hepsi ortam değişkeninden okunur, Pydantic ile doğrulanır (liste: docs/AYARLAR.md).

Model dizini: SES_MODEL_DIZINI; yoksa bu temel kaynak klasöründen çalışıyorsa `<temel>/modeller`
(`.gitignore`'da), değilse `~/.cache/havuz-ses/modeller`. Sunucu varsayılan olarak yalnız
127.0.0.1:8460'ta dinler; API anahtarı SES_SUNUCU_ANAHTARI'ndan okunur (dosyaya yazılmaz).
Kim kullanır: komutlar.py, sunucu/. Genişletme: yeni ayar → `Ayarlar`'a alan + `ayarlari_oku`'da
ortam değişkeni + docs/AYARLAR.md'ye satır + tests/test_ayar_katalog.py'de örnek.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path

from pydantic import BaseModel, Field, ValidationError

from ses.hatalar import BicimHatasi
from ses.katalog import KOK

VARSAYILAN_KAPI = 8460


def varsayilan_model_dizini() -> Path:
    if (KOK / "pyproject.toml").is_file() and (KOK / "katalog").is_dir():
        return KOK / "modeller"
    return Path.home() / ".cache" / "havuz-ses" / "modeller"


class Ayarlar(BaseModel):
    model_dizini: Path
    stt_modeli: str = "base"
    tts_sesi: str = "tr_TR-dfki-medium"
    is_parcacigi: int = Field(2, ge=1, le=64)
    adres: str = "127.0.0.1"
    kapi: int = Field(VARSAYILAN_KAPI, ge=0, le=65535)
    api_anahtari: str | None = Field(None, repr=False)
    azami_yukleme_mb: int = Field(25, ge=1, le=2000)
    azami_sure_sn: float = Field(1800.0, gt=0)
    es_zamanli_is: int = Field(1, ge=1, le=16)
    bekleyen_is: int = Field(4, ge=0, le=1000)
    izinli_kokenler: list[str] = Field(default_factory=list)

    @property
    def azami_yukleme_bayt(self) -> int:
        return self.azami_yukleme_mb * 1024 * 1024


_ORTAM = {
    "SES_MODEL_DIZINI": "model_dizini",
    "SES_STT_MODELI": "stt_modeli",
    "SES_TTS_SESI": "tts_sesi",
    "SES_IS_PARCACIGI": "is_parcacigi",
    "SES_ADRES": "adres",
    "SES_KAPI": "kapi",
    "SES_SUNUCU_ANAHTARI": "api_anahtari",
    "SES_AZAMI_YUKLEME_MB": "azami_yukleme_mb",
    "SES_AZAMI_SURE_SN": "azami_sure_sn",
    "SES_ES_ZAMANLI_IS": "es_zamanli_is",
    "SES_BEKLEYEN_IS": "bekleyen_is",
    "SES_IZINLI_KOKENLER": "izinli_kokenler",
}


def ayarlari_oku(ortam: Mapping[str, str] | None = None, **ustune: object) -> Ayarlar:
    """Ortam değişkenlerinden ayarları kurar; `ustune` (komut satırı) önceliklidir."""
    ortam = os.environ if ortam is None else ortam
    degerler: dict[str, object] = {"model_dizini": varsayilan_model_dizini()}
    for degisken, alan in _ORTAM.items():
        deger = ortam.get(degisken)
        if deger:
            degerler[alan] = (
                [k.strip() for k in deger.split(",") if k.strip()]
                if alan == "izinli_kokenler"
                else deger
            )
    degerler.update({k: v for k, v in ustune.items() if v is not None})
    try:
        return Ayarlar.model_validate(degerler)
    except ValidationError as hata:
        alanlar = ", ".join(str(h["loc"][0]) for h in hata.errors())
        raise BicimHatasi(f"Ayar geçersiz: {alanlar}. docs/AYARLAR.md'ye bakın.\n{hata}") from hata
