"""Hugging Face `LlamaForCausalLM` biçimine dışa aktarım (dışa aktarım (b)).

Model bire bir LLaMA mimarisi olduğu için ağırlıklar yalnız ADLARI değiştirilerek yazılır;
sayı dönüştürme yoktur. RoPE, HF'nin "yarıyı döndür" düzeninde olduğundan sorgu/anahtar
matrislerine permütasyon da gerekmez. Çıktı klasörü `transformers` ile doğrudan yüklenir ve
llama.cpp'nin `convert_hf_to_gguf.py` betiğine girdi olur (docs/OLLAMA.md).
Eşlik testi: tests/test_export_hf.py (logitler `allclose`, tokenizer kimlikleri aynı).

Genişletme: `ModelConfig`e yeni alan eklediyseniz `hf_config` içinde karşılığını yazın; HF
Llama'da karşılığı yoksa dışa aktarım açık bir hata vermeli.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from safetensors.torch import save_file
from torch import Tensor

from .chat import CHAT_TEMPLATE
from .config import ModelConfig
from .model import LanguageModel
from .tokenizer import BOS, END_OF_TURN, EOS, PAD, BPETokenizer
from .tokenizer_api import Tokenizer


def hf_name(name: str) -> str:
    """Bizim parametre adımız -> HF Llama adı."""
    if name == "embed.weight":
        return "model.embed_tokens.weight"
    if name == "norm.weight":
        return "model.norm.weight"
    if name == "head.weight":
        return "lm_head.weight"
    parts = name.split(".")  # blocks.{i}.<modül>.<katman>.weight
    if parts[0] != "blocks":
        raise ValueError(f"Hugging Face karşılığı bilinmeyen parametre: {name}")
    prefix = f"model.layers.{parts[1]}"
    rest = ".".join(parts[2:])
    table = {
        "attn_norm.weight": "input_layernorm.weight",
        "mlp_norm.weight": "post_attention_layernorm.weight",
    }
    if rest in table:
        return f"{prefix}.{table[rest]}"
    if rest.startswith("attn."):
        return f"{prefix}.self_attn.{rest.removeprefix('attn.')}"
    if rest.startswith("mlp."):
        return f"{prefix}.mlp.{rest.removeprefix('mlp.')}"
    raise ValueError(f"Hugging Face karşılığı bilinmeyen parametre: {name}")


def hf_tensors(model: LanguageModel) -> dict[str, Tensor]:
    """HF adlarıyla ağırlıklar (paylaşılan çıkış katmanı yazılmaz; HF onu gömmeden bağlar)."""
    state = model.state_dict()
    tensors = {}
    for name, tensor in state.items():
        if name == "head.weight" and model.config.tie_embeddings:
            continue
        tensors[hf_name(name)] = tensor.detach().float().cpu().contiguous()
    return tensors


def hf_config(config: ModelConfig, tokenizer: Tokenizer) -> dict[str, Any]:
    """HF `LlamaConfig` alanları (dropout yalnız eğitimde kullanıldığı için yazılmaz)."""
    return {
        "architectures": ["LlamaForCausalLM"],
        "model_type": "llama",
        "vocab_size": config.vocab_size,
        "hidden_size": config.dim,
        "intermediate_size": config.hidden_dim,
        "num_hidden_layers": config.n_layer,
        "num_attention_heads": config.n_head,
        "num_key_value_heads": config.n_kv_head,
        "head_dim": config.head_dim,
        "hidden_act": "silu",
        "max_position_embeddings": config.max_seq_len,
        "rms_norm_eps": config.norm_eps,
        "rope_theta": config.rope_base,  # eski sürümler ve llama.cpp bu alanı okur
        "rope_parameters": {"rope_type": "default", "rope_theta": config.rope_base},
        "tie_word_embeddings": config.tie_embeddings,
        "attention_bias": False,
        "mlp_bias": False,
        "attention_dropout": 0.0,
        "initializer_range": 0.02,
        "use_cache": True,
        "bos_token_id": tokenizer.bos_id,
        "eos_token_id": tokenizer.eos_id,
        "pad_token_id": tokenizer.pad_id,
        "torch_dtype": "float32",
    }


def _tokenizer_files(tokenizer: BPETokenizer, model_config: ModelConfig, out: Path) -> None:
    tokenizer.save(out / "tokenizer.json", add_bos=True)  # HF tarafı başa <|bas|> eklesin
    special = {"bos_token": BOS, "eos_token": EOS, "pad_token": PAD}
    tokenizer_config = {
        # 5.x'te TokenizersBackend'in takma adı; LlamaTokenizer yazılsaydı tokenizer
        # Metaspace ile yeniden kurulur ve kimlikler değişirdi.
        "tokenizer_class": "PreTrainedTokenizerFast",
        **special,
        "unk_token": None,
        "add_bos_token": True,
        "add_eos_token": False,
        "clean_up_tokenization_spaces": False,
        "model_max_length": model_config.max_seq_len,
        "chat_template": CHAT_TEMPLATE,
    }
    _write_json(out / "tokenizer_config.json", tokenizer_config)
    _write_json(out / "special_tokens_map.json", special)
    (out / "chat_template.jinja").write_text(CHAT_TEMPLATE, encoding="utf-8")


def export_hf(model: LanguageModel, tokenizer: Tokenizer, out_dir: str | Path) -> Path:
    """Modeli `transformers`ın doğrudan yükleyeceği bir klasöre yazar."""
    if not isinstance(tokenizer, BPETokenizer):
        raise ValueError("Hugging Face dışa aktarımı yalnız BPE tokenizer ile yapılabilir.")
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    save_file(hf_tensors(model), str(out / "model.safetensors"), metadata={"format": "pt"})
    _write_json(out / "config.json", hf_config(model.config, tokenizer))
    stops = [tokenizer.eos_id, tokenizer.special_id(END_OF_TURN)]
    generation = {
        "bos_token_id": tokenizer.bos_id,
        "eos_token_id": stops,
        "pad_token_id": tokenizer.pad_id,
    }
    _write_json(out / "generation_config.json", generation)
    _tokenizer_files(tokenizer, model.config, out)
    return out


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
