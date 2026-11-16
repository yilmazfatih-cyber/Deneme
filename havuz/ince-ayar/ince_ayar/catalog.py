"""Model kataloğu (`katalog/modeller.yaml`): şema, yükleme ve lisans sınıflandırması.

Kim kullanır: sentetik veri hattının lisans denetimi (`synth/license.py`), katalog doğrulama
betiği (`scripts/katalog_dogrula.py`) ve kural testleri (`tests/test_catalog.py`).

Lisans sınıfları (`ticari` alanı):
- `evet`    : izin verici lisans (Apache-2.0, MIT, BSD, CC-BY…): ticari kullanım serbest.
- `kosullu` : modele özel lisans (Llama, Gemma, "other"…): ticari kullanım koşullara bağlı;
              lisans metni okunmadan "serbest" denemez.
- `hayir`   : ticari olmayan lisans (CC-BY-NC…, araştırma lisansı).
Sınıf, Hugging Face'teki lisans etiketinden `license_class` ile çıkarılır; katalogdaki değer
bununla aynı olmalıdır (test denetler).

Genişletme: yeni model eklemek için `katalog/modeller.yaml` dosyasına kayıt yazın, sonra
`python scripts/katalog_dogrula.py --yaz` çalıştırın (ağ gerekir).
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ince_ayar.config import PROJECT_ROOT
from ince_ayar.errors import UserError, explain_validation_error
from ince_ayar.messages import t
from ince_ayar.text_tr import lower_ascii

CATALOG_PATH = PROJECT_ROOT / "katalog" / "modeller.yaml"
Commercial = Literal["evet", "kosullu", "hayir"]
TaskName = Literal["sohbet", "siniflandirma", "varlik", "gomme", "ogretmen", "damitma"]

PERMISSIVE = frozenset(
    {
        "apache-2.0",
        "mit",
        "bsd-2-clause",
        "bsd-3-clause",
        "cc-by-4.0",
        "cc-by-sa-4.0",
        "cc0-1.0",
        "unlicense",
        "isc",
    }
)
NONCOMMERCIAL_MARKERS = ("-nc", "noncommercial", "non-commercial", "research")


def license_class(license_id: str | None) -> Commercial:
    """Hugging Face lisans etiketini ticari kullanım sınıfına çevirir."""
    code = lower_ascii(license_id or "").strip()
    if code in PERMISSIVE:
        return "evet"
    if any(marker in code for marker in NONCOMMERCIAL_MARKERS):
        return "hayir"
    return "kosullu"


class CatalogEntry(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    kimlik: str = Field(description="Hugging Face depo kimliği")
    gorev: list[TaskName] = Field(min_length=1)
    boyut: str = Field(description="İnsan için: 135M, 1.7B…")
    parametre: int | None = Field(description="HF API safetensors toplamı; yoksa null")
    lisans: str
    ticari: Commercial
    erisim: Literal["acik", "onayli"]
    turkce: str = Field(description="'kanıt: …' ya da 'kanıt yok'")
    notlar: str = ""
    dogrulandi: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


class Catalog(BaseModel):
    model_config = ConfigDict(extra="forbid")

    modeller: list[CatalogEntry]

    def find(self, model_id: str) -> CatalogEntry | None:
        return next((entry for entry in self.modeller if entry.kimlik == model_id), None)


def load_catalog(path: Path = CATALOG_PATH) -> Catalog:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        return Catalog.model_validate(data)
    except ValidationError as exc:
        raise UserError(
            t("katalog.gecersiz", yol=path, liste="\n  ".join(explain_validation_error(exc)))
        ) from exc
    except (OSError, yaml.YAMLError) as exc:
        raise UserError(t("katalog.okunamadi", yol=path, ayrinti=str(exc))) from exc
