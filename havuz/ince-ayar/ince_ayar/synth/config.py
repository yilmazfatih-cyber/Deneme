"""Sentetik veri hattının yapılandırması (`yapilandirma/uret/*.toml`) ve tohum satırı şeması.

Kim kullanır: `synth/cli.py`, `synth/pipeline.py`.

Öğretmen model **açık** bir modeldir ve OpenAI uyumlu bir uç noktadan sunulur (Ollama, vLLM,
llama.cpp sunucusu…). `lisans` alanı zorunludur: üretilen veri öğretmenin lisansına tabidir ve
ticari kullanım için öğretmenin lisansı buna izin vermelidir (bkz. `synth/license.py`).
API anahtarı dosyaya **yazılmaz**; gerekiyorsa anahtarı tutan ortam değişkeninin adı verilir.

Genişletme: yeni bir süzgeç ayarı için `FilterSection` içine alan ekleyin, `synth/filters.py`
içinde kullanın, `yapilandirma/uret/*.toml` dosyalarına yazın.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from ince_ayar.config import Section
from ince_ayar.messages import t

Recipe = Literal["talimat", "sorgu"]


class TeacherSection(Section):
    uc_nokta: str = Field(description="Ör. http://localhost:11434/v1 (Ollama)")
    model: str = Field(description="Sunucudaki model adı, ör. qwen3:8b")
    lisans: str = Field(min_length=1, description="Öğretmen modelin lisans kodu, ör. apache-2.0")
    katalog_kimligi: str = Field("", description="katalog/modeller.yaml içindeki kimlik (denetim)")
    ticari_olmayan_kullanim: bool = Field(
        False,
        description="Lisans ticari kullanıma kapalıysa: veriyi ticari kullanmayacağımı onaylarım",
    )
    api_anahtari_ortam: str = Field("", description="Anahtarı tutan ortam değişkeninin ADI")
    zaman_asimi: float = Field(120.0, gt=0)
    yeniden_deneme: int = Field(3, ge=0)
    sicaklik: float = Field(0.7, ge=0.0, le=2.0)
    azami_belirtec: int = Field(1024, ge=16)


class FilterSection(Section):
    en_kisa_alan: int = Field(3, ge=1, description="Her alan için en az karakter")
    en_uzun_alan: int = Field(4000, ge=10, description="Her alan için en çok karakter")
    dil: Literal["tr", "herhangi"] = "tr"
    turkce_esik: float = Field(0.5, ge=0.0, le=1.0)
    yineleme_esigi: float = Field(0.85, ge=0.5, le=1.0)
    ret_suzgeci: bool = Field(True, description="'Yardımcı olamam' türü ret yanıtlarını ayıkla")
    mevcut_veri: list[str] = Field(
        default_factory=list, description="Bunlara benzeyen adaylar atılır (ör. test kümesi)"
    )


class SynthConfig(Section):
    tarif: Recipe
    ogretmen: TeacherSection
    girdi: str = Field(description="Tohum dosyası (JSONL: kimlik, konu, belge)")
    cikti: str = Field(description="Üretilen veri (JSONL)")
    istem: str = Field("", description="Kendi istem dosyanız; boşsa paketteki tarif istemi")
    sistem_istemi: str = Field("", description="Üretilen sohbetlere eklenecek sistem iletisi")
    ornek_sayisi: int = Field(3, ge=1, le=20, description="Tohum başına istenen örnek")
    tohum: int = 42
    suzgec: FilterSection = Field(default_factory=FilterSection)


class SeedRow(BaseModel):
    """Tohum dosyasının bir satırı. `kimlik` benzersiz olmalı; grup anahtarı olarak da kullanılır."""

    model_config = ConfigDict(extra="allow")

    kimlik: str = Field(min_length=1)
    konu: str = ""
    belge: str = ""

    @model_validator(mode="after")
    def _needs_content(self) -> SeedRow:
        if not self.konu.strip() and not self.belge.strip():
            raise PydanticCustomError("tohum_bos", t("uret.tohum_bos"))
        return self
