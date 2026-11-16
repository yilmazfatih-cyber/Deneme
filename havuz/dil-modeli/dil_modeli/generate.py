"""Üretim: istemden yeni belirteçler; tek dizi (akışla) ve toplu üretim.

`generate_ids` belirteçleri tek tek verir ve KV önbelleği kullanır: her adımda yalnız yeni
belirteç modelden geçer. `TextStream` bunu metne çevirir (yarım UTF-8 karakterlerini ve
durdurma yazılarını bekleterek). `generate_batch` birden çok istemi birlikte üretir.
Komut satırı (`cli_run.py`), sunucu (`serve.py`) ve eğitim sırasındaki örnekler bunu kullanır.

Bağlam dolunca: son `max_seq_len // 2` belirteç tutulur, önbellek bu pencereden yeniden
kurulur (`tarayici/model.js` aynı kuralı uygular; eşlik testi bunu da denetler).

Genişletme: Örnekleme kuralları `sampling.py` içindedir; burası yalnız döngüdür.
"""

from __future__ import annotations

from collections.abc import Collection, Generator, Iterator, Sequence

import torch
from torch import Tensor

from .layers import KVCache
from .model import LanguageModel
from .sampling import SamplingConfig, make_generator, next_token
from .tokenizer import StreamDecoder
from .tokenizer_api import Tokenizer


@torch.no_grad()
def _last_logits(model: LanguageModel, ids: Sequence[int], cache: KVCache) -> Tensor:
    """`ids`i önbelleğe ekleyerek modeli çalıştırır; son konumun logitleri (1, sözlük)."""
    device = model.rope_cos.device
    logits: Tensor = model(torch.tensor([list(ids)], dtype=torch.long, device=device), cache=cache)
    return logits[:, -1]


