"""Modelin yapı taşları: RMSNorm, RoPE, dikkat (GQA + KV önbelleği), SwiGLU ve blok.

Matematik ve Hugging Face `LlamaForCausalLM` karşılıkları docs/MIMARI.md'de. Buradaki her
işlem HF Llama ile aynı sırada yapılır; ağırlıklar yalnız ad değiştirilerek aktarılır
(`export_hf.py`, eşlik: tests/test_export_hf.py). Tarayıcıdaki karşılığı `tarayici/model.js`.

Genişletme: Yeni bir katman seçeneği için `ModelConfig`e alan ekleyin, burada o alana göre
dallanın, varsayılanı eski davranış olsun. Tarif: AGENTS.md "Yeni dikkat/katman seçeneği".
"""

from __future__ import annotations

import torch
import torch.nn.functional as F
from torch import Tensor, nn

from .config import ModelConfig


class RMSNorm(nn.Module):
    """x / sqrt(ortalama(x^2) + eps) * ağırlık. Ortalama çıkarılmaz, yanlılık yoktur."""

    def __init__(self, dim: int, eps: float) -> None:
        super().__init__()
        self.weight = nn.Parameter(torch.ones(dim))
        self.eps = eps

    def forward(self, x: Tensor) -> Tensor:
        wide = x.float()  # yarım duyarlıkta kare almak taşabilir
        normed = wide * torch.rsqrt(wide.pow(2).mean(-1, keepdim=True) + self.eps)
        return self.weight * normed.to(x.dtype)


def rope_table(head_dim: int, max_len: int, base: float) -> tuple[Tensor, Tensor]:
    """Her konum için cos/sin tablosu, biçim (max_len, head_dim).

    Frekanslar: base^(-2i/head_dim), i = 0..head_dim/2-1. Tablo iki yarıda aynı açıları taşır;
    `apply_rope` boyut i'yi boyut i + head_dim/2 ile eşleştirip döndürür (HF düzeni).
    """
    inv_freq = 1.0 / (base ** (torch.arange(0, head_dim, 2, dtype=torch.float32) / head_dim))
    angles = torch.outer(torch.arange(max_len, dtype=torch.float32), inv_freq)
    table = torch.cat((angles, angles), dim=-1)
    return table.cos(), table.sin()


def apply_rope(x: Tensor, cos: Tensor, sin: Tensor) -> Tensor:
    """(B, baş, T, head_dim) biçimli sorgu/anahtarı konumuna göre döndürür."""
    half = x.shape[-1] // 2
    rotated = torch.cat((-x[..., half:], x[..., :half]), dim=-1)
    return x * cos + rotated * sin


class KVCache:
    """Artımlı çözme için her katmanın geçmiş anahtar ve değerleri.

    Üretimde her adımda yalnız yeni belirteç işlenir; geçmiş belirteçlerin anahtar/değerleri
    buradan okunur. Biçim: (B, n_kv_head, geçmiş uzunluk, head_dim).
    """

    def __init__(self, n_layer: int) -> None:
        self.keys: list[Tensor | None] = [None] * n_layer
        self.values: list[Tensor | None] = [None] * n_layer

    @property
    def length(self) -> int:
        first = self.keys[0]
        return 0 if first is None else int(first.shape[2])

    def extend(self, layer: int, key: Tensor, value: Tensor) -> tuple[Tensor, Tensor]:
        """Yeni anahtar/değerleri ekler, geçmişle birleşmiş hâlini döndürür."""
        old_key, old_value = self.keys[layer], self.values[layer]
        if old_key is not None and old_value is not None:
            key = torch.cat((old_key, key), dim=2)
            value = torch.cat((old_value, value), dim=2)
        self.keys[layer], self.values[layer] = key, value
        return key, value


class Attention(nn.Module):
    """Çok başlı nedensel öz-dikkat. `n_kv_head < n_head` ise GQA: K/V başları paylaşılır."""

    def __init__(self, config: ModelConfig) -> None:
        super().__init__()
        self.n_head = config.n_head
        self.n_kv_head = config.n_kv_head
        self.head_dim = config.head_dim
        self.dropout = config.dropout
        kv_dim = config.n_kv_head * config.head_dim
        self.q_proj = nn.Linear(config.dim, config.dim, bias=False)
        self.k_proj = nn.Linear(config.dim, kv_dim, bias=False)
        self.v_proj = nn.Linear(config.dim, kv_dim, bias=False)
        self.o_proj = nn.Linear(config.dim, config.dim, bias=False)

    def forward(
        self,
        x: Tensor,
        cos: Tensor,
        sin: Tensor,
        mask: Tensor | None,
        causal: bool,
        cache: KVCache | None = None,
        layer: int = 0,
    ) -> Tensor:
        batch, length, _ = x.shape
        q = self.q_proj(x).view(batch, length, self.n_head, self.head_dim).transpose(1, 2)
        k = self.k_proj(x).view(batch, length, self.n_kv_head, self.head_dim).transpose(1, 2)
        v = self.v_proj(x).view(batch, length, self.n_kv_head, self.head_dim).transpose(1, 2)
        q = apply_rope(q, cos, sin)
        k = apply_rope(k, cos, sin)
        if cache is not None:
            k, v = cache.extend(layer, k, v)
        if self.n_kv_head != self.n_head:  # GQA: her K/V başı ardışık birkaç sorgu başına hizmet eder
            repeat = self.n_head // self.n_kv_head
            k = k.repeat_interleave(repeat, dim=1)
            v = v.repeat_interleave(repeat, dim=1)
        out = F.scaled_dot_product_attention(
            q,
            k,
            v,
            attn_mask=mask,
            dropout_p=self.dropout if self.training else 0.0,
            is_causal=causal,
        )
        out = out.transpose(1, 2).reshape(batch, length, self.n_head * self.head_dim)
        return self.o_proj(out)


class FeedForward(nn.Module):
    """SwiGLU: down(silu(gate(x)) * up(x))."""

    def __init__(self, config: ModelConfig) -> None:
        super().__init__()
        self.gate_proj = nn.Linear(config.dim, config.hidden_dim, bias=False)
        self.up_proj = nn.Linear(config.dim, config.hidden_dim, bias=False)
        self.down_proj = nn.Linear(config.hidden_dim, config.dim, bias=False)

    def forward(self, x: Tensor) -> Tensor:
        return self.down_proj(F.silu(self.gate_proj(x)) * self.up_proj(x))


class Block(nn.Module):
    """Ön-normlu artık blok: x + dikkat(norm(x)), sonra x + ileri_besleme(norm(x))."""

    def __init__(self, config: ModelConfig) -> None:
        super().__init__()
        self.attn_norm = RMSNorm(config.dim, config.norm_eps)
        self.attn = Attention(config)
        self.mlp_norm = RMSNorm(config.dim, config.norm_eps)
        self.mlp = FeedForward(config)
        self.drop = nn.Dropout(config.dropout)

    def forward(
        self,
        x: Tensor,
        cos: Tensor,
        sin: Tensor,
        mask: Tensor | None,
        causal: bool,
        cache: KVCache | None = None,
        layer: int = 0,
    ) -> Tensor:
        x = x + self.drop(self.attn(self.attn_norm(x), cos, sin, mask, causal, cache, layer))
        return x + self.drop(self.mlp(self.mlp_norm(x)))
