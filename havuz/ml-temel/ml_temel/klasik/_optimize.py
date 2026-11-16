"""L-BFGS: türevi alınabilen dışbükey amaçları en küçükleyen sınırlı bellekli quasi-Newton yöntemi.

Fikir: gradyan inişi her adımda yalnız eğimi kullanır ve dar vadilerde yavaştır. Newton yöntemi
eğriliği (Hessian) de kullanır ama p×p matris ister. L-BFGS, son `memory` adımdaki
(konum farkı, gradyan farkı) çiftlerinden eğriliğin bir yaklaşığını kurar (iki döngülü özyineleme)
ve adım boyunu Armijo koşuluyla geri izleyerek (backtracking) seçer.

Kim kullanır: `logistic.py` (lojistik regresyon), `svm.py` (doğrusal SVM).
Genişletme: yeni bir model için `fun(x) -> (değer, gradyan)` yazıp `minimize_lbfgs`'e verin;
gradyanı `ml_temel.autograd.numerical_gradients` benzeri bir sonlu farkla sınayın.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from ml_temel.ortak.types import Array

Objective = Callable[[Array], tuple[float, Array]]


@dataclass(frozen=True)
class OptimizeResult:
    """`converged=False`: `max_iter` doldu ya da adım bulunamadı (sonuç yine de kullanılabilir)."""

    x: Array
    fun: float
    grad_max: float
    n_iter: int
    converged: bool


def _direction(grad: Array, history: deque[tuple[Array, Array, float]]) -> Array:
    """İki döngülü özyineleme: yaklaşık ters Hessian × gradyan."""
    q = grad.copy()
    alphas: list[float] = []
    for s, y, rho in reversed(history):
        alpha = rho * float(s @ q)
        q -= alpha * y
        alphas.append(alpha)
    if history:
        s, y, _ = history[-1]
        q *= float(s @ y) / float(y @ y)  # ilk Hessian yaklaşığının ölçeği
    else:
        q /= max(1.0, float(np.abs(grad).sum()))  # ilk adım: temkinli ölçek
    for (s, y, rho), alpha in zip(history, reversed(alphas), strict=True):
        beta = rho * float(y @ q)
        q += (alpha - beta) * s
    return -q


def minimize_lbfgs(
    fun: Objective,
    x0: Array,
    *,
    tol: float = 1e-6,
    max_iter: int = 1000,
    memory: int = 10,
) -> OptimizeResult:
    """`fun`'u `x0`'dan başlayarak en küçükler; gradyanın en büyük mutlak elemanı `tol`'a inince
    durur."""
    x = np.array(x0, dtype=np.float64)
    value, grad = fun(x)
    history: deque[tuple[Array, Array, float]] = deque(maxlen=memory)
    for iteration in range(max_iter):
        grad_max = float(np.max(np.abs(grad), initial=0.0))
        if grad_max <= tol:
            return OptimizeResult(x, value, grad_max, iteration, True)
        direction = _direction(grad, history)
        slope = float(grad @ direction)
        if slope >= 0.0:  # yön iniş değil (sayısal sorun): geçmişi sil, en dik inişe dön
            history.clear()
            direction = _direction(grad, history)
            slope = float(grad @ direction)
        step = 1.0
        while True:  # Armijo: değer en az "eğim × adım"ın küçük bir kesri kadar düşmeli
            candidate = x + step * direction
            new_value, new_grad = fun(candidate)
            if np.isfinite(new_value) and new_value <= value + 1e-4 * step * slope:
                break
            step *= 0.5
            if step < 1e-16:
                grad_max = float(np.max(np.abs(grad), initial=0.0))
                return OptimizeResult(x, value, grad_max, iteration, grad_max <= 10 * tol)
        s, y = candidate - x, new_grad - grad
        curvature = float(s @ y)
        if curvature > 1e-12 * float(y @ y):
            history.append((s, y, 1.0 / curvature))
        previous = value
        x, value, grad = candidate, new_value, new_grad
        if abs(previous - value) <= 1e-15 * max(1.0, abs(value)) and step < 1e-8:
            break
    grad_max = float(np.max(np.abs(grad), initial=0.0))
    return OptimizeResult(x, value, grad_max, max_iter, grad_max <= tol)
