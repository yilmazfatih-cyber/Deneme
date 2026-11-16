"""Modelin sayısal güvenceleri: biçim, nedensellik, önbellek eşitliği, GQA, ezber, sayım."""

from __future__ import annotations

import math
from typing import cast

import pytest
import torch
from torch import Tensor

from dil_modeli.config import (
    PRESETS,
    ModelConfig,
    count_parameters,
    default_hidden_dim,
    preset_config,
)
from dil_modeli.layers import Block, RMSNorm, apply_rope, rope_table
from dil_modeli.model import IGNORE_INDEX, LanguageModel, lm_loss

TINY = ModelConfig(vocab_size=97, dim=48, n_layer=2, n_head=4, max_seq_len=32)
GQA = ModelConfig(vocab_size=97, dim=48, n_layer=2, n_head=4, n_kv_head=2, max_seq_len=32)
UNTIED = ModelConfig(
    vocab_size=97, dim=48, n_layer=2, n_head=4, max_seq_len=32, tie_embeddings=False
)


def _model(config: ModelConfig, seed: int = 0) -> LanguageModel:
    torch.manual_seed(seed)
    return LanguageModel(config).eval()


def _ids(batch: int, length: int, vocab: int = 97, seed: int = 0) -> Tensor:
    return torch.randint(0, vocab, (batch, length), generator=torch.Generator().manual_seed(seed))


@pytest.mark.parametrize("config", [TINY, GQA, UNTIED])
def test_logit_shape_and_finite(config: ModelConfig) -> None:
    logits = _model(config)(_ids(3, 17))
    assert logits.shape == (3, 17, config.vocab_size)
    assert torch.isfinite(logits).all()


@pytest.mark.parametrize("config", [TINY, GQA])
def test_future_tokens_do_not_change_past_logits(config: ModelConfig) -> None:
    model = _model(config)
    ids = _ids(2, 20)
    changed = ids.clone()
    changed[:, 12:] = (changed[:, 12:] + 1) % config.vocab_size
    with torch.no_grad():
        first, second = model(ids), model(changed)
    assert torch.equal(first[:, :12], second[:, :12])  # geçmiş bire bir aynı
    assert not torch.allclose(first[:, 12:], second[:, 12:])


@pytest.mark.parametrize("config", [TINY, GQA, UNTIED])
@pytest.mark.parametrize("prefill", [1, 7])
def test_kv_cache_matches_full_forward(config: ModelConfig, prefill: int) -> None:
    model = _model(config)
    ids = _ids(2, 24)
    with torch.no_grad():
        full = model(ids)
        cache = model.new_cache()
        pieces = [model(ids[:, :prefill], cache=cache)]
        for t in range(
            prefill, ids.shape[1], 3
        ):  # üçer üçer: çok belirteçli artımlı adım da sınansın
            pieces.append(model(ids[:, t : t + 3], cache=cache))
    assert cache.length == ids.shape[1]
    assert torch.allclose(torch.cat(pieces, dim=1), full, atol=1e-5)


def test_left_padding_with_key_mask_matches_unpadded() -> None:
    """Soldan dolgu + maske, dolgusuz sonuçla aynı olmalı (RoPE yalnız göreli konuma bakar)."""
    model = _model(TINY)
    ids = _ids(1, 10)
    pad = 5
    padded = torch.cat((torch.zeros(1, pad, dtype=torch.long), ids), dim=1)
    key_mask = torch.cat(
        (torch.zeros(1, pad, dtype=torch.bool), torch.ones(1, 10, dtype=torch.bool)), 1
    )
    with torch.no_grad():
        plain = model(ids)
        masked = model(padded, key_mask=key_mask)
        cache = model.new_cache()
        model(padded[:, :-1], cache=cache, key_mask=key_mask[:, :-1])
        step = model(padded[:, -1:], cache=cache, key_mask=key_mask)
    assert torch.isfinite(masked).all()
    assert torch.allclose(masked[:, pad:], plain, atol=1e-4)
    assert torch.allclose(step[:, 0], plain[:, -1], atol=1e-4)


def test_memorizes_a_single_batch() -> None:
    torch.manual_seed(0)
    model = LanguageModel(TINY)
    ids = _ids(4, 25)
    inputs, targets = ids[:, :-1], ids[:, 1:]
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-2, weight_decay=0.0)
    first = lm_loss(model(inputs), targets).item()
    for _ in range(120):
        optimizer.zero_grad()
        loss = lm_loss(model(inputs), targets)
        loss.backward()
        optimizer.step()
    assert first == pytest.approx(math.log(TINY.vocab_size), rel=0.05)  # başlangıç: tekdüze dağılım
    assert loss.item() < 0.05


def test_loss_ignores_masked_targets() -> None:
    model = _model(TINY)
    ids = _ids(2, 12)
    logits = model(ids[:, :-1])
    targets = ids[:, 1:].clone()
    full = lm_loss(logits, targets)
    targets[:, :5] = IGNORE_INDEX
    manual = torch.nn.functional.cross_entropy(
        logits[:, 5:].reshape(-1, 97), ids[:, 6:].reshape(-1)
    )
    assert lm_loss(logits, targets).item() == pytest.approx(manual.item(), rel=1e-6)
    assert lm_loss(logits, targets).item() != pytest.approx(full.item(), rel=1e-6)


@pytest.mark.parametrize("config", [TINY, GQA, UNTIED])
def test_parameter_count_formula_matches_model(config: ModelConfig) -> None:
    assert count_parameters(config) == _model(config).num_parameters()


def test_gqa_reduces_key_value_parameters() -> None:
    model = _model(GQA)
    block = cast(Block, model.blocks[0])
    assert block.attn.k_proj.weight.shape == (24, 48)
    assert block.attn.q_proj.weight.shape == (48, 48)
    assert count_parameters(GQA) < count_parameters(TINY)


