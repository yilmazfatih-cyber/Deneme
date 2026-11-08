"""Katalog şeması — `catalog/models.yaml` ve `catalog/modules.yaml` dosyalarının sözleşmesi.

Bu dosya platformun omurgasıdır: kurulum sihirbazı, donanım uygunluk denetimi, modül mağazası ve
modül çalışma zamanı hep bu tiplerle konuşur. Alan eklerken `docs/MODUL_SEMASI.md` güncellenir.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class Target(str, Enum):
    """Bileşenin nerede çalıştığı."""

    server = "server"  # GPU sunucu (ortak servis)
    client = "client"  # çalışan bilgisayarı (CPU)
    either = "either"  # ikisi de olabilir; donanıma göre seçilir


class Runtime(str, Enum):
    """Modelin nasıl çalıştırılacağı. Kurulum motoru her değer için bir yükleyici sağlar."""

    llamacpp = "llamacpp"  # GGUF, llama-server (CPU veya GPU)
    vllm = "vllm"  # safetensors, vLLM (GPU, Docker)
    ollama = "ollama"  # `ollama pull hf.co/<repo>:<quant>` (varsa)
    transformers = "transformers"  # HF transformers / sentence-transformers
    faster_whisper = "faster_whisper"  # CTranslate2
    paddleocr = "paddleocr"
    gliner = "gliner"
    presidio = "presidio"
    chronos = "chronos"
    piper = "piper"
    docling = "docling"
    python = "python"  # model yok, saf kütüphane (hesap motoru, Splink, RapidFuzz)


class LicenseClass(str, Enum):
    """Kapalı kaynak ERP eklentisi içinde dağıtım açısından sınıf."""

    permissive = "permissive"  # Apache-2.0, MIT, BSD, CC-BY-4.0
    conditional = "conditional"  # Gemma Terms, Llama Community, CC-BY-SA, AGPL
    noncommercial = "noncommercial"  # CC-BY-NC, CPML — ürüne konmaz


class TurkishSupport(str, Enum):
    strong = "güçlü"
    good = "iyi"
    medium = "orta"
    weak = "zayıf"
    agnostic = "dil bağımsız"
    none = "yok"


class ModelArtifact(BaseModel):
    """İndirilecek somut dosya kümesi. Bir modelin birden çok biçimi olabilir (GGUF Q4, safetensors...)."""

    id: str = Field(description="Biçim kimliği, model içinde tekil. ör. 'q4_k_m', 'safetensors', 'ct2-int8'")
    runtime: Runtime
    hf_repo: str | None = Field(default=None, description="Hugging Face depo kimliği, doğrulanmış")
    hf_files: list[str] = Field(default_factory=list, description="Boşsa deponun tamamı indirilir")
    hf_revision: str = "main"
    ollama_tag: str | None = Field(default=None, description="ör. 'hf.co/unsloth/Qwen3.5-4B-GGUF:Q4_K_M'")
    pip_extras: list[str] = Field(default_factory=list, description="pyproject optional-dependencies adları")
    system_packages: list[str] = Field(default_factory=list, description="apt/brew paketleri, ör. tesseract-ocr-tur")
    disk_gb: float = Field(ge=0, description="İndirme sonrası disk, GB")
    ram_gb: float = Field(ge=0, description="CPU'da çalışırken yaklaşık RAM, GB (ağırlık + çalışma)")
    vram_gb: float = Field(default=0, ge=0, description="GPU'da çalışırken yaklaşık VRAM, GB; 0 = GPU kullanmaz")
    gpu_required: bool = Field(default=False, description="True ise CPU'da çalışmaz / kabul edilemez yavaş")
    cpu_note: str | None = Field(default=None, description="CPU'da çalıştırmanın bedeli (hız, kalite)")
    context_length: int | None = None
    notes: str | None = None


class ModelSpec(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9\-\.]*$", description="Katalog kimliği, ör. 'qwen3.5-4b'")
    name: str
    developer: str
    params_b: float | None = Field(default=None, description="Toplam parametre, milyar (HF safetensors sayımı)")
    active_params_b: float | None = Field(default=None, description="MoE'de aktif parametre, milyar")
    license: str
    license_class: LicenseClass
    turkish: TurkishSupport
    modalities: list[Literal["text", "image", "audio"]] = Field(default_factory=lambda: ["text"])
    capabilities: list[str] = Field(default_factory=list, description="chat, vision, tool_calling, json, embed, rerank, ocr, asr, tts, ner, classify, forecast, translate")
    verified_on: str | None = Field(default=None, description="HF API ile doğrulanma tarihi (YYYY-AA-GG)")
    source_url: str | None = None
    artifacts: list[ModelArtifact] = Field(min_length=1)

    @model_validator(mode="after")
    def _unique_artifacts(self) -> "ModelSpec":
        ids = [a.id for a in self.artifacts]
        if len(ids) != len(set(ids)):
            raise ValueError(f"{self.id}: artifact id tekrarı: {ids}")
        return self

    def artifact(self, artifact_id: str) -> ModelArtifact:
        for a in self.artifacts:
            if a.id == artifact_id:
                return a
        raise KeyError(f"{self.id}: artifact '{artifact_id}' yok")


class Component(BaseModel):
    """Bir modülün ihtiyaç duyduğu tek bir bileşen: ya bir model biçimi ya da saf kütüphane."""

    role: str = Field(description="Modül içindeki görevi, ör. 'llm', 'ocr', 'embedder', 'engine'")
    model: str | None = Field(default=None, description="ModelSpec.id; None ise sadece pip_extras/kütüphane")
    artifact: str | None = Field(default=None, description="ModelArtifact.id; None ise donanıma göre otomatik seçilir")
    target: Target = Target.either
    shared: bool = Field(default=True, description="Aynı model başka modülde kuruluysa yeniden indirilmez ve bellek bir kez sayılır")
    optional: bool = Field(default=False, description="Kurulmasa da modül çalışır (düşük kaliteyle)")
    pip_extras: list[str] = Field(default_factory=list)
    system_packages: list[str] = Field(default_factory=list)
    ram_gb: float = Field(default=0, ge=0, description="model=None iken kütüphanenin RAM payı")
    note: str | None = None


class Action(BaseModel):
    """Modülün dışa açtığı işlem: POST /api/modules/{module}/run/{action}"""

    id: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    name: str
    description: str
    input_schema: dict = Field(default_factory=dict, description="JSON Schema (özet)")
    output_schema: dict = Field(default_factory=dict)
    human_approval: bool = Field(default=False, description="ERP'ye yazan işlemler için zorunlu onay")


class KVKK(BaseModel):
    data_categories: list[str] = Field(default_factory=list, description="İşlenen kişisel veri kategorileri")
    special_categories: bool = Field(default=False, description="Özel nitelikli veri (sağlık, sendika, din...) işleyebilir mi")
    masking_required: bool = Field(default=True, description="Sunucuya gitmeden önce maskeleme zorunlu mu")
    purpose: str = Field(description="İşleme amacı (VERBİS envanter kalemi)")
    retention_days: int = Field(default=30, ge=0, description="Günlüklerin saklama süresi")


class ModuleSpec(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9\-]*$")
    niche_code: str = Field(pattern=r"^N\d{2}$", description="Excel haritasındaki niş kodu")
    name: str
    tagline: str = Field(description="Mağaza kartındaki tek cümle")
    description: str
    package: str = Field(description="Rol paketi: 'KVKK Kalkanı', 'Finans Analisti', ...")
    roles: list[str] = Field(default_factory=list, description="Hedef kullanıcı rolleri")
    tier: Literal["T0", "T1", "T2", "T3"] = Field(description="Asgari donanım katmanı (tam kalite için)")
    components: list[Component] = Field(min_length=1)
    actions: list[Action] = Field(min_length=1)
    kvkk: KVKK
    depends_on: list[str] = Field(default_factory=list, description="Önce kurulması gereken modüller")
    erp_touchpoints: list[str] = Field(default_factory=list, description="ERP ile temas noktaları: 'fatura.olustur(öneri)', 'db.readonly'")
    kpis: list[str] = Field(default_factory=list)
    status: Literal["stable", "beta", "planned"] = "beta"

    @property
    def primary_llm(self) -> Component | None:
        for c in self.components:
            if c.role == "llm":
                return c
        return None


class Catalog(BaseModel):
    models: dict[str, ModelSpec]
    modules: dict[str, ModuleSpec]

    @model_validator(mode="after")
    def _cross_check(self) -> "Catalog":
        errors: list[str] = []
        for m in self.modules.values():
            for c in m.components:
                if c.model is not None:
                    if c.model not in self.models:
                        errors.append(f"{m.id}: bilinmeyen model '{c.model}'")
                    elif c.artifact is not None:
                        try:
                            self.models[c.model].artifact(c.artifact)
                        except KeyError as e:
                            errors.append(f"{m.id}: {e}")
                    if self.models.get(c.model) and self.models[c.model].license_class == LicenseClass.noncommercial:
                        errors.append(f"{m.id}: ticari kullanımı yasak model '{c.model}' katalogda olamaz")
            for d in m.depends_on:
                if d not in self.modules:
                    errors.append(f"{m.id}: bilinmeyen bağımlılık '{d}'")
            if m.kvkk.masking_required and m.id != "kvkk-kalkani" and "kvkk-kalkani" not in m.depends_on:
                errors.append(f"{m.id}: masking_required ama depends_on içinde 'kvkk-kalkani' yok")
        codes = [m.niche_code for m in self.modules.values()]
        if len(codes) != len(set(codes)):
            errors.append(f"niche_code tekrarı: {sorted(c for c in codes if codes.count(c) > 1)}")
        if errors:
            raise ValueError("Katalog tutarsız:\n  - " + "\n  - ".join(errors))
        return self
