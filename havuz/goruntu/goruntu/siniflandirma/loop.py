"""Eğitim döngüsünün parçaları: eniyileyici, öğrenme oranı takvimi, bir dönem eğitim, logit toplama.

Kim kullanır: `train.py`. Hepsi torch ister (işlevlerin içinde içe aktarılır).

- AdamW; ağırlık çürümesi yalnız ≥2 boyutlu ağırlıklara (yanlılık ve normalleştirme katmanları hariç).
- Ayrımlı öğrenme oranı: baş `ogrenme_orani`, gövde `ogrenme_orani × govde_oran_carpani`
  (önceden öğrenilmiş özellikler büyük adımla bozulmasın).
- Takvim: doğrusal ısınma + kosinüs azalma, adım başına.
- CUDA'da karma duyarlık: autocast + (fp16'da) GradScaler. CPU'da fp32.

Genişletme: başka bir eniyileyici/takvim için `build_optimizer` / `build_scheduler` içine dal ekleyin;
yapılandırmaya seçenek alanı (config.py) ve hazır ayar değeri yazın.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np

from goruntu.siniflandirma.model import head_parameters


def build_optimizer(model: Any, lr: float, backbone_factor: float, weight_decay: float) -> Any:
    import torch

    head = {id(p) for p in head_parameters(model)}
    groups: dict[tuple[bool, bool], list[Any]] = {}
    for parameter in model.parameters():
        key = (id(parameter) in head, parameter.ndim >= 2)
        groups.setdefault(key, []).append(parameter)
    param_groups = [
        {
            "params": params,
            "lr": lr if is_head else lr * backbone_factor,
            "weight_decay": weight_decay if decays else 0.0,
        }
        for (is_head, decays), params in groups.items()
    ]
    return torch.optim.AdamW(param_groups, lr=lr)


def build_scheduler(optimizer: Any, total_steps: int, warmup_ratio: float) -> Any:
    """Doğrusal ısınma + kosinüs azalma (adım başına `scheduler.step()`)."""
    import torch

    warmup = int(total_steps * warmup_ratio)

    def factor(step: int) -> float:
        if warmup and step < warmup:
            return (step + 1) / warmup
        progress = (step - warmup) / max(1, total_steps - warmup)
        return 0.5 * (1.0 + math.cos(math.pi * min(1.0, progress)))

    return torch.optim.lr_scheduler.LambdaLR(optimizer, factor)


def autocast_context(device: str, amp_dtype: str | None) -> Any:
    import contextlib

    import torch

    if device != "cuda" or amp_dtype is None:
        return contextlib.nullcontext()
    return torch.autocast("cuda", dtype=getattr(torch, amp_dtype))


def train_epoch(
    model: Any,
    loader: Any,
    optimizer: Any,
    scheduler: Any,
    criterion: Any,
    device: str,
    amp_dtype: str | None,
    scaler: Any,
) -> float:
    """Bir dönem eğitir; ortalama kaybı döndürür. `model` eğitim kipine önceden alınmış olmalı."""
    total, count = 0.0, 0
    for batch_images, batch_targets in loader:
        images = batch_images.to(device, non_blocking=True)
        targets = batch_targets.to(device, non_blocking=True)
        optimizer.zero_grad(set_to_none=True)
        with autocast_context(device, amp_dtype):
            loss = criterion(model(images), targets)
        if scaler is not None:
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
        else:
            loss.backward()
            optimizer.step()
        scheduler.step()
        total += float(loss.detach()) * len(targets)
        count += len(targets)
    return total / max(count, 1)


def collect_logits(model: Any, loader: Any, device: str) -> tuple[np.ndarray, np.ndarray]:
    """Değerlendirme: bütün logitler (fp32) ve gerçek etiketler."""
    import torch

    model.eval()
    logits, labels = [], []
    with torch.inference_mode():
        for images, targets in loader:
            logits.append(model(images.to(device)).float().cpu().numpy())
            labels.append(np.asarray(targets))
    if not logits:
        return np.zeros((0, 0), dtype=np.float32), np.zeros((0,), dtype=np.int64)
    return np.concatenate(logits), np.concatenate(labels).astype(np.int64)


def make_loader(
    dataset: Any, batch: int, workers: int, train: bool, seed: int, sampler: Any = None
) -> Any:
    """Eğitimde karıştırır; son yığın tek örnekse atar (BatchNorm tek örnekle eğitilemez)."""
    import torch

    generator = torch.Generator().manual_seed(seed)
    lonely_last = len(dataset) > batch and len(dataset) % batch == 1
    return torch.utils.data.DataLoader(
        dataset,
        batch_size=batch,
        shuffle=train and sampler is None,
        sampler=sampler,
        num_workers=workers,
        generator=generator,
        drop_last=train and lonely_last,
        persistent_workers=workers > 0,
    )
