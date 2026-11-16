"""Minik GPT: yalnız kod çözücüden oluşan (decoder-only) Transformer dil modeli.

Fikir: belirteç kimlikleri → (belirteç gömmesi + konum gömmesi) → N adet TransformerBlock →
son norm → sözlük boyutunda skorlar (logits). Eğitimde her konum bir SONRAKİ belirteci tahmin
eder (çapraz entropi). Üretimde son konumun skorlarından örnekleyip diziye ekleriz.

Bu sınıf öğretmek ve küçük deneyler içindir (CPU'da saniyeler). Gerçek boyutlu dil modeli için
kardeş temel `havuz/dil-modeli` (PyTorch) kullanılır.
Genişletme: yapı ayarları `GPTConfig` alanlarıdır; yeni ayar eklerken `to_dict` ile dosyaya
yazıldığını unutmayın (eski dosyalar varsayılan değeri alır).
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Self

import numpy as np

from ml_temel.autograd import ops_nn
from ml_temel.autograd.tensor import Tensor, no_grad
from ml_temel.nn import init
from ml_temel.nn.attention import TransformerBlock
from ml_temel.nn.layers import Dropout, Embedding, Linear
from ml_temel.nn.module import Module
from ml_temel.nn.norm import LayerNorm, RMSNorm
from ml_temel.ortak.types import ArrayLike, IntArray, Seed

_CONFIG_KEY = "__config__"


@dataclass(frozen=True)
class GPTConfig:
    """Model yapısı. `block_size`: modelin bir kerede görebildiği en uzun dizi."""

    vocab_size: int
    block_size: int = 32
    n_layer: int = 2
    n_head: int = 2
    n_embd: int = 32
    dropout: float = 0.0
    tie_weights: bool = True  # çıkış katmanı belirteç gömmesiyle aynı ağırlığı paylaşsın
    norm: str = "layer"  # "layer" ya da "rms"


class GPT(Module):
    """`GPT(GPTConfig(vocab_size=65))`; `forward(idx, targets)` → (logits, kayıp)."""

    def __init__(self, config: GPTConfig, rng: Seed = None) -> None:
        generator = init.resolve_rng(rng)
        self.config = config
        self.token_embedding = Embedding(config.vocab_size, config.n_embd, rng=generator)
        self.position_embedding = Embedding(config.block_size, config.n_embd, rng=generator)
        self.dropout = Dropout(config.dropout, rng=generator)
        self.blocks = [
            TransformerBlock(
                config.n_embd,
                config.n_head,
                config.block_size,
                config.dropout,
                config.norm,
                rng=generator,
            )
            for _ in range(config.n_layer)
        ]
        self.final_norm = (
            LayerNorm(config.n_embd) if config.norm == "layer" else RMSNorm(config.n_embd)
        )
        self.head = (
            None
            if config.tie_weights
            else Linear(
                config.n_embd, config.vocab_size, bias=False, rng=generator, init_name="normal"
            )
        )
        # GPT-2'deki gibi: artık yola yazan izdüşümler derinlikle küçülen ölçekle başlar.
        scale = 0.02 / np.sqrt(2.0 * max(config.n_layer, 1))
        for block in self.blocks:
            for layer in (block.attention.proj, block.shrink):
                layer.weight.data = init.normal(layer.weight.shape, generator, std=scale)

    def forward(
        self, indices: ArrayLike, targets: ArrayLike | None = None
    ) -> tuple[Tensor, Tensor | None]:
        """indices: (yığın, uzunluk) tam sayılar; `targets` verilirse çapraz entropi de döner."""
        index = np.atleast_2d(np.asarray(indices))
        length = index.shape[1]
        if length > self.config.block_size:
            raise ValueError(
                f"Dizi uzunluğu ({length}) block_size'ı ({self.config.block_size}) aşıyor. "
                "Girdinin son block_size belirtecini verin."
            )
        x = self.token_embedding(index) + self.position_embedding(np.arange(length))
        x = self.dropout(x)
        for block in self.blocks:
            x = block(x)
        x = self.final_norm(x)
        if self.head is None:
            logits = x @ self.token_embedding.weight.T  # ağırlık paylaşımı
        else:
            logits = self.head(x)
        loss = None if targets is None else ops_nn.cross_entropy(logits, targets)
        return logits, loss

    def generate(
        self,
        indices: ArrayLike,
        max_new_tokens: int,
        temperature: float = 1.0,
        top_k: int | None = None,
        rng: Seed = None,
    ) -> IntArray:
        """Başlangıcı `max_new_tokens` belirteç uzatır; `temperature=0` → hep en olası belirteç."""
        generator = np.random.default_rng(rng) if not isinstance(rng, np.random.Generator) else rng
        sequence = np.atleast_2d(np.asarray(indices, dtype=np.int64))
        was_training = self.training
        self.eval()
        with no_grad():
            for _ in range(max_new_tokens):
                context = sequence[:, -self.config.block_size :]
                logits, _ = self.forward(context)
                last = logits.data[:, -1, :]
                if temperature <= 0.0:
                    chosen = last.argmax(axis=-1)
                else:
                    chosen = _sample(last / temperature, top_k, generator)
                sequence = np.concatenate([sequence, chosen[:, None]], axis=1)
        self.train(was_training)
        return sequence

    def save(self, path: str | Path) -> Path:
        """Ağırlıklarla birlikte yapı ayarlarını da `.npz` dosyasına yazar."""
        target = Path(path)
        if target.suffix != ".npz":
            target = target.with_name(target.name + ".npz")
        target.parent.mkdir(parents=True, exist_ok=True)
        arrays: dict[str, Any] = dict(self.state_dict())
        arrays[_CONFIG_KEY] = np.array(json.dumps(asdict(self.config)))
        np.savez(target, **arrays)
        return target

    def load(self, path: str | Path) -> Self:
        """`save` ile yazılmış dosyadan ağırlıkları yükler (yapı ayarları aynı olmalıdır)."""
        with np.load(Path(path), allow_pickle=False) as archive:
            names = [name for name in archive.files if name != _CONFIG_KEY]
            self.load_state_dict({name: archive[name] for name in names})
        return self

    @classmethod
    def from_file(cls, path: str | Path) -> GPT:
        """Dosyadaki yapı ayarlarıyla modeli kurar ve ağırlıkları yükler."""
        with np.load(Path(path), allow_pickle=False) as archive:
            if _CONFIG_KEY not in archive.files:
                raise ValueError(
                    f"{path} içinde yapı ayarı yok; dosya `GPT.save` ile yazılmış olmalı."
                )
            config = GPTConfig(**json.loads(str(archive[_CONFIG_KEY])))
        return cls(config).load(path)


def _sample(logits: Any, top_k: int | None, rng: np.random.Generator) -> IntArray:
    """Her satır için softmax olasılıklarından bir belirteç örnekler (isteğe bağlı top-k kırpma)."""
    if top_k is not None and top_k < logits.shape[-1]:
        threshold = np.sort(logits, axis=-1)[:, -top_k][:, None]
        logits = np.where(logits < threshold, -np.inf, logits)
    shifted = np.exp(logits - logits.max(axis=-1, keepdims=True))
    probabilities = shifted / shifted.sum(axis=-1, keepdims=True)
    cumulative = probabilities.cumsum(axis=-1)
    draws = rng.random((logits.shape[0], 1))
    chosen: IntArray = np.minimum((cumulative < draws).sum(axis=-1), logits.shape[-1] - 1)
    return chosen
