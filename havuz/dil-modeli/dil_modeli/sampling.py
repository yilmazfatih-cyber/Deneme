"""Örnekleme: modelin logitlerinden bir sonraki belirteci seçme kuralları.

Her kural (yineleme cezası, sıcaklık, top-k, top-p) logitleri alıp logit döndüren küçük, saf bir
işlevdir; `next_token` bunları sırayla uygular. `generate.py` kullanır; tarayıcıdaki karşılığı
`tarayici/sampler.js`.

Genişletme (yeni örnekleme yöntemi): (1) `SamplingConfig`e varsayılanı "kapalı" olan bir alan,
(2) `top_k_filter` örneğindeki gibi bir süzgeç işlevi, (3) `next_token` içinde
"YENİ ÖRNEKLEME YÖNTEMİ BURAYA" satırının üstüne çağrısı, (4) tests/test_sampling.py'ye test.
Tarif: AGENTS.md.
"""

from __future__ import annotations

from dataclasses import dataclass

import torch
from torch import Tensor


@dataclass(frozen=True)
class SamplingConfig:
    """Üretim ayarları. Varsayılanlar küçük modeller için makul bir başlangıçtır."""

    max_new_tokens: int = 200  # en çok üretilecek belirteç
    temperature: float = 0.8  # 0: açgözlü (hep en olası belirteç); büyüdükçe çeşitlilik artar
    top_k: int = 0  # yalnız en olası k belirteç arasından seç (0: kapalı)
    top_p: float = 1.0  # olasılık toplamı p'ye ulaşan en küçük kümeden seç (1: kapalı)
    repetition_penalty: float = 1.0  # yakın geçmişte geçen belirteçleri cezalandır (1: kapalı)
    repetition_window: int = 64  # ceza son kaç belirtece baksın (0: tüm geçmiş)
    stop: tuple[str, ...] = ()  # bu yazılardan biri üretilince dur (yazı çıktıya girmez)
    seed: int | None = None  # aynı tohum -> aynı çıktı

    def __post_init__(self) -> None:
        if self.max_new_tokens < 1:
            raise ValueError("'max_new_tokens' en az 1 olmalı.")
        if self.temperature < 0:
            raise ValueError("'temperature' negatif olamaz (0: açgözlü üretim).")
        if self.top_k < 0:
            raise ValueError("'top_k' negatif olamaz (0: kapalı).")
        if not 0.0 < self.top_p <= 1.0:
            raise ValueError("'top_p' 0 ile 1 arasında olmalı (1: kapalı).")
        if self.repetition_penalty <= 0:
            raise ValueError("'repetition_penalty' pozitif olmalı (1: kapalı).")
        if self.repetition_window < 0:
            raise ValueError("'repetition_window' negatif olamaz (0: tüm geçmiş).")
        if any(not text for text in self.stop):
            raise ValueError("Durdurma yazıları boş olamaz.")


def apply_repetition_penalty(logits: Tensor, history: Tensor, penalty: float) -> Tensor:
    """Geçmişte geçen belirteçlerin logitini küçültür: pozitifse böler, negatifse çarpar.

    logits: (B, sözlük), history: (B, H) kimlikler.
    """
    seen = logits.gather(1, history)
    seen = torch.where(seen > 0, seen / penalty, seen * penalty)
    return logits.scatter(1, history, seen)


def top_k_filter(logits: Tensor, k: int) -> Tensor:
    """En büyük k logit dışındakileri -sonsuz yapar (k'inci ile eşit olanlar kalır)."""
    if k <= 0 or k >= logits.shape[-1]:
        return logits
    threshold = torch.topk(logits, k, dim=-1).values[..., -1:]
    return logits.masked_fill(logits < threshold, float("-inf"))


def top_p_filter(logits: Tensor, p: float) -> Tensor:
    """Çekirdek örnekleme: olasılıkları toplamı p'ye ulaşan en olası belirteçler kalır."""
    if p >= 1.0:
        return logits
    ordered, order = torch.sort(logits, dim=-1, descending=True)
    probs = torch.softmax(ordered, dim=-1)
    before = probs.cumsum(dim=-1) - probs  # bu belirteçten ÖNCEKİLERİN toplamı
    ordered = ordered.masked_fill(before >= p, float("-inf"))  # ilk belirteç her zaman kalır
    return torch.full_like(logits, float("-inf")).scatter(-1, order, ordered)


def next_token(
    logits: Tensor,
    history: Tensor,
    config: SamplingConfig,
    generator: torch.Generator | None = None,
) -> Tensor:
    """Son konumun logitlerinden (B, sözlük) her satır için bir belirteç seçer -> (B,)."""
    logits = logits.float()
    if config.repetition_penalty != 1.0 and history.shape[1] > 0:
        logits = apply_repetition_penalty(logits, history, config.repetition_penalty)
    if config.temperature == 0:
        return logits.argmax(dim=-1)
    logits = logits / config.temperature
    logits = top_k_filter(logits, config.top_k)
    logits = top_p_filter(logits, config.top_p)
    # YENİ ÖRNEKLEME YÖNTEMİ BURAYA
    probs = torch.softmax(logits, dim=-1)
    # Örnekleme CPU'da yapılır: tohumlu üretim her aygıtta aynı sayı üretecini kullanır.
    choice = torch.multinomial(probs.cpu(), num_samples=1, generator=generator)
    return choice.squeeze(-1).to(logits.device)


def make_generator(seed: int | None) -> torch.Generator | None:
    """Tohum verilmişse ona bağlı bir üreteç; verilmemişse None (genel üreteç kullanılır)."""
    return None if seed is None else torch.Generator().manual_seed(seed)
