"""Platform ayarları. Ortam değişkenleri `AIP_` önekiyle okunur (ör. AIP_ROLE=client)."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AIP_", env_file=".env", extra="ignore")

    role: Literal["server", "client"] = Field(default="server", description="Bu süreç GPU sunucu mu, çalışan bilgisayarı mı")
    data_dir: Path = Field(default=Path.home() / ".aiplatform", description="Modeller, veritabanı, günlükler")
    host: str = "127.0.0.1"
    port: int = 8080

    # Çalışan bilgisayarı (client) rolünde sunucunun adresi; server rolünde boş
    server_url: str | None = Field(default=None, description="ör. http://ai-sunucu.sirket.local:8080")

    # LLM çalışma zamanı: OpenAI uyumlu /v1 tabanı. Kurulum motoru llama-server / vLLM başlattığında burayı doldurur.
    llm_base_url: str = Field(default="http://127.0.0.1:8001/v1")
    llm_api_key: str = Field(default="yerel", description="Yerel sunucular için anahtar gerekmez; yine de başlık gönderilir")
    llm_model_priority: list[str] = Field(
        default=["qwen3.5-35b-a3b", "gemma-4-26b-a4b", "qwen3.5-9b", "gpt-oss-20b", "gemma-4-e4b", "qwen3.5-4b", "qwen3.5-2b", "qwen3.5-0.8b"],
        description="Kurulu LLM'ler arasından seçim sırası (katalog model id'leri)",
    )

    # Modelleri hangi motorla çalıştıracağız: auto = donanıma göre (GPU+docker → vllm, aksi llamacpp; ollama varsa ollama)
    llm_engine: Literal["auto", "llamacpp", "vllm", "ollama"] = "auto"
    llm_port: int = 8001
    llm_context_length: int = 32768
    llm_gpu_layers: int = Field(default=-1, description="llama.cpp: -1 = hepsi GPU'da, 0 = CPU")

    # ERP entegrasyonu
    erp_db_url: str | None = Field(default=None, description="Salt-okunur kullanıcıyla SQLAlchemy URL'si (Text2SQL için)")
    erp_allowed_tables: list[str] = Field(default_factory=list, description="Text2SQL'in görebileceği tablolar; boşsa hiçbiri")
    erp_api_base_url: str | None = Field(default=None, description="ERP REST API tabanı (iş akışı ajanı araçları)")
    erp_api_token: str | None = None
    erp_webhook_secret: str | None = Field(default=None, description="ERP'den gelen webhook imzası için paylaşılan sır")

    # KVKK
    audit_retention_days: int = 30
    mask_before_server: bool = Field(default=True, description="İstemci: sunucuya giden her metin maskelensin")

    hf_token: str | None = Field(default=None, description="Gated depolar için (Prompt Guard gibi); genelde gerekmez")
    hf_endpoint: str | None = Field(default=None, description="Şirket içi Hugging Face aynası varsa")

    @property
    def models_dir(self) -> Path:
        return self.data_dir / "models"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "platform.db"

    @property
    def logs_dir(self) -> Path:
        return self.data_dir / "logs"

    def ensure_dirs(self) -> None:
        for p in (self.data_dir, self.models_dir, self.logs_dir):
            p.mkdir(parents=True, exist_ok=True)


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
        _settings.ensure_dirs()
    return _settings


def reset_settings() -> None:
    """Testlerde ortam değişkeni değiştirildikten sonra çağrılır."""
    global _settings
    _settings = None
