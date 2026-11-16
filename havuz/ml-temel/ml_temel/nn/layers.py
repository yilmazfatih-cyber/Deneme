"""Temel katmanlar: Linear, Embedding, Dropout, etkinleştirmeler, Sequential, MLP.

Her katman küçük bir `Module`'dur: `__init__` içinde parametrelerini kurar, `forward` içinde
`autograd` işlemleriyle ileri hesabı yapar. Geri yayılımı yazmaya gerek yoktur; işlemler halleder.

  Linear      y = x @ W + b          W biçimi (giriş, çıkış) — PyTorch'takinin devriğidir
  Embedding   y = tablo[indeksler]   tam sayı dizisi alır
  Dropout     eğitimde rastgele sıfırlar; `eval()` kipinde hiçbir şey yapmaz

Genişletme: `Linear`'ı kopyalayın; yeni etkinleştirme için `ACTIVATIONS` sözlüğüne ekleyin.
"""

from __future__ import annotations

import itertools
from collections.abc import Callable, Sequence

import numpy as np

from ml_temel.autograd import ops_basic, ops_nn
from ml_temel.autograd.tensor import Tensor
from ml_temel.nn import init
from ml_temel.nn.module import Module, Parameter
from ml_temel.ortak.types import ArrayLike, Seed

ACTIVATIONS: dict[str, Callable[[Tensor], Tensor]] = {
    "relu": ops_basic.relu,
    "tanh": ops_basic.tanh,
    "gelu": ops_basic.gelu,
    "sigmoid": ops_basic.sigmoid,
    # YENİ ETKİNLEŞTİRME BURAYA
}


class Linear(Module):
    """Tam bağlı katman: y = x @ W + b."""

    def __init__(
        self,
        in_features: int,
        out_features: int,
        bias: bool = True,
        rng: Seed = None,
        init_name: str = "kaiming",
    ) -> None:
        generator = init.resolve_rng(rng)
        self.weight = Parameter(init.initialize(init_name, (in_features, out_features), generator))
        self.bias = Parameter(np.zeros(out_features)) if bias else None

    def forward(self, x: Tensor) -> Tensor:
        out = x @ self.weight
        return out + self.bias if self.bias is not None else out


class Embedding(Module):
    """Gömme tablosu: her tam sayı kimliğe öğrenilebilir bir vektör karşılık gelir."""

    def __init__(self, num_embeddings: int, embedding_dim: int, rng: Seed = None) -> None:
        generator = init.resolve_rng(rng)
        self.weight = Parameter(init.normal((num_embeddings, embedding_dim), generator, std=0.02))

    def forward(self, indices: ArrayLike) -> Tensor:
        index = np.asarray(indices)
        if index.dtype.kind not in "iu":
            raise TypeError(
                f"Embedding tam sayı indeks ister; verilen dtype {index.dtype}. "
                "`np.asarray(idx, dtype=np.int64)` ile çevirin."
            )
        size = self.weight.shape[0]
        if index.size and (index.min() < 0 or index.max() >= size):
            raise IndexError(
                f"Embedding indeksleri 0..{size - 1} aralığında olmalı; "
                f"verilen aralık {int(index.min())}..{int(index.max())}."
            )
        return self.weight[index]


class Dropout(Module):
    """Eğitimde her elemanı `p` olasılıkla sıfırlar (aşırı öğrenmeye karşı); `eval()`'de kapalı."""

    def __init__(self, p: float = 0.1, rng: Seed = None) -> None:
        if not 0.0 <= p < 1.0:
            raise ValueError(f"Dropout olasılığı [0, 1) aralığında olmalı; verilen: {p}")
        self.p = p
        self.rng = init.resolve_rng(rng)

    def forward(self, x: Tensor) -> Tensor:
        if not self.training or self.p == 0.0:
            return x
        return ops_nn.dropout(x, self.p, self.rng)


class ReLU(Module):
    def forward(self, x: Tensor) -> Tensor:
        return ops_basic.relu(x)


class Tanh(Module):
    def forward(self, x: Tensor) -> Tensor:
        return ops_basic.tanh(x)


class GELU(Module):
    def forward(self, x: Tensor) -> Tensor:
        return ops_basic.gelu(x)


class Sigmoid(Module):
    def forward(self, x: Tensor) -> Tensor:
        return ops_basic.sigmoid(x)


class Flatten(Module):
    """İlk eksen (örnek) dışındaki bütün eksenleri tek eksene dizer: (N, C, H, W) → (N, C·H·W)."""

    def forward(self, x: Tensor) -> Tensor:
        return x.reshape(x.shape[0], -1)


class Sequential(Module):
    """Katmanları sırayla uygular: Sequential(Linear(2, 8), Tanh(), Linear(8, 1))."""

    def __init__(self, *layers: Module) -> None:
        self.layers = list(layers)

    def forward(self, x: Tensor) -> Tensor:
        for layer in self.layers:
            x = layer(x)
        return x

    def __len__(self) -> int:
        return len(self.layers)

    def __getitem__(self, position: int) -> Module:
        return self.layers[position]


class MLP(Module):
    """Çok katmanlı algılayıcı: `sizes=[2, 16, 16, 1]` → iki gizli katman; çıkış ham skordur."""

    def __init__(
        self,
        sizes: Sequence[int],
        activation: str = "relu",
        dropout: float = 0.0,
        rng: Seed = None,
    ) -> None:
        if len(sizes) < 2:
            raise ValueError("MLP en az giriş ve çıkış boyutunu ister: sizes=[giriş, ..., çıkış].")
        if activation not in ACTIVATIONS:
            raise ValueError(
                f"Bilinmeyen etkinleştirme: '{activation}'. "
                f"Geçerli olanlar: {', '.join(ACTIVATIONS)}."
            )
        generator = init.resolve_rng(rng)
        init_name = "kaiming" if activation in ("relu", "gelu") else "xavier"
        self.activation = activation
        self.linears = [
            Linear(n_in, n_out, rng=generator, init_name=init_name)
            for n_in, n_out in itertools.pairwise(sizes)
        ]
        self.dropout = Dropout(dropout, rng=generator)

    def forward(self, x: Tensor) -> Tensor:
        activate = ACTIVATIONS[self.activation]
        for linear in self.linears[:-1]:
            x = self.dropout(activate(linear(x)))
        return self.linears[-1](x)
