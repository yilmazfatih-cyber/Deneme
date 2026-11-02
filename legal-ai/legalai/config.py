"""Ayarlar. Ortam değişkenleri `LEGALAI_` önekiyle okunur; `.env` dosyası varsa yüklenir."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

DEFAULT_MODEL = "claude-opus-5-5"


def _load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


@dataclass
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.environ.get("LEGALAI_DATA_DIR", "data")))
    model: str = field(default_factory=lambda: os.environ.get("LEGALAI_MODEL", DEFAULT_MODEL))
    effort: str = field(default_factory=lambda: os.environ.get("LEGALAI_EFFORT", "high"))
    # none | voyage | local
    embedder: str = field(default_factory=lambda: os.environ.get("LEGALAI_EMBEDDER", "none"))
    embed_model: str = field(default_factory=lambda: os.environ.get("LEGALAI_EMBED_MODEL", ""))
    host: str = field(default_factory=lambda: os.environ.get("LEGALAI_HOST", "127.0.0.1"))
    port: int = field(default_factory=lambda: int(os.environ.get("LEGALAI_PORT", "8008")))

    @property
    def db_path(self) -> Path:
        return self.data_dir / "legalai.sqlite"

    @property
    def raw_dir(self) -> Path:
        return self.data_dir / "raw"

    def ensure_dirs(self) -> None:
        self.raw_dir.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    _load_dotenv(Path(".env"))
    return Settings()
