"""Katalog kaydının sözleşmesi (Pydantic) ve lisans → ticari kullanım kuralı.

Ticari kullanım kuralı (``commercial_use_from_tags``) yalnız Hugging Face lisans ETİKETİNE bakar:
  - "nc" (ticari olmayan) içeren lisans → hayir
  - bilinen izin verici/açık lisanslar (cc0, mit, apache-2.0, cc-by-*, cc-by-sa-*, odc-by, pddl,
    bsd*) → evet (atıf ve benzer-paylaşım koşullarıyla)
  - etiket yok, unknown, other, "nd" ya da birden çok çelişkili etiket → belirsiz
Katalogdaki ``ticari_kullanim`` alanı kuraldan DAHA KISITLAYICI olabilir (ör. web taraması ya da
çeviri kaynaklı kümeler), daha serbest olamaz: doğrulama bunu denetler. Bu hukuki danışmanlık
değildir (bkz. docs/LISANSLAR.md).
Genişletme: yeni bir lisans etiketi için ``PERMISSIVE`` kümesine ekleyin ve gerekçeyi
docs/LISANSLAR.md tablosuna yazın.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Commercial = Literal["evet", "hayir", "belirsiz"]
AREAS = ("tr-dogal-dil", "genel-dogal-dil", "tablo", "zaman-serisi", "goruntu")
TASKS = (
    "derlem", "metin-siniflandirma", "duygu-analizi", "saldirgan-dil", "soru-yanit", "ozetleme",
    "ceviri", "varlik-tanima", "dogal-dil-cikarimi", "anlamsal-benzerlik", "tablo-siniflandirma",
    "tablo-regresyon", "zaman-serisi-tahmini", "goruntu-siniflandirma",
)  # fmt: skip
NO_TAG = "etiket-yok"
PERMISSIVE = {
    "cc0-1.0", "mit", "apache-2.0", "cc-by-4.0", "cc-by-3.0", "cc-by-2.0", "cc-by-sa-4.0",
    "cc-by-sa-3.0", "odc-by", "pddl", "bsd", "bsd-2-clause", "bsd-3-clause", "unlicense", "gfdl",
}  # fmt: skip


class DatasetEntry(BaseModel):
    """``katalog/kumeler.yaml`` içindeki tek kayıt."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    kimlik: str = Field(pattern=r"^[A-Za-z0-9][\w.\-]*/[\w.\-]+$")
    gorev: Literal[TASKS]  # type: ignore[valid-type]
    alan: Literal[AREAS]  # type: ignore[valid-type]
    dil: list[str] = Field(min_length=1)
    boyut: str = Field(min_length=1, description="HF size_categories etiketi ya da etiket-yok")
    lisans: str = Field(
        min_length=1, description="HF license etiketleri, virgülle; ya da etiket-yok"
    )
    ticari_kullanim: Commercial
    atif: str = Field(min_length=10)
    not_: str = Field(default="", alias="not")

    def license_tags(self) -> list[str]:
        return [] if self.lisans == NO_TAG else [t.strip() for t in self.lisans.split(",")]


class Catalog(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kumeler: list[DatasetEntry]

    @model_validator(mode="after")
    def _unique(self) -> Catalog:
        ids = [entry.kimlik for entry in self.kumeler]
        duplicates = sorted({i for i in ids if ids.count(i) > 1})
        if duplicates:
            raise ValueError(f"Katalogda yinelenen kimlik: {', '.join(duplicates)}")
        return self


def commercial_use_from_tags(tags: list[str]) -> tuple[Commercial, str]:
    """Lisans etiketlerinden ticari kullanım kararı ve gerekçesi."""
    if not tags:
        return "belirsiz", "lisans etiketi yok"
    if any("-nc" in tag for tag in tags):
        return "hayir", "ticari olmayan (NC) lisans"
    unclear = [tag for tag in tags if tag not in PERMISSIVE]
    if unclear:
        return "belirsiz", f"değerlendirilemeyen etiket: {', '.join(unclear)}"
    return "evet", "izin verici/açık lisans (atıf ve varsa benzer-paylaşım koşuluyla)"


RANK = {"hayir": 0, "belirsiz": 1, "evet": 2}


def is_not_more_permissive(declared: Commercial, by_rule: Commercial) -> bool:
    """Katalogdaki karar kuraldan daha serbest değil mi? (evet > belirsiz > hayir)"""
    return RANK[declared] <= RANK[by_rule]
