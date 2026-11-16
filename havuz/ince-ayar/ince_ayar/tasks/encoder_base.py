"""Kodlayıcı (encoder) görevlerinin ortak parçaları: taban modeli çözme, tokenizer yükleme, çıktı
klasöründe modeli bulma.

Kim kullanır: sınıflandırma, varlık tanıma ve gömme görevleri.

Genişletme: kodlayıcı görevlerinin hepsinde gereken yeni bir yardımcı buraya eklenir; tek göreve
özgü olan o görevin klasöründe kalır.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ince_ayar.config import TINY_MODEL, ModelSection
from ince_ayar.errors import UserError
from ince_ayar.messages import t
from ince_ayar.tiny import create_tiny_encoder

TINY_DIR = "taban"
MODEL_DIR = "model"


def resolve_encoder_base(base: str, texts: list[str], out_dir: Path, seed: int) -> str:
    """`minik-rastgele` ise minik BERT'i `out_dir/taban` içine kurar; değilse kimliği döndürür."""
    if base != TINY_MODEL:
        return base
    target = out_dir / TINY_DIR
    if not (target / "config.json").is_file():
        create_tiny_encoder(texts, target, seed)
    return str(target)


def hub_kwargs(settings: ModelSection | None) -> dict[str, Any]:
    """`from_pretrained` için sürüm ve uzak kod seçenekleri."""
    if settings is None:
        return {}
    kwargs: dict[str, Any] = {"trust_remote_code": settings.uzak_kod}
    if settings.surum:
        kwargs["revision"] = settings.surum
    return kwargs


def load_encoder_tokenizer(base: str, settings: ModelSection | None = None) -> Any:
    from transformers import AutoTokenizer

    try:
        return AutoTokenizer.from_pretrained(base, **hub_kwargs(settings))
    except OSError as exc:
        raise UserError(
            t("model.yuklenemedi", model=base, ayrinti=str(exc).splitlines()[0])
        ) from exc


def find_trained_dir(path: Path) -> Path:
    """Eğitim çıktı klasörü ya da doğrudan model klasörü verilebilir."""
    for candidate in (path / MODEL_DIR, path):
        if (candidate / "config.json").is_file():
            return candidate
    raise UserError(t("model.klasor_yok", yol=path))
