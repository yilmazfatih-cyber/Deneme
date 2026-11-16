"""Normalleştirme katmanları: LayerNorm ve RMSNorm.

Fikir: derin ağlarda ara değerlerin ölçeği katmandan katmana kayar; her örneğin son eksenini
yeniden ölçeklemek eğitimi kararlı kılar.

  LayerNorm  y = (x - ortalama) / √(varyans + ε) · w + b
  RMSNorm    y = x / √(ortalama(x²) + ε) · w      (ortalama çıkarmaz; daha ucuz)

Genişletme: yeni bir norm için `RMSNorm`'u kopyalayın — ilkel işlemlerden kurulduğu için
geri yayılım yazmanız gerekmez.
"""

from __future__ import annotations

import numpy as np

from ml_temel.autograd import ops_nn
from ml_temel.autograd.tensor import Tensor
from ml_temel.nn.module import Module, Parameter


class LayerNorm(Module):
    """Son eksen boyunca ortalamayı 0, varyansı 1 yapar; ölçek ve kayma öğrenilir."""

    def __init__(self, dim: int, eps: float = 1e-5) -> None:
        self.weight = Parameter(np.ones(dim))
        self.bias = Parameter(np.zeros(dim))
        self.eps = eps

    def forward(self, x: Tensor) -> Tensor:
        return ops_nn.layer_norm(x, self.weight, self.bias, self.eps)


class RMSNorm(Module):
    """Son eksenin karekök-ortalama-karesine böler; yalnız ölçek öğrenilir."""

    def __init__(self, dim: int, eps: float = 1e-6) -> None:
        self.weight = Parameter(np.ones(dim))
        self.eps = eps

    def forward(self, x: Tensor) -> Tensor:
        mean_square = (x * x).mean(axis=-1, keepdims=True)
        return x * (mean_square + self.eps) ** -0.5 * self.weight
