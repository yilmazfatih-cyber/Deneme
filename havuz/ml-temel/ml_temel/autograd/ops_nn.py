"""Sinir ağı işlemleri: softmax, log-softmax, çapraz entropi, katman normu, ikili çapraz entropi.

Bunlar ilkel işlemlerden de kurulabilirdi; ama sayısal kararlılık (log-sum-exp) ve hız için her biri
tek işlem olarak, elle türetilmiş geri yayılımla yazıldı. Türetmeler: docs/NASIL_CALISIR.md.

  softmax       s = e^(x - max) / Σ           geri: s·(g - Σ g·s)
  log_softmax   x - logsumexp(x)              geri: g - s·Σ g
  cross_entropy -ortalama(log_softmax[hedef]) geri: (s - tek_sıcak) / N
  layer_norm    (x - μ)/√(σ² + ε)·w + b       geri: aşağıdaki fonksiyonda adım adım

Genişletme: yeni kayıp fonksiyonu için `mse_loss`'u (ilkellerden kurulu) kopyalamak en kolayıdır.
"""

from __future__ import annotations

import numpy as np
from numpy.typing import ArrayLike

from ml_temel.autograd.ops_basic import stable_sigmoid
from ml_temel.autograd.tensor import Tensor, TensorLike, as_tensor, make
from ml_temel.ortak.types import Array


def _softmax_data(x: Array, axis: int) -> Array:
    shifted = np.exp(x - x.max(axis=axis, keepdims=True))
    return shifted / shifted.sum(axis=axis, keepdims=True)


def softmax(a: TensorLike, axis: int = -1) -> Tensor:
    """Bir eksen boyunca toplamı 1 olan pozitif ağırlıklar (olasılıklar)."""
    a = as_tensor(a)
    s = _softmax_data(a.data, axis)

    def backward(g: Array) -> None:
        a.accumulate(s * (g - (g * s).sum(axis=axis, keepdims=True)))

    return make(s, (a,), backward, "softmax")


def log_softmax(a: TensorLike, axis: int = -1) -> Tensor:
    """log(softmax(a)) — doğrudan log almak yerine log-sum-exp ile, taşmasız."""
    a = as_tensor(a)
    peak = a.data.max(axis=axis, keepdims=True)
    shifted = a.data - peak
    out = shifted - np.log(np.exp(shifted).sum(axis=axis, keepdims=True))

    def backward(g: Array) -> None:
        a.accumulate(g - np.exp(out) * g.sum(axis=axis, keepdims=True))

    return make(out, (a,), backward, "log_softmax")


def cross_entropy(
    logits: TensorLike, targets: ArrayLike, ignore_index: int | None = None
) -> Tensor:
    """Çok sınıflı çapraz entropi: son eksen sınıf skorları, `targets` tam sayı sınıf numaraları.

    logits (..., C), targets (...). `ignore_index` verilirse o hedefler ortalamaya girmez
    (dolgu belirteçleri için). Çıktı skalerdir (ortalama kayıp).
    """
    logits = as_tensor(logits)
    n_classes = logits.shape[-1]
    flat = logits.data.reshape(-1, n_classes)
    target = np.asarray(targets).reshape(-1).astype(np.int64)
    if target.shape[0] != flat.shape[0]:
        raise ValueError(
            f"cross_entropy: logits {logits.shape} ile targets {np.shape(targets)} uyuşmuyor; "
            "targets, logits'in son eksen hariç biçiminde olmalı."
        )
    active = np.ones(target.shape[0], dtype=bool)
    if ignore_index is not None:
        active = target != ignore_index
    if (target[active] < 0).any() or (target[active] >= n_classes).any():
        raise ValueError(f"cross_entropy: hedef sınıflar 0..{n_classes - 1} aralığında olmalı.")
    count = max(int(active.sum()), 1)
    safe_target = np.where(active, target, 0)
    peak = flat.max(axis=1, keepdims=True)
    log_prob = flat - peak - np.log(np.exp(flat - peak).sum(axis=1, keepdims=True))
    rows = np.arange(flat.shape[0])
    loss = -(log_prob[rows, safe_target] * active).sum() / count

    def backward(g: Array) -> None:
        grad = np.exp(log_prob)
        grad[rows, safe_target] -= 1.0
        grad *= active[:, None] / count
        logits.accumulate((g * grad).reshape(logits.shape))

    return make(loss, (logits,), backward, "cross_entropy")


def binary_cross_entropy_with_logits(logits: TensorLike, targets: ArrayLike) -> Tensor:
    """İkili çapraz entropi; girdi ham skordur: ortalama(max(z,0) - z·y + log(1 + e^-|z|))."""
    logits = as_tensor(logits)
    z = logits.data
    y = np.broadcast_to(np.asarray(targets, dtype=np.float64), z.shape)
    loss = (np.maximum(z, 0.0) - z * y + np.log1p(np.exp(-np.abs(z)))).mean()

    def backward(g: Array) -> None:
        logits.accumulate(g * (stable_sigmoid(z) - y) / z.size)

    return make(loss, (logits,), backward, "binary_cross_entropy_with_logits")


def mse_loss(prediction: TensorLike, target: TensorLike) -> Tensor:
    """Ortalama kare hata — ilkel işlemlerden kurulu olduğu için ayrı geri yayılım gerekmez."""
    difference = as_tensor(prediction) - as_tensor(target)
    return (difference * difference).mean()


def layer_norm(a: TensorLike, weight: TensorLike, bias: TensorLike, eps: float = 1e-5) -> Tensor:
    """Son eksen boyunca ortalamayı 0, varyansı 1 yapar; sonra `weight` ile çarpar, `bias` ekler."""
    a, weight, bias = as_tensor(a), as_tensor(weight), as_tensor(bias)
    mu = a.data.mean(axis=-1, keepdims=True)
    centered = a.data - mu
    std = np.sqrt((centered * centered).mean(axis=-1, keepdims=True) + eps)
    normed = centered / std

    def backward(g: Array) -> None:
        weight.accumulate(g * normed)
        bias.accumulate(g)
        # x̂ = (x - μ)/σ için: ∂L/∂x = (g' - ort(g') - x̂·ort(g'·x̂)) / σ,  g' = g·w
        gn = g * weight.data
        a.accumulate(
            (
                gn
                - gn.mean(axis=-1, keepdims=True)
                - normed * (gn * normed).mean(axis=-1, keepdims=True)
            )
            / std
        )

    return make(normed * weight.data + bias.data, (a, weight, bias), backward, "layer_norm")


def dropout(a: TensorLike, p: float, rng: np.random.Generator) -> Tensor:
    """Eğitimde elemanları p olasılıkla sıfırlar, kalanları 1/(1-p) ile büyütür (ters dropout)."""
    a = as_tensor(a)
    if not 0.0 <= p < 1.0:
        raise ValueError(f"dropout olasılığı [0, 1) aralığında olmalı; verilen: {p}")
    if p == 0.0:
        return a
    mask = (rng.random(a.shape) >= p) / (1.0 - p)
    return a * mask