def test_weight_tying() -> None:
    tied, untied = _model(TINY), _model(UNTIED)
    assert tied.head.weight is tied.embed.weight
    assert untied.head.weight is not untied.embed.weight
    assert count_parameters(UNTIED) - count_parameters(TINY) == 97 * 48


def test_presets_have_expected_sizes() -> None:
    """Hazır boyutların parametre sayıları (8192 sözlükle) belgelerdeki aralıkta kalmalı."""
    expected = {
        "bebek": (1.5e6, 2.2e6),
        "mini": (4.5e6, 6e6),
        "kucuk": (25e6, 35e6),
        "orta": (85e6, 125e6),
    }
    assert set(expected) == set(PRESETS)
    for name, (low, high) in expected.items():
        assert low < count_parameters(preset_config(name, vocab_size=8192)) < high, name
    assert (
        count_parameters(preset_config("bebek", 8192))
        == LanguageModel(preset_config("bebek", 8192)).num_parameters()
    )


def test_config_validation_messages() -> None:
    with pytest.raises(ValueError, match="tam bölünmeli"):
        ModelConfig(vocab_size=10, dim=50, n_head=4)
    with pytest.raises(ValueError, match="çift olmalı"):
        ModelConfig(vocab_size=10, dim=12, n_head=4)
    with pytest.raises(ValueError, match="n_kv_head"):
        ModelConfig(vocab_size=10, dim=48, n_head=4, n_kv_head=3)
    with pytest.raises(ValueError, match="Bilinmeyen model ayarı: katman"):
        ModelConfig.from_dict({"vocab_size": 10, "katman": 3})
    with pytest.raises(ValueError, match="Bilinmeyen model boyutu"):
        preset_config("dev", 100)
    assert ModelConfig.from_dict(TINY.to_dict()) == TINY
    assert default_hidden_dim(128) == 352
    assert default_hidden_dim(768) == 2048


def test_too_long_sequence_is_rejected() -> None:
    with pytest.raises(ValueError, match="bağlamını"):
        _model(TINY)(_ids(1, 33))


def test_rmsnorm_matches_formula() -> None:
    norm = RMSNorm(6, eps=1e-5)
    with torch.no_grad():
        norm.weight.copy_(torch.arange(1.0, 7.0))
    x = torch.randn(3, 6, generator=torch.Generator().manual_seed(1))
    expected = x / torch.sqrt((x**2).mean(-1, keepdim=True) + 1e-5) * torch.arange(1.0, 7.0)
    assert torch.allclose(norm(x), expected, atol=1e-6)


def test_rope_matches_explicit_rotation() -> None:
    """RoPE'yi kaba kuvvetle (her boyut çifti için 2x2 dönme) yeniden hesaplayıp karşılaştırır."""
    head_dim, length, base = 8, 5, 10000.0
    cos, sin = rope_table(head_dim, length, base)
    x = torch.randn(1, 1, length, head_dim, generator=torch.Generator().manual_seed(2))
    out = apply_rope(x, cos, sin)
    half = head_dim // 2
    for pos in range(length):
        for i in range(half):
            angle = pos * base ** (-2 * i / head_dim)
            a, b = x[0, 0, pos, i].item(), x[0, 0, pos, i + half].item()
            assert out[0, 0, pos, i].item() == pytest.approx(
                a * math.cos(angle) - b * math.sin(angle), abs=1e-5
            )
            assert out[0, 0, pos, i + half].item() == pytest.approx(
                a * math.sin(angle) + b * math.cos(angle), abs=1e-5
            )


def test_rope_scores_depend_only_on_relative_position() -> None:
    cos, sin = rope_table(8, 20, 10000.0)
    q = torch.randn(8, generator=torch.Generator().manual_seed(3))
    k = torch.randn(8, generator=torch.Generator().manual_seed(4))
    scores = [
        (apply_rope(q, cos[m], sin[m]) * apply_rope(k, cos[m - 3], sin[m - 3])).sum()
        for m in (3, 9, 19)
    ]
    assert torch.allclose(torch.stack(scores), scores[0].expand(3), atol=1e-5)


def test_attention_matches_naive_implementation() -> None:
    """Dikkat katmanını elle (softmax(QK^T/sqrt(d) + maske) V) hesaplayıp karşılaştırır."""
    model = _model(GQA)
    attn = cast(Block, model.blocks[0]).attn
    x = torch.randn(2, 9, 48, generator=torch.Generator().manual_seed(5))
    cos, sin = model.rope_cos[:9], model.rope_sin[:9]
    with torch.no_grad():
        fast = attn(x, cos, sin, None, True)
        q = apply_rope(attn.q_proj(x).view(2, 9, 4, 12).transpose(1, 2), cos, sin)
        k = apply_rope(attn.k_proj(x).view(2, 9, 2, 12).transpose(1, 2), cos, sin)
        v = attn.v_proj(x).view(2, 9, 2, 12).transpose(1, 2)
        out = torch.zeros(2, 4, 9, 12)
        for head in range(4):
            kv = head // 2  # GQA: sorgu başları 0-1 -> K/V başı 0, 2-3 -> 1
            scores = q[:, head] @ k[:, kv].transpose(-1, -2) / math.sqrt(12)
            scores = scores.masked_fill(
                torch.triu(torch.ones(9, 9, dtype=torch.bool), 1), float("-inf")
            )
            out[:, head] = torch.softmax(scores, dim=-1) @ v[:, kv]
        slow = attn.o_proj(out.transpose(1, 2).reshape(2, 9, 48))
    assert torch.allclose(fast, slow, atol=1e-5)
