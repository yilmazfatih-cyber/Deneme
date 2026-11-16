"""Nedensel çok başlı öz-dikkat ve Transformer bloğu.

Fikir: dizideki her konum, kendinden ÖNCEKİ konumlara "ne kadar bakacağını" öğrenir.
Her konum için sorgu (q), anahtar (k), değer (v) vektörleri üretilir; dikkat ağırlığı
softmax(q·kᵀ / √d) ile bulunur ve çıktı, değerlerin bu ağırlıklarla ortalamasıdır.
"Nedensel": üst üçgen maskeyle gelecekteki konumların skoru -∞ yapılır; model kopya çekemez.
"Çok başlı": aynı işlem `n_head` ayrı alt uzayda paralel yapılır ve sonuçlar birleştirilir.

Blok (ön-norm): x = x + dikkat(norm(x));  x = x + mlp(norm(x)).
Ayrıntı ve matematik: docs/NASIL_CALISIR.md → Dikkat.
Genişletme: farklı bir blok düzeni için `TransformerBlock`'u kopyalayın.
"""

from __future__ import annotations

import numpy as np

from ml_temel.autograd import ops_basic, ops_nn, ops_shape
from ml_temel.autograd.tensor import Tensor
from ml_temel.nn import init
from ml_temel.nn.layers import Dropout, Linear
from ml_temel.nn.module import Module
from ml_temel.nn.norm import LayerNorm, RMSNorm
from ml_temel.ortak.types import Seed


class CausalSelfAttention(Module):
    """Girdi ve çıktı biçimi (yığın, dizi uzunluğu, n_embd)."""

    def __init__(
        self,
        n_embd: int,
        n_head: int,
        block_size: int,
        dropout: float = 0.0,
        rng: Seed = None,
    ) -> None:
        if n_embd % n_head != 0:
            raise ValueError(
                f"n_embd ({n_embd}) n_head'e ({n_head}) tam bölünmeli: her baş eşit boyut alır."
            )
        generator = init.resolve_rng(rng)
        self.n_head = n_head
        self.block_size = block_size
        self.query = Linear(n_embd, n_embd, rng=generator, init_name="normal")
        self.key = Linear(n_embd, n_embd, rng=generator, init_name="normal")
        self.value = Linear(n_embd, n_embd, rng=generator, init_name="normal")
        self.proj = Linear(n_embd, n_embd, rng=generator, init_name="normal")
        self.attn_dropout = Dropout(dropout, rng=generator)
        self.resid_dropout = Dropout(dropout, rng=generator)

    def forward(self, x: Tensor) -> Tensor:
        batch, length, n_embd = x.shape
        if length > self.block_size:
            raise ValueError(
                f"Dizi uzunluğu ({length}) block_size'ı ({self.block_size}) aşıyor; girdiyi kırpın."
            )
        head_dim = n_embd // self.n_head

        def split_heads(t: Tensor) -> Tensor:  # (B, T, C) → (B, baş, T, baş_boyutu)
            return t.reshape(batch, length, self.n_head, head_dim).transpose(0, 2, 1, 3)

        q, k, v = split_heads(self.query(x)), split_heads(self.key(x)), split_heads(self.value(x))
        scores = (q @ k.transpose(0, 1, 3, 2)) * (1.0 / np.sqrt(head_dim))  # (B, baş, T, T)
        future = np.triu(np.ones((length, length), dtype=bool), k=1)  # j > i: gelecek
        weights = ops_nn.softmax(ops_shape.masked_fill(scores, future, -np.inf), axis=-1)
        mixed = self.attn_dropout(weights) @ v  # (B, baş, T, baş_boyutu)
        merged = mixed.transpose(0, 2, 1, 3).reshape(batch, length, n_embd)
        return self.resid_dropout(self.proj(merged))


class TransformerBlock(Module):
    """Dikkat + ileri beslemeli ağ; her ikisi de artık (residual) bağlantıyla eklenir."""

    def __init__(
        self,
        n_embd: int,
        n_head: int,
        block_size: int,
        dropout: float = 0.0,
        norm: str = "layer",
        rng: Seed = None,
    ) -> None:
        if norm not in ("layer", "rms"):
            raise ValueError(f"norm 'layer' ya da 'rms' olmalı; verilen: '{norm}'.")
        generator = init.resolve_rng(rng)
        make_norm = LayerNorm if norm == "layer" else RMSNorm
        self.norm1 = make_norm(n_embd)
        self.attention = CausalSelfAttention(n_embd, n_head, block_size, dropout, rng=generator)
        self.norm2 = make_norm(n_embd)
        self.expand = Linear(n_embd, 4 * n_embd, rng=generator, init_name="normal")
        self.shrink = Linear(4 * n_embd, n_embd, rng=generator, init_name="normal")
        self.dropout = Dropout(dropout, rng=generator)

    def forward(self, x: Tensor) -> Tensor:
        x = x + self.attention(self.norm1(x))
        hidden = ops_basic.gelu(self.expand(self.norm2(x)))
        return x + self.dropout(self.shrink(hidden))