def generate_ids(
    model: LanguageModel,
    prompt_ids: Sequence[int],
    config: SamplingConfig,
    *,
    stop_ids: Collection[int] = (),
    generator: torch.Generator | None = None,
) -> Generator[int]:
    """İstemin devamını tek tek üretir; `stop_ids`ten biri gelince (onu vermeden) durur."""
    limit = model.config.max_seq_len
    history = list(prompt_ids)
    if not history:
        raise ValueError("İstem boş olamaz; en azından belge başı belirtecini (<|bas|>) verin.")
    if generator is None:
        generator = make_generator(config.seed)
    was_training = model.training
    model.eval()
    try:
        pending = history[-(limit - 1) :]  # istem bağlamdan uzunsa sonu tutulur
        cache = model.new_cache()
        for _ in range(config.max_new_tokens):
            if cache.length + len(pending) > limit:  # bağlam doldu: son yarıdan yeniden başla
                pending = history[-(limit // 2) :]
                cache = model.new_cache()
            logits = _last_logits(model, pending, cache)
            window = history[-config.repetition_window :] if config.repetition_window else history
            recent = torch.tensor([window], dtype=torch.long, device=logits.device)
            token = int(next_token(logits, recent, config, generator).item())
            if token in stop_ids:
                return
            yield token
            history.append(token)
            pending = [token]
    finally:
        model.train(was_training)


class StopChecker:
    """Akan metinde durdurma yazılarını arar; yazının başı olabilecek son parçayı bekletir."""

    def __init__(self, stops: Sequence[str]) -> None:
        self._stops = [stop for stop in stops if stop]
        self._buffer = ""

    def feed(self, text: str) -> tuple[str, bool]:
        """Yeni metni ekler -> (şimdi gösterilebilecek metin, durma yazısı bulundu mu)."""
        self._buffer += text
        hits = [index for stop in self._stops if (index := self._buffer.find(stop)) >= 0]
        if hits:
            ready, self._buffer = self._buffer[: min(hits)], ""
            return ready, True
        hold = 0
        for stop in self._stops:  # tamponun sonu bir durma yazısının başıyla örtüşüyor mu?
            for size in range(min(len(stop) - 1, len(self._buffer)), hold, -1):
                if stop.startswith(self._buffer[-size:]):
                    hold = size
                    break
        cut = len(self._buffer) - hold
        ready, self._buffer = self._buffer[:cut], self._buffer[cut:]
        return ready, False

    def flush(self) -> str:
        ready, self._buffer = self._buffer, ""
        return ready


class TextStream:
    """Akışla metin üretimi.

    Kullanım: `for parca in akis: print(parca, end="")`. Bitince `finish_reason`
    ("stop": doğal son ya da durdurma yazısı, "length": belirteç sınırı) ve sayaçlar okunur.
    """

    def __init__(
        self,
        model: LanguageModel,
        tokenizer: Tokenizer,
        prompt_ids: Sequence[int],
        config: SamplingConfig,
        *,
        stop_ids: Collection[int] | None = None,
    ) -> None:
        self._model, self._tokenizer, self._config = model, tokenizer, config
        self._prompt_ids = list(prompt_ids)
        self._stop_ids = {tokenizer.eos_id} if stop_ids is None else set(stop_ids)
        self.prompt_tokens = len(self._prompt_ids)
        self.completion_tokens = 0
        self.finish_reason = "length"

    def __iter__(self) -> Iterator[str]:
        decoder = StreamDecoder(self._tokenizer)
        stopper = StopChecker(self._config.stop)
        tokens = generate_ids(self._model, self._prompt_ids, self._config, stop_ids=self._stop_ids)
        for token in tokens:
            self.completion_tokens += 1
            ready, stopped = stopper.feed(decoder.push(token))
            if ready:
                yield ready
            if stopped:
                self.finish_reason = "stop"
                tokens.close()
                return
        if self.completion_tokens < self._config.max_new_tokens:
            self.finish_reason = "stop"  # model belge/ileti sonu belirtecini üretti
        ready, stopped = stopper.feed(decoder.flush())
        tail = ready if stopped else ready + stopper.flush()
        if stopped:
            self.finish_reason = "stop"
        if tail:
            yield tail


def generate_text(
    model: LanguageModel,
    tokenizer: Tokenizer,
    prompt: str,
    config: SamplingConfig | None = None,
    *,
    add_bos: bool = True,
) -> str:
    """İstemin devamını tek parça metin olarak döndürür (istemin kendisi dahil değildir)."""
    ids = ([tokenizer.bos_id] if add_bos else []) + tokenizer.encode(prompt)
    return "".join(TextStream(model, tokenizer, ids, config or SamplingConfig()))


@torch.no_grad()
def generate_batch(
    model: LanguageModel,
    prompts: Sequence[Sequence[int]],
    config: SamplingConfig,
    *,
    pad_id: int,
    stop_ids: Collection[int] = (),
    generator: torch.Generator | None = None,
) -> list[list[int]]:
    """Birden çok istemi tek yığında üretir; her istem için üretilen kimlikleri döndürür.

    Kısa istemler soldan `pad_id` ile doldurulur ve dolgu dikkat dışı bırakılır; RoPE yalnız
    göreli konuma baktığı için sonuç tek tek üretimle aynıdır. Bağlam kaydırma yoktur:
    en uzun istem + `max_new_tokens` bağlamı aşarsa üretim bağlamın sonunda kesilir.
    """
    if not prompts or any(len(prompt) == 0 for prompt in prompts):
        raise ValueError("Toplu üretimde en az bir istem olmalı ve hiçbiri boş olmamalı.")
    limit = model.config.max_seq_len
    longest = max(len(prompt) for prompt in prompts)
    if longest >= limit:
        raise ValueError(
            f"En uzun istem ({longest} belirteç) bağlamı ({limit}) dolduruyor; kısaltın."
        )
    device = model.rope_cos.device
    if generator is None:
        generator = make_generator(config.seed)
    ids = torch.full((len(prompts), longest), pad_id, dtype=torch.long, device=device)
    real = torch.zeros((len(prompts), longest), dtype=torch.bool, device=device)
    for row, prompt in enumerate(prompts):
        ids[row, longest - len(prompt) :] = torch.tensor(list(prompt), dtype=torch.long)
        real[row, longest - len(prompt) :] = True
    outputs: list[list[int]] = [[] for _ in prompts]
    finished = torch.zeros(len(prompts), dtype=torch.bool, device=device)
    stop = torch.tensor(sorted(stop_ids), dtype=torch.long, device=device)
    was_training = model.training
    model.eval()
    try:
        cache = model.new_cache()
        logits = model(ids, cache=cache, key_mask=real)[:, -1]
        for _ in range(min(config.max_new_tokens, limit - longest)):
            window = ids[:, -config.repetition_window :] if config.repetition_window else ids
            tokens = next_token(logits, window, config, generator)
            finished = finished | torch.isin(tokens, stop)
            for row in torch.nonzero(~finished).flatten().tolist():
                outputs[row].append(int(tokens[row].item()))
            if bool(finished.all()) or cache.length >= limit:
                break
            step = torch.where(finished, torch.full_like(tokens, pad_id), tokens)[:, None]
            ids = torch.cat((ids, step), dim=1)
            real = torch.cat((real, ~finished[:, None]), dim=1)
            logits = model(step, cache=cache, key_mask=real)[:, -1]
    finally:
        model.train(was_training)
    return outputs
