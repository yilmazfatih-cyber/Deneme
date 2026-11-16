"""Adam ve AdamW: her parametreye kendi adım boyunu veren optimizer'lar.

Fikir: gradyanın üstel ortalaması (m, yön) ve karesinin üstel ortalaması (v, ölçek) tutulur;
adım m/√v ile atılır. Böylece gradyanı hep küçük olan parametre de anlamlı adımlar atar.
İlk adımlarda ortalamalar sıfıra yanlı olduğundan (1 - βᵗ) ile düzeltilir.

    m ← β₁·m + (1-β₁)·g      v ← β₂·v + (1-β₂)·g²      p ← p - lr · m̂ / (√v̂ + ε)

Adam'da `weight_decay` gradyana eklenir (L2 cezası). AdamW'de ağırlık küçültme gradyandan
AYRI uygulanır (p ← p - lr·wd·p); Transformer eğitiminde yaygın ve genelde daha iyi olan budur.
Genişletme: yeni bir uyarlamalı optimizer için `Adam`'ı kopyalayın.
"""

from __future__ import annotations

from collections.abc import Iterable

import numpy as np

from ml_temel.autograd.tensor import Tensor
from ml_temel.optim.optimizer import Optimizer
from ml_temel.ortak.types import Array


class Adam(Optimizer):
    """Adam; `weight_decay` > 0 ise klasik (gradyana eklenen) L2 cezası uygulanır."""

    decoupled = False

    def __init__(
        self,
        params: Iterable[Tensor],
        lr: float = 1e-3,
        betas: tuple[float, float] = (0.9, 0.999),
        eps: float = 1e-8,
        weight_decay: float = 0.0,
    ) -> None:
        super().__init__(params, lr)
        self.betas = betas
        self.eps = eps
        self.weight_decay = weight_decay
        self.step_count = 0
        self._m: list[Array] = [np.zeros_like(p.data) for p in self.params]
        self._v: list[Array] = [np.zeros_like(p.data) for p in self.params]

    def step(self) -> None:
        self.step_count += 1
        beta1, beta2 = self.betas
        correction1 = 1.0 - beta1**self.step_count
        correction2 = 1.0 - beta2**self.step_count
        for position, parameter in enumerate(self.params):
            if parameter.grad is None:
                continue
            grad = parameter.grad
            data = parameter.data
            if self.weight_decay:
                if self.decoupled:
                    data = data - self.lr * self.weight_decay * data
                else:
                    grad = grad + self.weight_decay * data
            self._m[position] = beta1 * self._m[position] + (1.0 - beta1) * grad
            self._v[position] = beta2 * self._v[position] + (1.0 - beta2) * grad * grad
            m_hat = self._m[position] / correction1
            v_hat = self._v[position] / correction2
            parameter.data = data - self.lr * m_hat / (np.sqrt(v_hat) + self.eps)


class AdamW(Adam):
    """Ayrık ağırlık küçültmeli Adam (Loshchilov & Hutter). Varsayılan `weight_decay=0.01`."""

    decoupled = True

    def __init__(
        self,
        params: Iterable[Tensor],
        lr: float = 1e-3,
        betas: tuple[float, float] = (0.9, 0.999),
        eps: float = 1e-8,
        weight_decay: float = 0.01,
    ) -> None:
        super().__init__(params, lr, betas, eps, weight_decay)
