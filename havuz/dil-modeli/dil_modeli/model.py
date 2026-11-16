"""Dil modeli: LLaMA ailesiyle uyumlu, yalnız çözücüden oluşan Transformer.

Akış: kimlikler -> gömme -> N x Blok (RMSNorm, RoPE'li dikkat, SwiGLU) -> RMSNorm -> çıkış
katmanı -> her konum için sözlük üzerinde logit. Eğitim `train.py`, üretim `generate.py`,
kayıt/yükleme `model_io.py` içindedir.

Genişletme: Katman eklerken parametre adlarını değiştirmeyin; `export_hf.py` ve
`tarayici/model.js` bu adlara bağlıdır (tests/test_export_hf.py, tarayici/*.test.js yakalar).
"""

from __future__ import annotations

import math

import torch
import torch.nn.functional as F
from torch import Tensor, nn

from .config import ModelConfig
from .layers import Block, KVCache, RMSNorm, rope_table

IGNORE_INDEX = -100  # kayba katılmayan hedef konumlarının değeri


class LanguageModel(nn.Module):
    """Nedensel dil modeli. `forward` logit döndürür; kayıp için `lm_loss` kullanılır."""

    def __init__(self, config: ModelConfig) -> None:
        super().__init__()
        self.config = config
        self.embed = nn.Embedding(config.vocab_size, config.dim)
        self.drop = nn.Dropout(config.dropout)
        self.blocks = nn.ModuleList(Block(config) for _ in range(config.n_layer))
        self.norm = RMSNorm(config.dim, config.norm_eps)
        self.head = nn.Linear(config.dim, config.vocab_size, bias=False)
        if config.tie_embeddings:
            self.head.weight = self.embed.weight
        cos, sin = rope_table(config.head_dim, config.max_seq_len, config.rope_base)
        self.rope_cos: Tensor
        self.rope_sin: Tensor
        self.register_buffer("rope_cos", cos, persistent=False)
        self.register_buffer("rope_sin", sin, persistent=False)
        self._init_weights()

    def _init_weights(self) -> None:
        """Normal(0, 0.02); artık yola yazan izdüşümler derinliğe göre küçültülür (GPT-2 usulü)."""
        std = 0.02
        for name, param in self.named_parameters():
            if param.dim() < 2:
                continue  # RMSNorm ağırlıkları 1 olarak kalır
            residual = name.endswith(("o_proj.weight", "down_proj.weight"))
            scale = std / math.sqrt(2 * self.config.n_layer) if residual else std
            nn.init.normal_(param, mean=0.0, std=scale)

    def num_parameters(self) -> int:
        """Eğitilebilir parametre sayısı (paylaşılan ağırlık bir kez sayılır)."""
        return sum(param.numel() for param in self.parameters())

    def new_cache(self) -> KVCache:
        return KVCache(self.config.n_layer)

    def forward(
        self,
        ids: Tensor,
        *,
        cache: KVCache | None = None,
        key_mask: Tensor | None = None,
    ) -> Tensor:
        """Logitleri hesaplar: (B, T) kimlik -> (B, T, sözlük).

        `cache` verilirse `ids` yalnız yeni belirteçlerdir; geçmiş önbellekten okunur.
        `key_mask` (B, geçmiş + T; True = gerçek belirteç) dolgu konumlarını dikkat dışı bırakır;
        toplu üretimde farklı uzunluktaki istemler soldan doldurulurken kullanılır.
        """
        length = ids.shape[1]
        past = cache.length if cache is not None else 0
        if past + length > self.config.max_seq_len:
            raise ValueError(
                f"Dizi uzunluğu ({past + length}) modelin bağlamını ({self.config.max_seq_len}) "
                "aşıyor. İstemi kısaltın ya da daha büyük 'max_seq_len' ile eğitin."
            )
        cos = self.rope_cos[past : past + length]
        sin = self.rope_sin[past : past + length]
        mask = self._attention_mask(length, past, key_mask)
        causal = mask is None and length > 1
        x = self.drop(self.embed(ids))
        for index, block in enumerate(self.blocks):
            x = block(x, cos, sin, mask, causal, cache, index)
        logits: Tensor = self.head(self.norm(x))
        return logits

    def _attention_mask(self, length: int, past: int, key_mask: Tensor | None) -> Tensor | None:
        """Dikkat maskesi (True = bakabilir). Yalın nedensel durumda None: hızlı yol kullanılır."""
        if key_mask is None and (past == 0 or length == 1):
            return None
        columns = torch.arange(past + length, device=self.rope_cos.device)
        rows = torch.arange(past, past + length, device=self.rope_cos.device)
        allowed = columns[None, :] <= rows[:, None]  # (T, geçmiş + T): geleceğe bakılmaz
        if key_mask is None:
            return allowed
        own = columns[None, :] == rows[:, None]  # dolgu konumu en azından kendine baksın (NaN olmasın)
        return (allowed[None] & (key_mask[:, None, :] | own[None]))[:, None]


def lm_loss(logits: Tensor, targets: Tensor) -> Tensor:
    """Çapraz entropi (nat). Hedefi `IGNORE_INDEX` olan konumlar ortalamaya katılmaz."""
    return F.cross_entropy(
        logits.reshape(-1, logits.shape[-1]).float(), targets.reshape(-1), ignore_index=IGNORE_INDEX
    )
