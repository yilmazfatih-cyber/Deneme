"""Optimizer tabanı ve SGD (momentumlu olasılıksal gradyan inişi).

Fikir: geri yayılım her parametre için "kayıp hangi yönde artıyor" bilgisini (gradyan) verir;
optimizer parametreyi ters yönde küçük bir adım (öğrenme oranı) kadar oynatır.
Momentum, önceki adımların yönünü hatırlayarak dar vadilerde zikzağı azaltır:

    v ← μ·v + g          p ← p - lr·v

Eğitim adımı kalıbı:  model.zero_grad(); loss.backward(); optimizer.step()
Genişletme: yeni optimizer için `SGD`'yi kopyalayın; yalnız `step` yöntemini yazmanız yeter.
"""

from __future__ import annotations

from collections.abc import Iterable

import numpy as np

from ml_temel.autograd.tensor import Tensor
from ml_temel.ortak.types import Array


class Optimizer:
    """Parametre listesini ve öğrenme oranını tutar; `step` alt sınıfta yazılır."""

    def __init__(self, params: Iterable[Tensor], lr: float) -> None:
        unique: dict[int, Tensor] = {id(p): p for p in params}
        self.params = list(unique.values())
        if not self.params:
            raise ValueError("Optimizer'a hiç parametre verilmedi; `model.parameters()` verin.")
        if lr <= 0.0:
            raise ValueError(f"Öğrenme oranı pozitif olmalı; verilen: {lr}")
        self.lr = lr

    def zero_grad(self) -> None:
        """Bütün gradyanları sıfırlar."""
        for parameter in self.params:
            parameter.grad = None

    def step(self) -> None:
        raise NotImplementedError("Alt sınıf `step` yöntemini tanımlamalı.")


class SGD(Optimizer):
    """Gradyan inişi; `momentum`, `nesterov` ve L2 `weight_decay` isteğe bağlıdır."""

    def __init__(
        self,
        params: Iterable[Tensor],
        lr: float = 0.01,
        momentum: float = 0.0,
        weight_decay: float = 0.0,
        nesterov: bool = False,
    ) -> None:
        super().__init__(params, lr)
        if nesterov and momentum <= 0.0:
            raise ValueError("Nesterov için momentum > 0 olmalı.")
        self.momentum = momentum
        self.weight_decay = weight_decay
        self.nesterov = nesterov
        self._velocity: list[Array | None] = [None] * len(self.params)

    def step(self) -> None:
        for position, parameter in enumerate(self.params):
            if parameter.grad is None:
                continue
            grad = parameter.grad
            if self.weight_decay:
                grad = grad + self.weight_decay * parameter.data
            if self.momentum:
                previous = self._velocity[position]
                velocity = grad if previous is None else self.momentum * previous + grad
                self._velocity[position] = np.array(velocity)
                grad = grad + self.momentum * velocity if self.nesterov else velocity
            parameter.data = parameter.data - self.lr * grad
