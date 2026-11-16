"""Sohbet verisiyle ince ayar: LoRA (varsayılan) ya da tam ince ayar.

Girdi: eğitilmiş bir model klasörü + `{"messages": [...]}` satırlarından oluşan JSONL.
Kayıp yalnız asistan belirteçlerinde hesaplanır (`chat.encode_for_training`). Çıktı klasörü:
    adaptor/   yalnız LoRA ağırlıkları (temel modelle birlikte kullanılır; tam ince ayarda yok)
    birlesik/  ek katılmış, tek başına çalışan model klasörü (uret, sohbet, sun, disa-aktar)
    gunluk.jsonl

Genişletme: Başka bir veri biçimi (ör. talimat/yanıt sütunları) için `chat.py`de iletilere
çeviren bir okuyucu yazın; döngü değişmez.
"""

from __future__ import annotations

import math
import zlib
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import Tensor

from .chat import encode_for_training, load_chat_jsonl
from .evaluate import mean_loss
from .lora import DEFAULT_TARGETS, LoRAConfig, apply_lora, remove_lora, save_adapter
from .model import IGNORE_INDEX, LanguageModel, lm_loss
from .model_io import load_model, save_model
from .optim import build_optimizer, lr_at, set_lr
from .tokenizer import ASSISTANT, END_OF_TURN
from .tokenizer_api import Tokenizer
from .train_state import LOG_NAME, JsonlLogger

ADAPTER_DIR, MERGED_DIR = "adaptor", "birlesik"
Pair = tuple[list[int], list[int]]


@dataclass(frozen=True)
class FinetuneConfig:
    model_dir: str
    data: str
    out_dir: str
    lora: bool = True  # False: bütün ağırlıklar eğitilir (tam ince ayar)
    rank: int = 8
    alpha: float = 16.0
    lora_dropout: float = 0.0
    targets: tuple[str, ...] = field(default=DEFAULT_TARGETS)
    max_steps: int = 200
    batch_size: int = 8
    learning_rate: float = 1e-3  # LoRA için; tam ince ayarda 1e-4 civarı deneyin
    warmup_steps: int = 10
    weight_decay: float = 0.0
    grad_clip: float = 1.0
    val_fraction: float = 0.1
    eval_every: int = 50
    max_len: int = 0  # 0: modelin bağlamı
    seed: int = 0


@dataclass(frozen=True)
class FinetuneResult:
    steps: int
    first_loss: float
    last_loss: float
    val_loss: float | None
    trainable_parameters: int
    examples: int


def _split(pairs: list[Pair], fraction: float, seed: int) -> tuple[list[Pair], list[Pair]]:
    """Örnek bazında belirlenimci ayrım. Oran > 0 ve en az iki örnek varsa doğrulama boş kalmaz."""
    train: list[Pair] = []
    val: list[Pair] = []
    for index, pair in enumerate(pairs):
        is_val = zlib.crc32(f"{seed}:{index}".encode()) / 2**32 < fraction
        (val if is_val else train).append(pair)
    if not train:
        train, val = val[:1], val[1:]
    if not val and fraction > 0 and len(train) > 1:
        val = [train.pop()]
    return train, val


def collate(pairs: list[Pair], pad_id: int) -> tuple[Tensor, Tensor]:
    """Sağdan doldurur: girdi `pad_id`, hedef IGNORE_INDEX (dolgu kayba katılmaz)."""
    width = max(len(inputs) for inputs, _ in pairs)
    inputs = torch.full((len(pairs), width), pad_id, dtype=torch.long)
    targets = torch.full((len(pairs), width), IGNORE_INDEX, dtype=torch.long)
    for row, (ids, labels) in enumerate(pairs):
        inputs[row, : len(ids)] = torch.tensor(ids)
        targets[row, : len(labels)] = torch.tensor(labels)
    return inputs, targets


def batches(
    pairs: list[Pair], batch_size: int, pad_id: int, seed: int
) -> Iterator[tuple[Tensor, Tensor]]:
    """Sonsuz yığın akışı: her turda örnekler tohumlu olarak karıştırılır."""
    for epoch in range(1_000_000):
        order = np.random.default_rng([seed, epoch]).permutation(len(pairs))
        for start in range(0, len(order), batch_size):
            yield collate([pairs[i] for i in order[start : start + batch_size]], pad_id)


