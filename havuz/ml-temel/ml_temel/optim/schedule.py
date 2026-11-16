"""Öğrenme oranı çizelgeleri: adım numarasından öğrenme oranını veren saf fonksiyonlar.

Fikir: eğitimin başında büyük adımlar ağırlıkları savurur (özellikle Adam'ın ortalamaları daha
oturmamışken), sonunda ise küçük adımlar ince ayar yapar. "Isınma + kosinüs" bunu sağlar:
oran önce doğrusal olarak yükselir, sonra yarım kosinüs eğrisiyle `min_lr`'ye iner.

Kullanım:
    scheduler = LRScheduler(optimizer, lambda s: warmup_cosine(s, 3e-3, 20, 500))
    ... her adımda: scheduler.step(); loss.backward(); optimizer.step()
Genişletme: yeni çizelge = `(step, ...) -> float` biçiminde saf fonksiyon.
"""

from __future__ import annotations

import math
from collections.abc import Callable

from ml_temel.optim.optimizer import Optimizer


def constant(step: int, base_lr: float) -> float:
    """Hep aynı oran."""
    return base_lr


def warmup_linear(step: int, base_lr: float, warmup_steps: int) -> float:
    """İlk `warmup_steps` adımda 0'dan `base_lr`'ye doğrusal yükselir, sonra sabit kalır."""
    if warmup_steps <= 0 or step >= warmup_steps:
        return base_lr
    return base_lr * (step + 1) / warmup_steps


def warmup_cosine(
    step: int, base_lr: float, warmup_steps: int, total_steps: int, min_lr: float = 0.0
) -> float:
    """Doğrusal ısınma, ardından `total_steps`'e kadar kosinüs inişi; sonrasında `min_lr`."""
    if step < warmup_steps:
        return base_lr * (step + 1) / warmup_steps
    if step >= total_steps:
        return min_lr
    progress = (step - warmup_steps) / max(total_steps - warmup_steps, 1)
    return min_lr + 0.5 * (base_lr - min_lr) * (1.0 + math.cos(math.pi * progress))


def step_decay(step: int, base_lr: float, step_size: int, gamma: float = 0.1) -> float:
    """Her `step_size` adımda oranı `gamma` ile çarpar."""
    return base_lr * gamma ** (step // step_size)


class LRScheduler:
    """Çizelge fonksiyonunu optimizer'a bağlar: her `step()` çağrısı `optimizer.lr`'yi günceller."""

    def __init__(self, optimizer: Optimizer, schedule: Callable[[int], float]) -> None:
        self.optimizer = optimizer
        self.schedule = schedule
        self.step_count = 0

    def step(self) -> float:
        """Sıradaki adımın oranını ayarlar ve döndürür (`optimizer.step()`'ten ÖNCE çağırın)."""
        rate = self.schedule(self.step_count)
        self.optimizer.lr = rate
        self.step_count += 1
        return rate
