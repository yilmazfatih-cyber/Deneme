"""Gradyan denetimi: otomatik türevin sonucunu sonlu farkla (sayısal türev) karşılaştırır.

Fikir: f'(x) ≈ (f(x + ε) - f(x - ε)) / 2ε. Her girdi elemanını tek tek oynatıp bu oranı ölçeriz;
geri yayılımın verdiği gradyanla aynı çıkmalı. Çıktı skaler değilse sabit rastgele ağırlıklarla
skalere indirilir (böylece tüm Jacobian sınanır). Yeni yazılan her işlem bu denetimden geçmelidir.

Kim kullanır: `tests/test_autograd_ops.py` ve yeni işlem/katman yazan herkes.
Genişletme: gerekmez; yeni işlem için `assert_gradcheck(lambda x: yeni_islem(x), [x])` yazın.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass

import numpy as np

from ml_temel.autograd.tensor import Tensor, no_grad
from ml_temel.ortak.types import Array


@dataclass(frozen=True)
class GradcheckResult:
    """Denetim sonucu: `ok` yanlışsa `message` farkın hangi girdi ve elemanda olduğunu söyler."""

    ok: bool
    max_abs_error: float
    max_rel_error: float
    message: str


def _scalarize(out: Tensor, weights: Array | None) -> float:
    return float(out.data.sum() if weights is None else (out.data * weights).sum())


def numerical_gradients(
    func: Callable[..., Tensor],
    inputs: Sequence[Tensor],
    eps: float = 1e-6,
    weights: Array | None = None,
) -> list[Array]:
    """Her girdi için merkezi sonlu farkla sayısal gradyan (girdiyle aynı biçimde)."""
    gradients: list[Array] = []
    with no_grad():
        for tensor in inputs:
            grad = np.zeros_like(tensor.data)
            flat_data = tensor.data.reshape(-1)  # görünüm: yerinde değiştirip geri alacağız
            flat_grad = grad.reshape(-1)
            for position in range(flat_data.size):
                original = flat_data[position]
                flat_data[position] = original + eps
                upper = _scalarize(func(*inputs), weights)
                flat_data[position] = original - eps
                lower = _scalarize(func(*inputs), weights)
                flat_data[position] = original
                flat_grad[position] = (upper - lower) / (2.0 * eps)
            gradients.append(grad)
    return gradients


def gradcheck(
    func: Callable[..., Tensor],
    inputs: Sequence[Tensor],
    eps: float = 1e-6,
    atol: float = 1e-6,
    rtol: float = 1e-4,
    seed: int = 0,
) -> GradcheckResult:
    """`func(*inputs)` için otomatik türevi sayısal türevle karşılaştırır.

    `inputs` içindeki tensörler requires_grad=True olmalıdır. Fonksiyon rastgelelik içeriyorsa
    (dropout gibi) her çağrıda aynı tohumla aynı sonucu vermelidir.
    """
    for position, tensor in enumerate(inputs):
        if not tensor.requires_grad:
            raise ValueError(f"gradcheck: {position}. girdi requires_grad=True olmalı.")
        tensor.grad = None
    out = func(*inputs)
    weights: Array | None = None
    if out.data.size != 1:
        weights = np.random.default_rng(seed).standard_normal(out.shape)
    if out.requires_grad:
        out.backward(np.ones_like(out.data) if weights is None else weights)
    analytic = [
        tensor.grad if tensor.grad is not None else np.zeros_like(tensor.data) for tensor in inputs
    ]
    numeric = numerical_gradients(func, inputs, eps=eps, weights=weights)

    max_abs = 0.0
    max_rel = 0.0
    problems: list[str] = []
    for position, (ana, num) in enumerate(zip(analytic, numeric, strict=True)):
        difference = np.abs(ana - num)
        if difference.size == 0:
            continue
        max_abs = max(max_abs, float(difference.max()))
        relative: Array = difference / (np.abs(num) + 1e-12)
        max_rel = max(max_rel, float(relative.max()))
        bad = difference > atol + rtol * np.abs(num)
        if bad.any():
            where = np.unravel_index(int(np.argmax(difference)), difference.shape)
            index = tuple(int(i) for i in where)
            problems.append(
                f"{position}. girdi, eleman {index}: otomatik={ana[where]:.8g}, "
                f"sayısal={num[where]:.8g}"
            )
    for tensor in inputs:
        tensor.grad = None
    message = "tamam" if not problems else "Gradyan uyuşmuyor → " + "; ".join(problems)
    return GradcheckResult(not problems, max_abs, max_rel, message)


def assert_gradcheck(
    func: Callable[..., Tensor],
    inputs: Sequence[Tensor],
    eps: float = 1e-6,
    atol: float = 1e-6,
    rtol: float = 1e-4,
    seed: int = 0,
) -> None:
    """`gradcheck` başarısızsa açıklayıcı bir AssertionError fırlatır (testlerde kullanın)."""
    result = gradcheck(func, inputs, eps=eps, atol=atol, rtol=rtol, seed=seed)
    if not result.ok:
        raise AssertionError(
            f"{result.message}. İşlemin `backward` fonksiyonundaki yerel türevi gözden geçirin "
            "(docs/NASIL_CALISIR.md → Geri yayılım)."
        )