def _prepare(
    config: FinetuneConfig, tokenizer: Tokenizer, max_len: int
) -> tuple[list[Pair], list[Pair]]:
    for name in (ASSISTANT, END_OF_TURN):
        tokenizer.special_id(name)  # sohbet belirteçleri yoksa yol gösteren hata verir
    pairs = []
    for example in load_chat_jsonl(config.data):
        pair = encode_for_training(tokenizer, example.messages, max_len)
        if pair is not None:
            pairs.append(pair)
    if not pairs:
        raise ValueError(
            "Hiçbir örnekte bağlama sığan asistan yanıtı yok; daha kısa örnekler kullanın."
        )
    return _split(pairs, config.val_fraction, config.seed)


def finetune(
    config: FinetuneConfig,
    *,
    log: Callable[[str], None] = print,
    device: torch.device | None = None,
) -> FinetuneResult:
    device = device or torch.device("cpu")
    model, tokenizer = load_model(config.model_dir, device)
    max_len = config.max_len or model.config.max_seq_len
    train_pairs, val_pairs = _prepare(config, tokenizer, max_len)
    torch.manual_seed(config.seed)
    lora_config = LoRAConfig(config.rank, config.alpha, config.lora_dropout, config.targets)
    if config.lora:
        apply_lora(model, lora_config)
    trainable = [p for p in model.parameters() if p.requires_grad]
    optimizer = build_optimizer(
        trainable, learning_rate=config.learning_rate, weight_decay=config.weight_decay
    )
    count = sum(p.numel() for p in trainable)
    log(
        f"{len(train_pairs)} eğitim / {len(val_pairs)} doğrulama örneği | "
        f"eğitilen parametre: {count:,}"
    )
    out = Path(config.out_dir)
    logger = JsonlLogger(out / LOG_NAME, keep_until=None)
    stream = batches(train_pairs, config.batch_size, tokenizer.pad_id, config.seed)
    losses: list[float] = []
    val_loss: float | None = None
    model.train()
    for step in range(config.max_steps):
        set_lr(
            optimizer,
            lr_at(
                step,
                base_lr=config.learning_rate,
                warmup_steps=config.warmup_steps,
                max_steps=config.max_steps,
                min_lr_ratio=0.1,
            ),
        )
        inputs, targets = next(stream)
        loss = lm_loss(model(inputs.to(device)), targets.to(device))
        if not math.isfinite(loss.item()):
            raise FloatingPointError(
                "Kayıp NaN oldu; öğrenme oranını düşürün (ör. --ogrenme-orani 2e-4)."
            )
        loss.backward()
        torch.nn.utils.clip_grad_norm_(trainable, config.grad_clip or math.inf)
        optimizer.step()
        optimizer.zero_grad(set_to_none=True)
        losses.append(loss.item())
        record: dict[str, Any] = {"step": step + 1, "loss": round(loss.item(), 5)}
        if val_pairs and ((step + 1) % config.eval_every == 0 or step + 1 == config.max_steps):
            val_batches = (
                collate(val_pairs[i : i + config.batch_size], tokenizer.pad_id)
                for i in range(0, len(val_pairs), config.batch_size)
            )
            val_loss = record["val_loss"] = round(mean_loss(model, val_batches, device), 5)
            log(f"adım {step + 1:>5} | kayıp {loss.item():.4f} | doğrulama {val_loss:.4f}")
        elif (step + 1) % 10 == 0:
            log(f"adım {step + 1:>5} | kayıp {loss.item():.4f}")
        logger.write(record)
    _save(config, model, tokenizer, lora_config, out, losses, val_loss)
    return FinetuneResult(
        config.max_steps, losses[0], losses[-1], val_loss, count, len(train_pairs) + len(val_pairs)
    )


def _save(
    config: FinetuneConfig,
    model: LanguageModel,
    tokenizer: Tokenizer,
    lora_config: LoRAConfig,
    out: Path,
    losses: list[float],
    val_loss: float | None,
) -> None:
    info = {
        "temel_model": config.model_dir,
        "veri": config.data,
        "adim": config.max_steps,
        "son_kayip": losses[-1],
        "dogrulama_kaybi": val_loss,
    }
    if config.lora:
        save_adapter(out / ADAPTER_DIR, model, lora_config, info)
        remove_lora(model)
    save_model(out / MERGED_DIR, model.eval(), tokenizer, info={**info, "lora": config.lora})
