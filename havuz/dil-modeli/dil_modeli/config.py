"""Model yapılandırması, hazır boyutlar ve parametre sayımı.

`ModelConfig` modelin biçimini belirleyen her şeyi taşır; `config.json` olarak kaydedilir.
`model.py`, `train_config.py`, dışa aktarım modülleri ve `tarayici/model.js` kullanır.

Genişletme: Yeni bir hazır boyut için `PRESETS` sözlüğüne satır ekleyin ("YENİ BOYUT BURAYA").
Yeni bir model ayarı eklerseniz: (1) buraya alan + denetim, (2) `count_parameters`,
(3) `export_hf.py` içindeki eşleme, (4) `tarayici/model.js`. Tarif: AGENTS.md.
"""

from __future__ import annotations

import dataclasses
import math
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ModelConfig:
    """LLaMA ailesi çözücünün biçimi. 0 verilen alanlar `__post_init__` içinde doldurulur."""

    vocab_size: int
    dim: int = 128  # gizli boyut (her belirtecin vektör uzunluğu)
    n_layer: int = 4  # blok sayısı
    n_head: int = 4  # dikkat başı sayısı
    n_kv_head: int = 0  # anahtar/değer başı sayısı (GQA); 0: n_head ile aynı
    hidden_dim: int = 0  # SwiGLU ara boyutu; 0: dim'den hesaplanır (~8/3 x dim)
    max_seq_len: int = 256  # bağlam uzunluğu (belirteç)
    rope_base: float = 10000.0
    norm_eps: float = 1e-5
    tie_embeddings: bool = True  # gömme ve çıkış katmanı aynı ağırlığı paylaşır
    dropout: float = 0.0

    def __post_init__(self) -> None:
        if self.n_kv_head == 0:
            object.__setattr__(self, "n_kv_head", self.n_head)
        if self.hidden_dim == 0:
            object.__setattr__(self, "hidden_dim", default_hidden_dim(self.dim))
        for name in ("vocab_size", "dim", "n_layer", "n_head", "n_kv_head", "hidden_dim"):
            if getattr(self, name) < 1:
                raise ValueError(f"Model ayarı '{name}' en az 1 olmalı; verilen: {getattr(self, name)}.")
        if self.max_seq_len < 2:
            raise ValueError("Model ayarı 'max_seq_len' en az 2 olmalı.")
        if self.dim % self.n_head != 0:
            raise ValueError(
                f"'dim' ({self.dim}), 'n_head' ({self.n_head}) sayısına tam bölünmeli. "
                f"Örnek: dim={self.n_head * max(2, 2 * round(self.dim / self.n_head / 2))}."
            )
        if self.head_dim % 2 != 0:
            raise ValueError(
                f"Baş boyutu (dim / n_head = {self.head_dim}) çift olmalı; RoPE boyutları ikişer döndürür."
            )
        if self.n_head % self.n_kv_head != 0:
            raise ValueError(
                f"'n_head' ({self.n_head}), 'n_kv_head' ({self.n_kv_head}) sayısına tam bölünmeli."
            )
        if not 0.0 <= self.dropout < 1.0:
            raise ValueError("'dropout' 0 ile 1 arasında olmalı (1 hariç).")

    @property
    def head_dim(self) -> int:
        return self.dim // self.n_head

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ModelConfig:
        """Sözlükten kurar; bilinmeyen anahtarı sessizce yutmaz."""
        known = {f.name for f in dataclasses.fields(cls)}
        unknown = sorted(set(data) - known)
        if unknown:
            raise ValueError(
                f"Bilinmeyen model ayarı: {', '.join(unknown)}. Geçerli ayarlar: {', '.join(sorted(known))}."
            )
        if "vocab_size" not in data:
            raise ValueError("Model ayarlarında 'vocab_size' eksik.")
        return cls(**data)


def default_hidden_dim(dim: int) -> int:
    """SwiGLU ara boyutu: 8/3 x dim, 32'nin katına yukarı yuvarlanır (LLaMA alışkanlığı)."""
    return 32 * math.ceil(8 * dim / (3 * 32))


# Hazır boyutlar. Parametre sayıları sözlük boyutuna bağlıdır; gerçek sayıyı görmek için:
#   python -m dil_modeli boyutlar --sozluk 8192
PRESETS: dict[str, dict[str, int]] = {
    "bebek": {"dim": 128, "n_layer": 4, "n_head": 4, "max_seq_len": 256},
    "mini": {"dim": 256, "n_layer": 4, "n_head": 4, "max_seq_len": 512},
    "kucuk": {"dim": 512, "n_layer": 8, "n_head": 8, "max_seq_len": 1024},
    "orta": {"dim": 768, "n_layer": 12, "n_head": 12, "max_seq_len": 1024},
    # YENİ BOYUT BURAYA
}


def preset_config(name: str, vocab_size: int, **overrides: Any) -> ModelConfig:
    """Hazır boyuttan yapılandırma kurar; `overrides` tek tek alanları değiştirir."""
    if name not in PRESETS:
        raise ValueError(f"Bilinmeyen model boyutu: {name!r}. Seçenekler: {', '.join(PRESETS)}.")
    return ModelConfig.from_dict({"vocab_size": vocab_size, **PRESETS[name], **overrides})


def count_parameters(config: ModelConfig) -> int:
    """Eğitilebilir parametre sayısını formülle hesaplar (model kurmadan).

    `LanguageModel.num_parameters()` ile aynı sonucu verir (tests/test_model.py).
    """
    kv_dim = config.n_kv_head * config.head_dim
    attention = 2 * config.dim * config.dim + 2 * config.dim * kv_dim  # q, o + k, v
    feed_forward = 3 * config.dim * config.hidden_dim  # gate, up, down
    norms = 2 * config.dim
    embedding = config.vocab_size * config.dim
    head = 0 if config.tie_embeddings else config.vocab_size * config.dim
    return embedding + config.n_layer * (attention + feed_forward + norms) + config.dim + head
