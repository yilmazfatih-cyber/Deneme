"""Model kataloğu (`katalog/modeller.yaml`): şema, yükleme ve lisans sınıflandırması.

Kim kullanır: `modeller` komutu, `scripts/katalog_dogrula.py`, kural testleri (`tests/test_catalog.py`).
Kaynak: `havuz/ince-ayar/ince_ayar/catalog.py` (görüntü modellerine uyarlandı).

Lisans sınıfları (`ticari` alanı), Hugging Face lisans etiketinden `license_class` ile çıkarılır:
- `evet`    : izin verici (Apache-2.0, MIT, BSD…): ticari kullanım serbest.
- `kosullu` : modele özel ya da etiketsiz lisans: koşullar okunmadan "serbest" denemez.
- `hayir`   : ticari olmayan (CC-BY-NC…, araştırma lisansı).
DİKKAT: Ağırlık lisansı eğitim verisinin koşullarını kapsamaz (ör. ImageNet); docs/KARARLAR.md K12.

Genişletme: yeni model için `katalog/modeller.yaml` içine kayıt yazın, sonra
`python scripts/katalog_dogrula.py --yaz` çalıştırın (ağ gerekir) ve `python scripts/check.py`.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from goruntu.config import PROJECT_ROOT
from goruntu.errors import UserError, explain_validation_error
from goruntu.messages import t
from goruntu.text_tr import lower_ascii

CATALOG_PATH = PROJECT_ROOT / "katalog" / "modeller.yaml"
Commercial = Literal["evet", "kosullu", "hayir"]
PERMISSIVE = frozenset(
    {"apache-2.0", "mit", "bsd-2-clause", "bsd-3-clause", "cc-by-4.0", "cc0-1.0", "unlicense"}
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
    model_config = ConfigDict(extra="forbid")

    kimlik: str = Field(description="Hugging Face depo kimliği")
    gorev: list[Literal["siniflandirma", "gomme"]] = Field(min_length=1)
    kutuphane: Literal["timm", "transformers"]
    takma_ad: str = Field("", description="Komut satırındaki kısa ad (ör. siglip2)")
    boyut: str = Field(description="İnsan için: 5.5M, 151M…")
    parametre: int | None = Field(description="HF API safetensors toplamı; yoksa null")
    lisans: str | None
    ticari: Commercial
    erisim: Literal["acik", "onayli"]
    girdi: str = Field(description="Girdi boyutu, ör. '224 px'")
    turkce_metin: str = Field(description="Gömmede: 'kanıt: …', 'kanıt yok' ya da 'uygulanmaz'")
    notlar: str = ""
    dogrulandi: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


class Catalog(BaseModel):
    model_config = ConfigDict(extra="forbid")

    modeller: list[CatalogEntry]

    def find(self, model_id: str) -> CatalogEntry | None:
        return next(
            (entry for entry in self.modeller if model_id in (entry.kimlik, entry.takma_ad)), None
        )


def load_catalog(path: Path = CATALOG_PATH) -> Catalog:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        return Catalog.model_validate(data)
    except ValidationError as exc:
        problems = "\n  ".join(explain_validation_error(exc))
        raise UserError(t("katalog.gecersiz", yol=path, liste=problems)) from exc
    except (OSError, yaml.YAMLError) as exc:
        raise UserError(t("katalog.okunamadi", yol=path, ayrinti=str(exc))) from exc
