"""Değerlendirme: kayan pencerede her hedef tam bir kez sayılır; ölçütler elle hesapla aynı."""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import pytest
import torch

from dil_modeli.config import ModelConfig
from dil_modeli.evaluate import evaluate_text, loss_sum, mean_loss, sliding_windows
from dil_modeli.model import IGNORE_INDEX, LanguageModel
from dil_modeli.tokenizer import BPETokenizer


@pytest.mark.parametrize(
    ("length", "context", "stride"), [(50, 8, 4), (9, 8, 8), (8, 8, 3), (100, 16, 1)]
)
def test_sliding_windows_count_every_target_once(length: int, context: int, stride: int) -> None:
    ids = np.arange(length)
    counted: list[int] = []
    for number, (inputs, targets) in enumerate(sliding_windows(ids, context, stride)):
        assert len(inputs) == len(targets) <= context
        begin = int(inputs[0])
        assert np.array_equal(inputs, np.arange(begin, begin + len(inputs)))
        for offset, target in enumerate(targets):
            if target != IGNORE_INDEX:
                assert target == begin + offset + 1  # hedef, girdinin bir sonraki belirteci
                counted.append(int(target))
                if number > 0:  # ilk pencereden sonra en az (bağlam - adım) belirteçlik geçmiş
                    assert offset >= context - stride
    assert counted == list(range(1, length))
    with pytest.raises(ValueError, match="Adım"):
        list(sliding_windows(ids, context, context + 1))


def test_evaluate_text_matches_manual_computation(tokenizer: BPETokenizer, tmp_path: Path) -> None:
    torch.manual_seed(0)
    model = LanguageModel(
        ModelConfig(vocab_size=tokenizer.vocab_size, dim=32, n_layer=2, n_head=2, max_seq_len=16)
    )
    text = (
        "Korkma, sönmez bu şafaklarda yüzen al sancak; sönmeden yurdumun üstünde tüten en son ocak."
    )
    path = tmp_path / "metin.txt"
    path.write_text(text, encoding="utf-8")
    result = evaluate_text(model.eval(), tokenizer, [path], stride=16)
    ids = [tokenizer.bos_id, *tokenizer.encode(text), tokenizer.eos_id]
    total = 0.0
    with torch.no_grad():  # adım = bağlam: çakışmayan pencereler, her pencere ayrı hesaplanır
        for start in range(0, len(ids) - 1, 16):
            window = torch.tensor([ids[start : start + 17]])
            logits = model(window[:, :-1])
            total += torch.nn.functional.cross_entropy(
                logits[0], window[0, 1:], reduction="sum"
            ).item()
    assert result.tokens == len(ids) - 1
    assert result.chars == len(text)
    assert result.loss == pytest.approx(total / (len(ids) - 1), rel=1e-5)
    assert result.perplexity == pytest.approx(math.exp(result.loss), rel=1e-6)
    assert result.bits_per_char == pytest.approx(total / math.log(2) / len(text), rel=1e-5)
    overlapping = evaluate_text(model, tokenizer, [path], stride=4)
    assert overlapping.tokens == result.tokens  # pencere çakışsa da her belirteç bir kez sayılır


def test_loss_helpers_ignore_masked_targets() -> None:
    torch.manual_seed(0)
    model = LanguageModel(
        ModelConfig(vocab_size=50, dim=16, n_layer=1, n_head=2, max_seq_len=8)
    ).eval()
    inputs = torch.randint(0, 50, (2, 6), generator=torch.Generator().manual_seed(1))
    targets = inputs.roll(-1, dims=1)
    targets[:, :2] = IGNORE_INDEX
    total, count = loss_sum(model, [(inputs, targets)], torch.device("cpu"))
    assert count == 8
    assert mean_loss(model, [(inputs, targets)], torch.device("cpu")) == pytest.approx(
        total / count
    )
    with pytest.raises(ValueError, match="belirteç yok"):
        mean_loss(model, [], torch.device("cpu"))
