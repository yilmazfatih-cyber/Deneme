"""Model ve ses kataloğu (`katalog/modeller.yaml`): şema, okuma ve diskteki yerler.

Her kayıt: ad, tür (stt/tts), Hugging Face deposu ve SABİT sürüm (commit), dosyalar (yol, boyut,
sha256), lisans, ticari kullanım (evet/hayir/belirsiz), atıf metni, lisansın okunduğu yer.
Diskte: `<model_dizini>/<tür>/<ad>/<dosya adı>`. Katalog `scripts/hf_dogrula.py` ile HF API'sine
karşı doğrulanır (ağ ister); sonuç `katalog/hf_dogrulama.json`'dadır.
Kim kullanır: indir.py, komutlar.py (`modeller`, `indir`, motor kurulumu), sunucu/.
Genişletme: yeni model → `python scripts/hf_dogrula.py --oneri <depo> [--klasor <yol>]` çıktısını
modeller.yaml'a yapıştırın, lisansı model kartından okuyup doldurun (AGENTS.md tarifi).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field, ValidationError

from ses.hatalar import BicimHatasi, ModelBulunamadiHatasi

KOK = Path(__file__).resolve().parent.parent
VARSAYILAN_KATALOG = KOK / "katalog" / "modeller.yaml"


class KatalogDosyasi(BaseModel):
    yol: str = Field(description="depodaki yol")
    boyut: int = Field(gt=0)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")

    @property
    def ad(self) -> str:
        return Path(self.yol).name


class KatalogModeli(BaseModel):
    ad: str = Field(pattern=r"^[A-Za-z0-9_.-]+$")
    tur: Literal["stt", "tts"]
    hf: str = Field(pattern=r"^[\w.-]+/[\w.-]+$")
    surum: str = Field(pattern=r"^[0-9a-f]{40}$", description="HF commit (sabit sürüm)")
    dosyalar: list[KatalogDosyasi] = Field(min_length=1)
    lisans: str
    ticari: Literal["evet", "hayir", "belirsiz"]
    lisans_kaynagi: str = Field(description="lisansın okunduğu yer (model kartı, etiket)")
    atif: str
    ornekleme: int | None = None
    aciklama: str = ""

    @property
    def boyut_mb(self) -> float:
        return sum(d.boyut for d in self.dosyalar) / 1e6


class GeriCekilen(BaseModel):
    ad: str
    neden: str
    kaynak: str


class Katalog(BaseModel):
    dogrulama_tarihi: str
    modeller: list[KatalogModeli]
    geri_cekilenler: list[GeriCekilen] = Field(default_factory=list)

    def bul(self, ad: str, tur: Literal["stt", "tts"]) -> KatalogModeli:
        for model in self.modeller:
            if model.ad == ad and model.tur == tur:
                return model
        geri = next((g for g in self.geri_cekilenler if g.ad == ad), None)
        if geri is not None:
            raise ModelBulunamadiHatasi(f"'{ad}' kullanılmamalı: {geri.neden}")
        bilinen = ", ".join(m.ad for m in self.modeller if m.tur == tur)
        raise ModelBulunamadiHatasi(f"Katalogda '{ad}' yok. Bilinenler: {bilinen}")


def katalog_yolu() -> Path:
    return Path(os.environ.get("SES_KATALOG") or VARSAYILAN_KATALOG)


def katalogu_oku(yol: Path | None = None) -> Katalog:
    """Kataloğu okur ve doğrular (bozuksa hangi alanın bozuk olduğunu söyler)."""
    yol = yol or katalog_yolu()
    try:
        ham = yaml.safe_load(yol.read_text(encoding="utf-8"))
        return Katalog.model_validate(ham)
    except OSError as hata:
        raise BicimHatasi(
            f"Katalog okunamadı: {yol}. SES_KATALOG ortam değişkenini denetleyin."
        ) from hata
    except (yaml.YAMLError, ValidationError) as hata:
        raise BicimHatasi(f"Katalog bozuk: {yol}\n{hata}") from hata


def model_klasoru(model_dizini: Path, model: KatalogModeli) -> Path:
    return model_dizini / model.tur / model.ad


def indirilmis_mi(model_dizini: Path, model: KatalogModeli) -> bool:
    """Bütün dosyalar diskte ve boyutları doğru mu? (sha256'yı `indir --denetle` hesaplar)."""
    klasor = model_klasoru(model_dizini, model)
    return all(
        (klasor / d.ad).is_file() and (klasor / d.ad).stat().st_size == d.boyut
        for d in model.dosyalar
    )
