"""Aşama 4 — generate(): otoregresif üretim döngüsü, logit işleyicileri ve KV önbelleği.

Gerçek karşılıkları:
  - src/transformers/generation/utils.py          (GenerationMixin.generate, _sample)
  - src/transformers/generation/logits_process.py (TemperatureLogitsWarper, TopKLogitsWarper, TopPLogitsWarper)
  - src/transformers/generation/configuration_utils.py (GenerationConfig)
  - src/transformers/cache_utils.py               (DynamicCache: katman başına K ve V'yi dizi ekseninde biriktirir)
"""

from __future__ import annotations

import dataclasses

import numpy as np


@dataclasses.dataclass
class GenerationConfig:
    max_new_tokens: int = 20
    do_sample: bool = False
    temperature: float = 1.0
    top_k: int = 0
    top_p: float = 1.0
    eos_token_id: int | None = None
    use_cache: bool = True
    seed: int | None = None

    def updated(self, **kwargs):
        unknown = set(kwargs) - {f.name for f in dataclasses.fields(self)}
        if unknown:
            raise TypeError(f"Bilinmeyen üretim parametresi: {sorted(unknown)}")
        return dataclasses.replace(self, **kwargs)


def softmax(x, axis=-1):
    z = x - x.max(axis=axis, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=axis, keepdims=True)


class TemperatureLogitsWarper:
    def __init__(self, temperature):
        if temperature <= 0:
            raise ValueError("temperature > 0 olmalı")
        self.temperature = temperature

    def __call__(self, input_ids, scores):
        return scores / self.temperature


class TopKLogitsWarper:
    def __init__(self, top_k):
        self.top_k = top_k

    def __call__(self, input_ids, scores):
        k = min(self.top_k, scores.shape[-1])
        kth = np.sort(scores, axis=-1)[:, -k][:, None]  # k'ıncı en büyük değer
        return np.where(scores < kth, -np.inf, scores)


class TopPLogitsWarper:
    """Çekirdek (nucleus) örnekleme: olasılık kütlesi top_p'ye ulaşana kadar en olası belirteçleri tut."""

    def __init__(self, top_p):
        self.top_p = top_p

    def __call__(self, input_ids, scores):
        order = np.argsort(-scores, axis=-1)
        probs = np.take_along_axis(softmax(scores), order, axis=-1)
        cum = np.cumsum(probs, axis=-1)
        remove_sorted = cum - probs >= self.top_p  # bu belirteçten önceki kütle zaten yeterli
        remove = np.zeros_like(remove_sorted)
        np.put_along_axis(remove, order, remove_sorted, axis=-1)
        return np.where(remove, -np.inf, scores)


class LogitsProcessorList(list):
    def __call__(self, input_ids, scores):
        for proc in self:
            scores = proc(input_ids, scores)
        return scores


class GenerationMixin:
    generation_config = GenerationConfig()

    def _get_logits_processor(self, gc):
        procs = LogitsProcessorList()
        if gc.do_sample:
            if gc.temperature != 1.0:
                procs.append(TemperatureLogitsWarper(gc.temperature))
            if gc.top_k:
                procs.append(TopKLogitsWarper(gc.top_k))
            if gc.top_p < 1.0:
                procs.append(TopPLogitsWarper(gc.top_p))
        return procs

    def generate(self, input_ids, generation_config=None, **kwargs):
        gc = (generation_config or self.generation_config).updated(**kwargs)
        if gc.eos_token_id is None:
            gc = gc.updated(eos_token_id=getattr(self.config, "eos_token_id", None))
        ids = np.atleast_2d(np.asarray(input_ids, dtype=np.int64))
        processors = self._get_logits_processor(gc)
        rng = np.random.default_rng(gc.seed)
        past = None
        done = np.zeros(ids.shape[0], dtype=bool)
        for _ in range(gc.max_new_tokens):
            if ids.shape[1] >= self.config.n_positions:
                break  # konum gömmeleri bitti
            if gc.use_cache:
                # Önbellek varsa yalnızca son belirteci ver: geçmişin K/V'si yeniden hesaplanmaz
                step_ids = ids if past is None else ids[:, -1:]
                out = self.forward(step_ids, past_key_values=past, use_cache=True)
                past = out.past_key_values
            else:
                out = self.forward(ids)  # her adımda tüm dizi baştan: O(n^2) iş
            scores = processors(ids, out.logits[:, -1, :])
            if gc.do_sample:
                probs = softmax(scores)
                nxt = np.array([rng.choice(probs.shape[-1], p=p) for p in probs])
            else:
                nxt = scores.argmax(axis=-1)
            if gc.eos_token_id is not None:
                nxt = np.where(done, gc.eos_token_id, nxt)  # bitmiş dizileri eos ile doldur
                done |= nxt == gc.eos_token_id
            ids = np.concatenate([ids, nxt[:, None]], axis=1)
            if done.all():
                break
        return ids
