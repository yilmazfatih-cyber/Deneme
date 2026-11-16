"""Model klasörü: bu paketin kendi kayıt biçimi (dışa aktarım (a)).

Bir model klasörü üç dosyadır:
    config.json        model biçimi (`ModelConfig`) ve isteğe bağlı bilgi notları
    model.safetensors  ağırlıklar (güvenli biçim: içinde çalıştırılabilir kod olmaz)
    tokenizer.json     tokenizer (Hugging Face `tokenizer.json` alt kümesi)

Eğitim çıktısındaki `son/` ve `en-iyi/` klasörleri de bu biçimdedir; `uret`, `sohbet`, `sun`,
`disa-aktar` komutları böyle bir klasör alır.

Genişletme: Yeni bir dosya eklerseniz `MODEL_FILES` listesine yazın; `tests/test_rules.py`
örnek model klasörünün bu listeyle uyumunu denetler.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import torch
from safetensors.torch import load_file, save_file
from torch import Tensor

from .config import ModelConfig
from .model import LanguageModel
from .tokenizer_api import Tokenizer, load_tokenizer

FORMAT = "dil-modeli/1"
CONFIG_NAME = "config.json"
WEIGHTS_NAME = "model.safetensors"
TOKENIZER_NAME = "tokenizer.json"
MODEL_FILES = (CONFIG_NAME, WEIGHTS_NAME, TOKENIZER_NAME)


def model_tensors(model: LanguageModel) -> dict[str, Tensor]:
    """Kaydedilecek ağırlıklar. Paylaşılan çıkış katmanı (`head.weight`) iki kez yazılmaz."""
    state = {name: tensor.detach().cpu() for name, tensor in model.state_dict().items()}
    if model.config.tie_embeddings:
        del state["head.weight"]
    return state


def load_tensors(model: LanguageModel, tensors: dict[str, Tensor]) -> None:
    """Ağırlıkları modele yükler; eksik ya da fazla ad varsa açık bir hata verir."""
    wanted = set(model_tensors(model))
    missing, extra = sorted(wanted - set(tensors)), sorted(set(tensors) - wanted)
    if missing or extra:
        raise ValueError(
            "Ağırlık dosyası model yapılandırmasıyla uyuşmuyor. "
            f"Eksik: {missing[:5] or '-'}; fazla: {extra[:5] or '-'}. "
            "config.json ile model.safetensors aynı eğitimden mi geliyor, denetleyin."
        )
    state = {name: tensor.float() for name, tensor in tensors.items()}
    try:
        model.load_state_dict(state, strict=False)
    except RuntimeError as error:
        raise ValueError(f"Ağırlık biçimleri model yapılandırmasıyla uyuşmuyor: {error}") from None


def write_atomic(path: Path, data: str) -> None:
    """Dosyayı önce geçici adla yazar, sonra yerine koyar: yarım dosya kalmaz."""
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(data, encoding="utf-8")
    os.replace(temporary, path)


def save_model(
    out_dir: str | Path,
    model: LanguageModel,
    tokenizer: Tokenizer,
    *,
    info: dict[str, Any] | None = None,
    half: bool = False,
) -> Path:
    """Modeli klasöre yazar. `half=True`: ağırlıklar float16 saklanır (yarı boyut, küçük kayıp)."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    tensors = model_tensors(model)
    if half:
        tensors = {name: tensor.half() for name, tensor in tensors.items()}
    temporary = out / (WEIGHTS_NAME + ".tmp")
    save_file(tensors, str(temporary), metadata={"format": "pt"})
    os.replace(temporary, out / WEIGHTS_NAME)
    config = {
        "format": FORMAT,
        "dtype": "float16" if half else "float32",
        "model": model.config.to_dict(),
        "info": info or {},
    }
    write_atomic(out / CONFIG_NAME, json.dumps(config, ensure_ascii=False, indent=2) + "\n")
    tokenizer.save(out / TOKENIZER_NAME)
    return out


def read_config(model_dir: str | Path) -> dict[str, Any]:
    """`config.json` dosyasını okur ve biçimini denetler."""
    path = Path(model_dir) / CONFIG_NAME
    if not path.is_file():
        raise FileNotFoundError(
            f"{path} bulunamadı. Model klasörü config.json, model.safetensors ve tokenizer.json "
            "içermeli (ör. eğitim çıktısındaki 'en-iyi' klasörü ya da depodaki 'ornek-model')."
        )
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or data.get("format") != FORMAT or "model" not in data:
        raise ValueError(
            f"{path} bu paketin biçiminde değil (beklenen format: {FORMAT}). Hugging Face "
            "klasörünü değil, eğitim çıktısındaki model klasörünü verin."
        )
    return data


def load_model(
    model_dir: str | Path, device: str | torch.device = "cpu"
) -> tuple[LanguageModel, Tokenizer]:
    """Model klasörünü yükler -> (değerlendirme kipinde model, tokenizer)."""
    root = Path(model_dir)
    config = ModelConfig.from_dict(read_config(root)["model"])
    weights = root / WEIGHTS_NAME
    if not weights.is_file():
        raise FileNotFoundError(f"{weights} bulunamadı; model klasörü eksik.")
    model = LanguageModel(config)
    load_tensors(model, load_file(str(weights)))
    tokenizer = load_tokenizer(root / TOKENIZER_NAME)
    if tokenizer.vocab_size != config.vocab_size:
        raise ValueError(
            f"Tokenizer sözlüğü ({tokenizer.vocab_size}) modelin sözlüğünden ({config.vocab_size}) "
            "farklı; tokenizer.json bu modele ait değil."
        )
    return model.to(device).eval(), tokenizer
