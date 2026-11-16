"""Örnekleme kuralları: her süzgeç bilinen küçük bir dağılım üzerinde elle hesapla karşılaştırılır."""

from __future__ import annotations

import math

import pytest
import torch

from dil_modeli.sampling import (
    SamplingConfig,
    apply_repetition_penalty,
    make_generator,
    next_token,
    top_k_filter,
    top_p_filter,
)

NEG_INF = float("-inf")


def _logits(probs: list[float]) -> torch.Tensor:
    return torch.tensor([[math.log(p) for p in probs]])


def test_top_k_keeps_the_k_largest_and_ties() -> None:
    logits = torch.tensor([[1.0, 5.0, 3.0, 4.0, 2.0]])
    assert top_k_filter(logits, 2).tolist() == [[NEG_INF, 5.0, NEG_INF, 4.0, NEG_INF]]
    assert top_k_filter(logits, 0) is logits  # kapalı
    assert top_k_filter(logits, 9) is logits  # sözlükten büyük k: değişiklik yok
    tied = torch.tensor([[2.0, 2.0, 1.0]])
    assert top_k_filter(tied, 1).tolist() == [[2.0, 2.0, NEG_INF]]


def test_top_p_keeps_smallest_set_reaching_p() -> None:
    logits = _logits([0.15, 0.5, 0.05, 0.3])
    kept = lambda p: [i for i, v in enumerate(top_p_filter(logits, p)[0].tolist()) if v != NEG_INF]  # noqa: E731
    assert kept(0.7) == [1, 3]  # 0.5 + 0.3 >= 0.7
    assert kept(0.5) == [1]  # 0.5 tek başına yeter
    assert kept(0.81) == [0, 1, 3]
    assert kept(0.01) == [1]  # en olası belirteç her zaman kalır
    assert top_p_filter(logits, 1.0) is logits


def test_repetition_penalty_divides_positive_and_multiplies_negative() -> None:
    logits = torch.tensor([[2.0, -2.0, 1.0, -1.0]])
    history = torch.tensor([[0, 1, 0]])
    assert apply_repetition_penalty(logits, history, 2.0).tolist() == [[1.0, -4.0, 1.0, -1.0]]


def test_temperature_zero_is_greedy_and_window_can_be_empty() -> None:
    logits = torch.tensor([[0.1, 0.9, 0.3], [2.0, 1.0, 0.0]])
    config = SamplingConfig(temperature=0.0, repetition_penalty=1.3)
    empty = torch.zeros((2, 0), dtype=torch.long)
    assert next_token(logits, empty, config).tolist() == [1, 0]
    # Ceza, en olası belirteci geçmişteyse geride bırakabilir.
    history = torch.tensor([[1], [0]])
    strong = SamplingConfig(temperature=0.0, repetition_penalty=10.0)
    assert next_token(logits, history, strong).tolist() == [2, 1]


def test_sampling_is_seeded_and_follows_the_distribution() -> None:
    probs = [0.5, 0.25, 0.15, 0.1]
    logits = _logits(probs).expand(20_000, 4)
    history = torch.zeros((20_000, 0), dtype=torch.long)
    config = SamplingConfig(temperature=1.0)
    first = next_token(logits, history, config, make_generator(7))
    again = next_token(logits, history, config, make_generator(7))
    other = next_token(logits, history, config, make_generator(8))
    assert torch.equal(first, again)
    assert not torch.equal(first, other)
    frequency = torch.bincount(first, minlength=4).float() / 20_000
    assert torch.allclose(frequency, torch.tensor(probs), atol=0.015)
    # Sıcaklık düşünce dağılım sivrilir: p_i^(1/T) ile orantılı.
    cold = next_token(logits, history, SamplingConfig(temperature=0.5), make_generator(7))
    sharp = torch.tensor([p**2 for p in probs])
    assert torch.allclose(torch.bincount(cold, minlength=4).float() / 20_000, sharp / sharp.sum(), atol=0.015)
    # top_k=2: yalnız ilk iki belirteç, kendi aralarındaki oranla.
    two = next_token(logits, history, SamplingConfig(temperature=1.0, top_k=2), make_generator(7))
    assert set(two.tolist()) == {0, 1}
    assert (two == 0).float().mean().item() == pytest.approx(2 / 3, abs=0.015)


def test_config_validation() -> None:
    for bad in (
        {"max_new_tokens": 0},
        {"temperature": -1.0},
        {"top_k": -1},
        {"top_p": 0.0},
        {"top_p": 1.5},
        {"repetition_penalty": 0.0},
        {"repetition_window": -1},
        {"stop": ("",)},
    ):
        with pytest.raises(ValueError):
            SamplingConfig(**bad)  # type: ignore[arg-type]
