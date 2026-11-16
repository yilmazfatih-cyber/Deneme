"""LoRA: başta model değişmez, birleşik = birleşmemiş, yalnız LoRA eğitilir, kayıt/yükleme."""

from __future__ import annotations

from pathlib import Path

import pytest
import torch

from dil_modeli.config import ModelConfig
from dil_modeli.lora import (
    LoRAConfig,
    LoRALinear,
    apply_lora,
    load_adapter,
    lora_layers,
    merge_lora,
    remove_lora,
    save_adapter,
    unmerge_lora,
)
from dil_modeli.model import LanguageModel, lm_loss

CONFIG = ModelConfig(vocab_size=64, dim=32, n_layer=2, n_head=4, n_kv_head=2, max_seq_len=16)
IDS = torch.randint(0, 64, (2, 12), generator=torch.Generator().manual_seed(0))


def _model() -> LanguageModel:
    torch.manual_seed(0)
    return LanguageModel(CONFIG).eval()


def _train_a_bit(model: LanguageModel, steps: int = 5) -> None:
    trainable = [p for p in model.parameters() if p.requires_grad]
    optimizer = torch.optim.AdamW(trainable, lr=1e-2)
    for _ in range(steps):
        optimizer.zero_grad()
        lm_loss(model(IDS[:, :-1]), IDS[:, 1:]).backward()
        optimizer.step()


def test_fresh_lora_does_not_change_outputs() -> None:
    model = _model()
    before = model(IDS)
    names = apply_lora(model, LoRAConfig(rank=4))
    assert len(names) == 2 * 7  # her blokta 7 doğrusal katman
    assert torch.allclose(model(IDS), before)


def test_only_lora_parameters_are_trained() -> None:
    model = _model()
    apply_lora(model, LoRAConfig(rank=4, targets=("q_proj", "v_proj")))
    frozen = {n: p.clone() for n, p in model.named_parameters() if not p.requires_grad}
    trainable = {n for n, p in model.named_parameters() if p.requires_grad}
    assert trainable
    assert all(n.endswith(("lora_a", "lora_b")) for n in trainable)
    model.train()
    _train_a_bit(model)
    for name, param in model.named_parameters():
        if name in frozen:
            assert torch.equal(param, frozen[name]), name
    assert any(layer.lora_b.abs().sum() > 0 for layer in lora_layers(model).values())


def test_merged_equals_unmerged_and_unmerge_restores() -> None:
    model = _model()
    original = {n: p.clone() for n, p in model.state_dict().items()}
    apply_lora(model, LoRAConfig(rank=4, alpha=8.0))
    model.train()
    _train_a_bit(model)
    model.eval()
    with torch.no_grad():
        unmerged = model(IDS)
        merge_lora(model)
        merged = model(IDS)
        unmerge_lora(model)
        again = model(IDS)
    assert torch.allclose(merged, unmerged, atol=1e-5)
    assert torch.allclose(again, unmerged, atol=1e-5)
    assert not torch.allclose(unmerged, _model()(IDS), atol=1e-3)  # ince ayar bir şey değiştirdi
    for name, layer in lora_layers(model).items():
        assert torch.allclose(layer.base.weight, original[f"{name}.weight"], atol=1e-6)


def test_remove_lora_gives_a_plain_model_with_the_same_outputs() -> None:
    model = _model()
    apply_lora(model, LoRAConfig(rank=2))
    _train_a_bit(model.train())
    model.eval()
    expected = model(IDS)
    remove_lora(model)
    assert not lora_layers(model)
    assert set(model.state_dict()) == set(_model().state_dict())
    assert torch.allclose(model(IDS), expected, atol=1e-5)
    assert all(p.requires_grad for p in model.parameters())


def test_adapter_save_and_load(tmp_path: Path) -> None:
    model = _model()
    config = LoRAConfig(rank=4, targets=("q_proj", "down_proj"))
    apply_lora(model, config)
    _train_a_bit(model.train())
    model.eval()
    expected = model(IDS)
    save_adapter(tmp_path, model, config, {"not": "deneme"})
    size = sum(f.stat().st_size for f in tmp_path.iterdir())
    assert size < 40_000  # yalnız A ve B matrisleri
    fresh = _model()
    assert load_adapter(fresh, tmp_path) == config
    assert torch.allclose(fresh.eval()(IDS), expected, atol=1e-6)
    merge_lora(fresh)
    with pytest.raises(ValueError, match="unmerge"):
        save_adapter(tmp_path / "x", fresh, config, {})
    with pytest.raises(FileNotFoundError, match="adaptor"):
        load_adapter(_model(), tmp_path / "yok")


def test_lora_linear_delta_formula() -> None:
    base = torch.nn.Linear(6, 5, bias=False)
    layer = LoRALinear(base, LoRAConfig(rank=3, alpha=6.0))
    with torch.no_grad():
        layer.lora_b.normal_()
    x = torch.randn(4, 6)
    expected = x @ base.weight.t() + 2.0 * (x @ layer.lora_a.t() @ layer.lora_b.t())
    assert torch.allclose(layer(x), expected, atol=1e-5)
    with pytest.raises(ValueError, match="hedef"):
        apply_lora(_model(), LoRAConfig(targets=("yok_proj",)))
