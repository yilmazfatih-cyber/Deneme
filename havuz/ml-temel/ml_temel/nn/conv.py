"""Evrişim katmanları: Conv2d ve MaxPool2d (görüntü biçimi: örnek, kanal, yükseklik, genişlik).

Fikir: `Conv2d` küçük bir çekirdeği görüntünün her yerinde aynı ağırlıklarla uygular; böylece
bir kenar ya da köşe nerede olursa olsun aynı süzgeçle yakalanır ve parametre sayısı küçük kalır.
`MaxPool2d` komşu pikselleri özetleyip çözünürlüğü düşürür. Asıl hesap `autograd.ops_conv`'dadır.

Örnek: ornekler/06_sekil_evrisim.py (tohumlu sentetik şekilleri sınıflandırır).
Genişletme: ortalama havuzlama için `MaxPool2d`'yi kopyalayın (önce işlemi `ops_conv`'a ekleyin).
"""

from __future__ import annotations

import numpy as np

from ml_temel.autograd import ops_conv
from ml_temel.autograd.tensor import Tensor
from ml_temel.nn import init
from ml_temel.nn.module import Module, Parameter
from ml_temel.ortak.types import Seed


class Conv2d(Module):
    """2B evrişim: (N, in_channels, H, W) → (N, out_channels, H', W')."""

    def __init__(
        self,
        in_channels: int,
        out_channels: int,
        kernel_size: int = 3,
        stride: int = 1,
        padding: int = 0,
        bias: bool = True,
        rng: Seed = None,
    ) -> None:
        generator = init.resolve_rng(rng)
        shape = (out_channels, in_channels, kernel_size, kernel_size)
        self.weight = Parameter(init.kaiming_uniform(shape, generator))
        self.bias = Parameter(np.zeros(out_channels)) if bias else None
        self.stride = stride
        self.padding = padding

    def forward(self, x: Tensor) -> Tensor:
        return ops_conv.conv2d(x, self.weight, self.bias, stride=self.stride, padding=self.padding)


class MaxPool2d(Module):
    """Her `kernel_size × kernel_size` pencerenin en büyüğünü alır."""

    def __init__(self, kernel_size: int = 2, stride: int | None = None) -> None:
        self.kernel_size = kernel_size
        self.stride = stride

    def forward(self, x: Tensor) -> Tensor:
        return ops_conv.max_pool2d(x, self.kernel_size, self.stride)
