"""Optimizer'lar elle hesaplanan başvuru değerleriyle; çizelgeler ve kırpma bilinen sonuçlarla."""

from __future__ import annotations

import itertools

import numpy as np
import pytest

from ml_temel import optim
from ml_temel.autograd import Tensor


def quadratic_grad(p: Tensor) -> None:
    """f(p) = ½·Σ c·p² için gradyanı elle yazar (c = [1, 10])."""
    p.grad = np.array([1.0, 10.0]) * p.data


def test_sgd_plain_momentum_nesterov_match_reference() -> None:
    for momentum, nesterov in ((0.0, False), (0.9, False), (0.9, True)):
        p = Tensor([1.0, -2.0], requires_grad=True)
        optimizer = optim.SGD([p], lr=0.01, momentum=momentum, nesterov=nesterov, weight_decay=0.1)
        expected = p.data.copy()
        velocity = np.zeros(2)
        for step in range(5):
            quadratic_grad(p)
            optimizer.step()
            grad = np.array([1.0, 10.0]) * expected + 0.1 * expected
            if momentum:
                velocity = grad if step == 0 else momentum * velocity + grad
                grad = grad + momentum * velocity if nesterov else velocity
            expected = expected - 0.01 * grad
        np.testing.assert_allclose(p.data, expected, rtol=1e-12)


def reference_adam(decoupled: bool, steps: int, lr: float, wd: float) -> np.ndarray:
    p = np.array([1.0, -2.0])
    m = np.zeros(2)
    v = np.zeros(2)
    for t in range(1, steps + 1):
        g = np.array([1.0, 10.0]) * p
        if decoupled:
            p = p - lr * wd * p
        else:
            g = g + wd * p
        m = 0.9 * m + 0.1 * g
        v = 0.999 * v + 0.001 * g * g
        p = p - lr * (m / (1 - 0.9**t)) / (np.sqrt(v / (1 - 0.999**t)) + 1e-8)
    return p


@pytest.mark.parametrize("decoupled", [False, True])
def test_adam_and_adamw_match_reference(decoupled: bool) -> None:
    p = Tensor([1.0, -2.0], requires_grad=True)
    cls = optim.AdamW if decoupled else optim.Adam
    optimizer = cls([p], lr=0.05, weight_decay=0.1)
    for _ in range(7):
        quadratic_grad(p)
        optimizer.step()
    np.testing.assert_allclose(p.data, reference_adam(decoupled, 7, 0.05, 0.1), rtol=1e-12)


def test_first_adam_step_has_size_lr() -> None:
    p = Tensor([3.0, -4.0], requires_grad=True)
    p.grad = np.array([0.001, -500.0])
    optim.Adam([p], lr=0.1).step()
    np.testing.assert_allclose(p.data, [2.9, -3.9], atol=1e-6)


def test_optimizer_skips_parameters_without_gradient_and_validates_input() -> None:
    a = Tensor([1.0], requires_grad=True)
    b = Tensor([1.0], requires_grad=True)
    a.grad = np.array([1.0])
    optimizer = optim.SGD([a, b, a], lr=0.5)
    assert len(optimizer.params) == 2  # aynı parametre iki kez verilse de bir kez güncellenir
    optimizer.step()
    np.testing.assert_allclose(a.data, [0.5])
    np.testing.assert_allclose(b.data, [1.0])
    optimizer.zero_grad()
    assert a.grad is None
    with pytest.raises(ValueError, match="parametre"):
        optim.SGD([], lr=0.1)
    with pytest.raises(ValueError, match="pozitif"):
        optim.Adam([a], lr=0.0)


def test_warmup_cosine_schedule_values() -> None:
    rate = [optim.warmup_cosine(step, 1.0, 10, 110, min_lr=0.1) for step in range(120)]
    assert rate[0] == pytest.approx(0.1)
    assert rate[9] == pytest.approx(1.0)
    assert rate[10] == pytest.approx(1.0)
    assert rate[60] == pytest.approx(0.55)  # kosinüsün tam ortası
    assert rate[110] == pytest.approx(0.1)
    assert rate[119] == pytest.approx(0.1)
    assert all(a >= b for a, b in itertools.pairwise(rate[10:]))
    assert optim.warmup_linear(0, 2.0, 4) == pytest.approx(0.5)
    assert optim.warmup_linear(10, 2.0, 4) == 2.0
    assert optim.step_decay(25, 1.0, 10, gamma=0.5) == pytest.approx(0.25)
    assert optim.constant(1000, 0.3) == 0.3


def test_scheduler_sets_optimizer_rate() -> None:
    p = Tensor([1.0], requires_grad=True)
    optimizer = optim.SGD([p], lr=1.0)
    scheduler = optim.LRScheduler(optimizer, lambda step: optim.warmup_linear(step, 0.4, 4))
    seen = [scheduler.step() for _ in range(5)]
    assert seen == pytest.approx([0.1, 0.2, 0.3, 0.4, 0.4])
    assert optimizer.lr == pytest.approx(0.4)


def test_gradient_clipping() -> None:
    a = Tensor([0.0, 0.0], requires_grad=True)
    b = Tensor([0.0], requires_grad=True)
    c = Tensor([0.0], requires_grad=True)  # gradyanı yok: atlanmalı
    a.grad = np.array([3.0, 0.0])
    b.grad = np.array([4.0])
    norm = optim.clip_grad_norm_([a, b, c], max_norm=1.0)
    assert norm == pytest.approx(5.0)
    assert a.grad is not None and b.grad is not None
    np.testing.assert_allclose(a.grad, [0.6, 0.0])
    np.testing.assert_allclose(b.grad, [0.8])
    assert optim.clip_grad_norm_([a, b], max_norm=10.0) == pytest.approx(1.0)  # dokunmaz
    np.testing.assert_allclose(b.grad, [0.8])
    a.grad = np.array([-7.0, 0.2])
    optim.clip_grad_value_([a], 0.5)
    np.testing.assert_allclose(a.grad, [-0.5, 0.2])
