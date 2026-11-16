"""Temel işlemler: dört işlem, üs, exp/log, etkinleştirmeler (tanh, sigmoid, relu, gelu), matmul.

Her işlem aynı kalıbı izler: (1) numpy ile ileri hesabı yap, (2) `backward(g)` kapanışında çıktı
gradyanı `g`'yi yerel türevle çarpıp girdilere `accumulate` et, (3) `make` ile çıktıyı kur.
Yayınlama (broadcasting) ile ilgilenmeye gerek yok: `accumulate` gradyanı girdinin biçimine indirir.

Genişletme: yeni işlem için `tanh`'ı kopyalayın, `registry.py`'ye kaydedin ve
`tests/test_autograd_ops.py` içine gradyan denetimi durumu ekleyin (kural testi bunu zorlar).
"""

from __future__ import annotations

import numpy as np

from ml_temel.autograd.tensor import Tensor, TensorLike, as_tensor, make, unbroadcast
from ml_temel.ortak.types import Array

_GELU_C = float(np.sqrt(2.0 / np.pi))
_GELU_K = 0.044715


def add(a: TensorLike, b: TensorLike) -> Tensor:
    """a + b"""
    a, b = as_tensor(a), as_tensor(b)

    def backward(g: Array) -> None:
        a.accumulate(g)
        b.accumulate(g)

    return make(a.data + b.data, (a, b), backward, "add")


def sub(a: TensorLike, b: TensorLike) -> Tensor:
    """a - b"""
    a, b = as_tensor(a), as_tensor(b)

    def backward(g: Array) -> None:
        a.accumulate(g)
        b.accumulate(-g)

    return make(a.data - b.data, (a, b), backward, "sub")


def mul(a: TensorLike, b: TensorLike) -> Tensor:
    """a * b (eleman eleman)"""
    a, b = as_tensor(a), as_tensor(b)

    def backward(g: Array) -> None:
        a.accumulate(g * b.data)
        b.accumulate(g * a.data)

    return make(a.data * b.data, (a, b), backward, "mul")


def div(a: TensorLike, b: TensorLike) -> Tensor:
    """a / b (eleman eleman)"""
    a, b = as_tensor(a), as_tensor(b)

    def backward(g: Array) -> None:
        a.accumulate(g / b.data)
        b.accumulate(-g * a.data / (b.data * b.data))

    return make(a.data / b.data, (a, b), backward, "div")


def neg(a: TensorLike) -> Tensor:
    """-a"""
    a = as_tensor(a)

    def backward(g: Array) -> None:
        a.accumulate(-g)

    return make(-a.data, (a,), backward, "neg")


def pow(a: TensorLike, exponent: float) -> Tensor:
    """a ** exponent (üs sabit bir sayıdır; türev üsse göre alınmaz)."""
    a = as_tensor(a)
    try:
        p = float(exponent)
    except TypeError as error:
        raise TypeError(
            "pow: üs bir sayı olmalı. Tensör üs için exp(us * log(taban)) yazın."
        ) from error

    def backward(g: Array) -> None:
        a.accumulate(g * p * a.data ** (p - 1.0))

    return make(a.data**p, (a,), backward, "pow")


def exp(a: TensorLike) -> Tensor:
    """e ** a"""
    a = as_tensor(a)
    out = np.exp(a.data)

    def backward(g: Array) -> None:
        a.accumulate(g * out)

    return make(out, (a,), backward, "exp")


def log(a: TensorLike) -> Tensor:
    """Doğal logaritma (girdi pozitif olmalı; olasılıklar için `log_softmax` daha kararlıdır)."""
    a = as_tensor(a)

    def backward(g: Array) -> None:
        a.accumulate(g / a.data)

    return make(np.log(a.data), (a,), backward, "log")


def sqrt(a: TensorLike) -> Tensor:
    """Karekök"""
    a = as_tensor(a)
    out = np.sqrt(a.data)

    def backward(g: Array) -> None:
        a.accumulate(g * 0.5 / out)

    return make(out, (a,), backward, "sqrt")


def abs(a: TensorLike) -> Tensor:
    """Mutlak değer (0 noktasında alt-türev olarak 0 kullanılır)."""
    a = as_tensor(a)

    def backward(g: Array) -> None:
        a.accumulate(g * np.sign(a.data))

    return make(np.abs(a.data), (a,), backward, "abs")


def tanh(a: TensorLike) -> Tensor:
    """Hiperbolik tanjant; türevi 1 - tanh²."""
    a = as_tensor(a)
    out = np.tanh(a.data)

    def backward(g: Array) -> None:
        a.accumulate(g * (1.0 - out * out))

    return make(out, (a,), backward, "tanh")


def stable_sigmoid(x: Array) -> Array:
    """1 / (1 + e^-x); büyük |x| değerlerinde taşma uyarısı vermeyen biçim."""
    e = np.exp(-np.abs(x))
    return np.where(x >= 0, 1.0 / (1.0 + e), e / (1.0 + e))


def sigmoid(a: TensorLike) -> Tensor:
    """Lojistik sigmoid; türevi s·(1 - s)."""
    a = as_tensor(a)
    out = stable_sigmoid(a.data)

    def backward(g: Array) -> None:
        a.accumulate(g * out * (1.0 - out))

    return make(out, (a,), backward, "sigmoid")


def relu(a: TensorLike) -> Tensor:
    """max(a, 0); türevi a > 0 ise 1, değilse 0."""
    a = as_tensor(a)

    def backward(g: Array) -> None:
        a.accumulate(g * (a.data > 0))

    return make(np.maximum(a.data, 0.0), (a,), backward, "relu")


def gelu(a: TensorLike) -> Tensor:
    """GELU'nun tanh yaklaşımı (GPT-2'deki biçim): 0.5·x·(1 + tanh(√(2/π)·(x + 0.044715·x³)))."""
    a = as_tensor(a)
    x = a.data
    t = np.tanh(_GELU_C * (x + _GELU_K * x**3))

    def backward(g: Array) -> None:
        inner = _GELU_C * (1.0 + 3.0 * _GELU_K * x * x)
        a.accumulate(g * (0.5 * (1.0 + t) + 0.5 * x * (1.0 - t * t) * inner))

    return make(0.5 * x * (1.0 + t), (a,), backward, "gelu")


def matmul(a: TensorLike, b: TensorLike) -> Tensor:
    """Matris çarpımı a @ b; yığın (batch) boyutları yayınlanır, 1 boyutlu vektörler desteklenir."""
    a, b = as_tensor(a), as_tensor(b)
    if a.ndim == 0 or b.ndim == 0:
        raise ValueError("matmul skalerle çalışmaz; skaler çarpım için `*` kullanın.")
    out = a.data @ b.data

    def backward(g: Array) -> None:
        # Vektörleri geçici olarak matrise yükselt: (n,) → (1, n) ya da (n, 1).
        a2 = a.data[None, :] if a.ndim == 1 else a.data
        b2 = b.data[:, None] if b.ndim == 1 else b.data
        batch = np.broadcast_shapes(a2.shape[:-2], b2.shape[:-2])
        g2 = g.reshape((*batch, a2.shape[-2], b2.shape[-1]))
        grad_a = g2 @ np.swapaxes(b2, -1, -2)
        grad_b = np.swapaxes(a2, -1, -2) @ g2
        # Yayınlanmış yığın boyutlarını topla, sonra vektörse özgün biçime dön.
        a.accumulate(unbroadcast(grad_a, a2.shape).reshape(a.shape))
        b.accumulate(unbroadcast(grad_b, b2.shape).reshape(b.shape))

    return make(out, (a, b), backward, "matmul")
