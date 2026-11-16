"""Eniyileyici ve öğrenme oranı çizelgesi: AdamW + ısınma + kosinüs.

`train.py` ve `finetune.py` kullanır.

Genişletme: Başka bir çizelge için `lr_at` yanına yeni bir işlev yazın ve `TrainConfig`e
seçim alanı ekleyin; çizelge adımın saf işlevi olmalı (sürdürme bire bir kalsın diye).
"""

from __future__ import annotations

import math
from collections.abc import Iterable

import torch
from torch import nn


def build_optimizer(
    parameters: Iterable[nn.Parameter],
    *,
    learning_rate: float,
    weight_decay: float,
    betas: tuple[float, float] = (0.9, 0.95),
    fused: bool = False,
) -> torch.optim.AdamW:
    """AdamW kurar. Ağırlık çürümesi yalnız matrislere (>= 2 boyut) uygulanır.

    Tek boyutlu parametreler (RMSNorm kazançları) çürütülmez: onları sıfıra çekmek normu bozar.
    """
    trainable = [param for param in parameters if param.requires_grad]
    if not trainable:
        raise ValueError("Eğitilecek parametre yok (hepsi dondurulmuş).")
    decay = [param for param in trainable if param.dim() >= 2]
    no_decay = [param for param in trainable if param.dim() < 2]
    groups = [
        {"params": decay, "weight_decay": weight_decay},
        {"params": no_decay, "weight_decay": 0.0},
    ]
    return torch.optim.AdamW(groups, lr=learning_rate, betas=betas, fused=fused)


def lr_at(
    step: int, *, base_lr: float, warmup_steps: int, max_steps: int, min_lr_ratio: float
) -> float:
    """`step` numaralı adımın (0'dan başlar) öğrenme oranı.

    Isınma: 0'dan `base_lr`'ye doğrusal. Sonra kosinüsle `base_lr * min_lr_ratio`'ya iner.
    """
    if step < warmup_steps:
        return base_lr * (step + 1) / warmup_steps
    if step >= max_steps:
        return base_lr * min_lr_ratio
    progress = (step - warmup_steps) / max(1, max_steps - warmup_steps)
    cosine = 0.5 * (1.0 + math.cos(math.pi * progress))
    return base_lr * (min_lr_ratio + (1.0 - min_lr_ratio) * cosine)


def set_lr(optimizer: torch.optim.Optimizer, learning_rate: float) -> None:
    for group in optimizer.param_groups:
        group["lr"] = learning_rate
