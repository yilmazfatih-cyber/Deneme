"""Gradyan kırpma: patlayan gradyanlara karşı emniyet kemeri.

Fikir: bazen tek bir yığın (batch) çok büyük gradyan üretir ve tek adımda ağırlıkları bozar.
Norm kırpma, bütün gradyanların toplam uzunluğu `max_norm`'u aşıyorsa hepsini aynı oranda
küçültür (yön korunur). Değer kırpma ise her elemanı [-sınır, +sınır] aralığına sıkıştırır.

Kullanım: loss.backward(); clip_grad_norm_(model.parameters(), 1.0); optimizer.step()
Genişletme: gerekmez.
"""

from __future__ import annotations

from collections.abc import Iterable

import numpy as np

from ml_temel.autograd.tensor import Tensor
from ml_temel.ortak.types import Array


def clip_grad_norm_(params: Iterable[Tensor], max_norm: float) -> float:
    """Toplam gradyan normunu `max_norm`'la sınırlar; kırpmadan ÖNCEKİ normu döndürür."""
    with_grad = [p for p in params if p.grad is not None]
    grads: list[Array] = [p.grad for p in with_grad if p.grad is not None]
    total = float(np.sqrt(sum(float((g * g).sum()) for g in grads)))
    if total > max_norm and total > 0.0:
        scale = max_norm / total
        for parameter, grad in zip(with_grad, grads, strict=True):
            parameter.grad = grad * scale
    return total


def clip_grad_value_(params: Iterable[Tensor], clip_value: float) -> None:
    """Her gradyan elemanını [-clip_value, clip_value] aralığına kırpar."""
    for parameter in params:
        if parameter.grad is not None:
            parameter.grad = np.clip(parameter.grad, -clip_value, clip_value)
