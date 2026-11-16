"""Değerlendirme: ortalama kayıp, şaşkınlık (perplexity) ve karakter başına bit.

Şaşkınlık = exp(belirteç başına ortalama kayıp). Tokenizer'a bağlıdır; farklı sözlüklü iki
modeli karşılaştırmak için karakter başına bit (toplam bilgi / karakter sayısı / ln 2) kullanın.
Uzun metin kayan pencereyle değerlendirilir: her belirteç en az `bağlam - adım` belirteçlik
bağlamla ve yalnız bir kez sayılır. `train.py` ara doğrulamada `mean_loss`u kullanır.

Genişletme: Yeni bir ölçüt (ör. ilk-k doğruluk) için `_score_windows` döngüsüne ekleyin ve
`EvalResult`a alan açın; tests/test_evaluate.py'de elle hesaplanmış küçük bir örnekle sınayın.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from torch import Tensor

from .corpus import CorpusOptions, expand_inputs, iter_pieces
from .device import Precision, autocast
from .model import IGNORE_INDEX, LanguageModel
from .tokenizer_api import Tokenizer

FP32 = Precision("fp32", None, False)


@torch.no_grad()
def loss_sum(
    model: LanguageModel,
    batches: Iterable[tuple[Tensor, Tensor]],
    device: torch.device,
    precision: Precision = FP32,
) -> tuple[float, int]:
    """Yığınlar üzerinde toplam kayıp (nat) ve sayılan hedef belirteç sayısı."""
    was_training = model.training
    model.eval()
    total, count = 0.0, 0
    try:
        for inputs, targets in batches:
            inputs, targets = inputs.to(device), targets.to(device)
            with autocast(device, precision):
                logits = model(inputs)
            losses = F.cross_entropy(
                logits.float().reshape(-1, logits.shape[-1]),
                targets.reshape(-1),
                ignore_index=IGNORE_INDEX,
                reduction="sum",
            )
            total += float(losses.item())
            count += int((targets != IGNORE_INDEX).sum().item())
    finally:
        model.train(was_training)
    return total, count


def mean_loss(
    model: LanguageModel,
    batches: Iterable[tuple[Tensor, Tensor]],
    device: torch.device,
    precision: Precision = FP32,
) -> float:
    """Belirteç başına ortalama kayıp (nat)."""
    total, count = loss_sum(model, batches, device, precision)
    if count == 0:
        raise ValueError("Değerlendirilecek belirteç yok; daha uzun bir metin verin.")
    return total / count


@dataclass(frozen=True)
class EvalResult:
    loss: float  # belirteç başına ortalama kayıp (nat)
    perplexity: float  # exp(loss)
    bits_per_char: float  # toplam kayıp / ln(2) / karakter sayısı
    tokens: int  # tahmin edilen belirteç sayısı
    chars: int  # metindeki karakter sayısı

    def to_dict(self) -> dict[str, float | int]:
        return {
            "kayip": round(self.loss, 6),
            "saskinlik": round(self.perplexity, 4),
            "karakter_basina_bit": round(self.bits_per_char, 6),
            "belirtec": self.tokens,
            "karakter": self.chars,
        }


def sliding_windows(
    ids: np.ndarray, context: int, stride: int
) -> Iterator[tuple[np.ndarray, np.ndarray]]:
    """Kayan pencereler: (girdi, hedef); daha önce sayılmış hedefler IGNORE_INDEX olur.

    Her hedef tam bir kez sayılır; ilk pencereden sonrakiler en az `context - stride` belirteçlik
    bağlam görür.
    """
    if not 1 <= stride <= context:
        raise ValueError(f"Adım (stride) 1 ile bağlam ({context}) arasında olmalı.")
    last = len(ids) - 1  # son hedefin konumu
    begin, scored = 0, 0
    while scored < last:
        end = min(begin + context, last)
        inputs = ids[begin:end].astype(np.int64)
        targets = ids[begin + 1 : end + 1].astype(np.int64)
        if scored > begin:
            targets[: scored - begin] = IGNORE_INDEX
        yield inputs, targets
        scored, begin = end, begin + stride


def _score_windows(
    model: LanguageModel,
    windows: Iterable[tuple[np.ndarray, np.ndarray]],
    batch_size: int,
    device: torch.device,
) -> tuple[float, int]:
    """Aynı uzunluktaki pencereleri yığınlayıp toplam kaybı hesaplar."""
    total, count = 0.0, 0
    group: list[tuple[np.ndarray, np.ndarray]] = []

    def flush() -> None:
        nonlocal total, count
        if group:
            inputs = torch.from_numpy(np.stack([w[0] for w in group]))
            targets = torch.from_numpy(np.stack([w[1] for w in group]))
            part_total, part_count = loss_sum(model, [(inputs, targets)], device)
            total, count = total + part_total, count + part_count
            group.clear()

    for window in windows:
        if group and (len(group) == batch_size or len(window[0]) != len(group[0][0])):
            flush()
        group.append(window)
    flush()
    return total, count


def evaluate_text(
    model: LanguageModel,
    tokenizer: Tokenizer,
    inputs: Sequence[str | Path],
    *,
    corpus_options: CorpusOptions | None = None,
    stride: int | None = None,
    batch_size: int = 8,
    device: torch.device | None = None,
) -> EvalResult:
    """Dosyalardaki metni eğitimdeki gibi kodlar (<|bas|> ... <|son|>) ve ölçer."""
    ids: list[int] = []
    chars = 0
    for piece in iter_pieces(expand_inputs(inputs), corpus_options):
        ids.extend(([tokenizer.bos_id] if piece.first else []) + tokenizer.encode(piece.text))
        if piece.last:
            ids.append(tokenizer.eos_id)
        chars += len(piece.text)
    if len(ids) < 2 or chars == 0:
        raise ValueError("Değerlendirilecek metin çok kısa.")
    context = model.config.max_seq_len
    windows = sliding_windows(np.asarray(ids), context, stride or max(1, context // 2))
    total, count = _score_windows(model, windows, batch_size, device or torch.device("cpu"))
    loss = total / count
    return EvalResult(loss, math.exp(loss), total / math.log(2) / chars, count, chars)
