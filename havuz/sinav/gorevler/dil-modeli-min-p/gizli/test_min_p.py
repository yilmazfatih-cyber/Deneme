"""Gizli sınav testi (dil-modeli-min-p): ayar doğrulaması, süzgeç (tekli ve toplu), üretim ve komut satırı."""

import argparse
import math

import pytest
import torch
from dil_modeli.cli_common import add_sampling_args
from dil_modeli.cli_generate import sampling_from_args
from dil_modeli.sampling import SamplingConfig, make_generator, min_p_filter, next_token


def _logits(rows: list[list[float]]) -> torch.Tensor:
    return torch.tensor([[math.log(p) for p in row] for row in rows])


def test_ayar_varsayilan_kapali_ve_aralik_denetimi() -> None:
    assert SamplingConfig().min_p == 0.0
    assert SamplingConfig(min_p=0.05).min_p == 0.05
    assert SamplingConfig(min_p=0.5).min_p == 0.5
    for bad in (-0.1, 1.5, 2.0):
        with pytest.raises(ValueError):
            SamplingConfig(min_p=bad)


def test_suzgec_elle_hesaplanmis_dagilimda() -> None:
    logits = _logits([[0.5, 0.3, 0.15, 0.05]])
    assert torch.equal(min_p_filter(logits, 0.0), logits)
    kept = min_p_filter(logits, 0.2)  # eşik 0.1
    assert torch.isinf(kept[0, 3]) and kept[0, 3] < 0
    assert torch.equal(kept[0, :3], logits[0, :3])
    kept = min_p_filter(logits, 0.5)  # eşik 0.25
    assert torch.isinf(kept[0, 2:]).all() and torch.equal(kept[0, :2], logits[0, :2])
    kept = min_p_filter(logits, 1.0)  # yalnız en olası
    assert torch.isinf(kept[0, 1:]).all() and kept[0, 0] == logits[0, 0]


def test_toplu_girdide_her_satir_kendi_icinde() -> None:
    logits = _logits([[0.5, 0.3, 0.15, 0.05], [0.04, 0.06, 0.1, 0.8]])
    kept = min_p_filter(logits, 0.2)
    assert kept.shape == logits.shape
    assert torch.isinf(kept[0]).tolist() == [False, False, False, True]
    assert torch.isinf(kept[1]).tolist() == [True, True, True, False]  # eşik 0.16


def test_uretimde_uygulanir() -> None:
    logits = _logits([[0.04, 0.06, 0.1, 0.8]] * 4)
    history = torch.zeros((4, 0), dtype=torch.long)
    config = SamplingConfig(temperature=1.0, min_p=0.5)
    for seed in range(20):
        chosen = next_token(logits, history, config, make_generator(seed))
        assert chosen.tolist() == [3, 3, 3, 3]


def test_komut_satiri_secenegi() -> None:
    parser = argparse.ArgumentParser()
    add_sampling_args(parser)
    assert sampling_from_args(parser.parse_args([])).min_p == 0.0
    assert sampling_from_args(parser.parse_args(["--min-p", "0.05"])).min_p == 0.05
