"""Hugging Face eşliği: `transformers` ile yüklenen model ve tokenizer aynı sonucu verir.

`transformers` yoksa (yalnız çekirdek kurulum) testler atlanır; `dev` ekstrası onu kurar.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import torch

from dil_modeli.chat import ChatMessage, encode_chat
from dil_modeli.config import ModelConfig
from dil_modeli.export_hf import export_hf, hf_name
from dil_modeli.generate import generate_ids
from dil_modeli.model import LanguageModel
from dil_modeli.sampling import SamplingConfig
from dil_modeli.tokenizer import BPETokenizer

from .helpers import fixture_text

CONFIGS = {
    "paylasimli": {"dim": 64, "n_layer": 2, "n_head": 4},
    "gqa_ayri_cikis": {
        "dim": 64,
        "n_layer": 3,
        "n_head": 4,
        "n_kv_head": 2,
        "tie_embeddings": False,
    },
}


def _model(tokenizer: BPETokenizer, **shape: object) -> LanguageModel:
    torch.manual_seed(0)
    config = ModelConfig.from_dict({"vocab_size": tokenizer.vocab_size, "max_seq_len": 64, **shape})
    model = LanguageModel(config)
    with torch.no_grad():  # RMSNorm kazançlarını da 1'den uzaklaştır: ad eşlemesi tam sınansın
        for param in model.parameters():
            if param.dim() == 1:
                param.copy_(torch.rand_like(param) + 0.5)
    return model.eval()


@pytest.mark.parametrize("shape", CONFIGS.values(), ids=CONFIGS.keys())
def test_transformers_logits_match(
    tokenizer: BPETokenizer, tmp_path: Path, shape: dict[str, object]
) -> None:
    transformers = pytest.importorskip("transformers")
    model = _model(tokenizer, **shape)
    export_hf(model, tokenizer, tmp_path)
    hf = transformers.LlamaForCausalLM.from_pretrained(str(tmp_path), dtype=torch.float32).eval()
    ids = torch.tensor([[tokenizer.bos_id, *tokenizer.encode(fixture_text())[:50]]])
    with torch.no_grad():
        ours = model(ids)
        theirs = hf(ids).logits
    assert torch.allclose(ours, theirs, atol=1e-4), (ours - theirs).abs().max()
    # Açgözlü üretim: HF generate ile bizim KV önbellekli üretimimiz aynı belirteçleri seçmeli.
    prompt = ids[:, :10]
    ours_gen = list(generate_ids(model, prompt[0].tolist(), SamplingConfig(20, temperature=0.0)))
    theirs_gen = hf.generate(
        prompt,
        max_new_tokens=20,
        do_sample=False,
        eos_token_id=None,
        pad_token_id=tokenizer.pad_id,
        attention_mask=torch.ones_like(prompt),
    )
    assert ours_gen == theirs_gen[0, 10:].tolist()


def test_auto_tokenizer_matches_ours(tokenizer: BPETokenizer, tmp_path: Path) -> None:
    transformers = pytest.importorskip("transformers")
    export_hf(_model(tokenizer, **CONFIGS["paylasimli"]), tokenizer, tmp_path)
    hf = transformers.AutoTokenizer.from_pretrained(str(tmp_path))
    texts = [
        fixture_text(),
        "Iğdır'dan İzmir'e 🙂 08:30",
        "  çift  boşluk\n\nsatır",
        "<|son|> yazısı",
    ]
    for text in texts:
        ours = tokenizer.encode(text, allow_special=True)
        assert hf(text, add_special_tokens=False)["input_ids"] == ours
        assert hf(text)["input_ids"] == [tokenizer.bos_id, *ours]  # HF başa <|bas|> ekler
        assert hf.decode(ours) == tokenizer.decode(ours, skip_special=False)
    assert hf.bos_token_id == tokenizer.bos_id
    assert hf.eos_token_id == tokenizer.eos_id
    assert hf.pad_token_id == tokenizer.pad_id


def test_chat_template_matches_ours(tokenizer: BPETokenizer, tmp_path: Path) -> None:
    transformers = pytest.importorskip("transformers")
    export_hf(_model(tokenizer, **CONFIGS["paylasimli"]), tokenizer, tmp_path)
    hf = transformers.AutoTokenizer.from_pretrained(str(tmp_path))
    messages = [
        {"role": "system", "content": "Kısa yanıt ver."},
        {"role": "user", "content": "Türkiye'nin başkenti neresi?"},
        {"role": "assistant", "content": "Ankara."},
        {"role": "user", "content": "Ya İzmir?"},
    ]
    ours = encode_chat(
        tokenizer, [ChatMessage.model_validate(m) for m in messages], add_generation_prompt=True
    )
    theirs = hf.apply_chat_template(
        messages, add_generation_prompt=True, tokenize=True, return_dict=False
    )
    assert list(theirs) == ours


def test_config_and_names(tokenizer: BPETokenizer, tmp_path: Path) -> None:
    model = _model(tokenizer, **CONFIGS["gqa_ayri_cikis"])
    export_hf(model, tokenizer, tmp_path)
    config = json.loads((tmp_path / "config.json").read_text(encoding="utf-8"))
    assert config["num_key_value_heads"] == 2
    assert config["tie_word_embeddings"] is False
    assert config["intermediate_size"] == model.config.hidden_dim
    assert hf_name("blocks.3.attn.k_proj.weight") == "model.layers.3.self_attn.k_proj.weight"
    assert hf_name("blocks.0.mlp_norm.weight") == "model.layers.0.post_attention_layernorm.weight"
    with pytest.raises(ValueError, match="bilinmeyen"):
        hf_name("blocks.0.yeni.weight")
