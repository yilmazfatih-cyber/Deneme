"""Üretim döngüsü: önbellekli üretim kaba kuvvetle, toplu üretim tek tek üretimle karşılaştırılır."""

from __future__ import annotations

import pytest
import torch

from dil_modeli.config import ModelConfig
from dil_modeli.generate import StopChecker, TextStream, generate_batch, generate_ids, generate_text
from dil_modeli.model import LanguageModel
from dil_modeli.sampling import SamplingConfig
from dil_modeli.tokenizer import BPETokenizer

GREEDY = SamplingConfig(max_new_tokens=12, temperature=0.0)


@pytest.fixture(scope="module")
def model(tokenizer: BPETokenizer) -> LanguageModel:
    torch.manual_seed(0)
    config = ModelConfig(vocab_size=tokenizer.vocab_size, dim=48, n_layer=2, n_head=4, max_seq_len=24)
    return LanguageModel(config).eval()


def _brute_force(model: LanguageModel, prompt: list[int], steps: int, penalty: float = 1.0) -> list[int]:
    """Önbelleksiz başvuru: her adımda bütün pencereyi baştan çalıştırır, aynı kaydırma kuralıyla."""
    limit = model.config.max_seq_len
    history = list(prompt)
    window = history[-(limit - 1) :]
    out: list[int] = []
    for _ in range(steps):
        if len(window) > limit:
            window = history[-(limit // 2) :]
        with torch.no_grad():
            logits = model(torch.tensor([window]))[0, -1].clone()
        if penalty != 1.0:
            for token in set(history[-64:]):
                logits[token] = logits[token] / penalty if logits[token] > 0 else logits[token] * penalty
        token = int(logits.argmax())
        out.append(token)
        history.append(token)
        window = [*window, token]
    return out


def test_cached_greedy_matches_brute_force(model: LanguageModel) -> None:
    prompt = [0, 40, 41, 42]
    assert list(generate_ids(model, prompt, GREEDY)) == _brute_force(model, prompt, 12)


def test_generation_past_the_context_slides_the_window(model: LanguageModel) -> None:
    prompt = [0, 50, 51]
    config = SamplingConfig(max_new_tokens=70, temperature=0.0)
    produced = list(generate_ids(model, prompt, config))
    assert len(produced) == 70  # bağlam 24 olduğu hâlde üretim sürer
    assert produced == _brute_force(model, prompt, 70)


def test_repetition_penalty_matches_brute_force(model: LanguageModel) -> None:
    prompt = [0, 60, 61, 60, 61]
    config = SamplingConfig(max_new_tokens=15, temperature=0.0, repetition_penalty=1.5)
    assert list(generate_ids(model, prompt, config)) == _brute_force(model, prompt, 15, penalty=1.5)


def test_long_prompt_is_truncated_from_the_left(model: LanguageModel) -> None:
    prompt = [(i * 7) % 200 + 16 for i in range(60)]
    assert list(generate_ids(model, prompt, GREEDY)) == _brute_force(model, prompt, 12)
    with pytest.raises(ValueError, match="İstem boş olamaz"):
        list(generate_ids(model, [], GREEDY))


def test_stop_ids_end_generation_without_being_emitted(model: LanguageModel) -> None:
    prompt = [0, 40, 41, 42]
    full = list(generate_ids(model, prompt, GREEDY))
    stopped = list(generate_ids(model, prompt, GREEDY, stop_ids={full[4]}))
    assert stopped == full[: full.index(full[4])]


def test_sampling_is_reproducible_with_seed(model: LanguageModel) -> None:
    prompt = [0, 40]
    config = SamplingConfig(max_new_tokens=20, temperature=1.0, top_k=50, top_p=0.95, seed=3)
    first = list(generate_ids(model, prompt, config))
    assert first == list(generate_ids(model, prompt, config))
    other = SamplingConfig(max_new_tokens=20, temperature=1.0, top_k=50, top_p=0.95, seed=4)
    assert first != list(generate_ids(model, prompt, other))
    assert model.training is False


def test_batch_generation_matches_single_generation(model: LanguageModel) -> None:
    prompts = [[0, 40, 41, 42, 43, 44], [0, 70], [0, 90, 91, 92]]
    singles = [list(generate_ids(model, prompt, GREEDY)) for prompt in prompts]
    assert generate_batch(model, prompts, GREEDY, pad_id=2) == singles
    # Satır bazında durma: bir satır erken bitince diğerleri etkilenmez.
    stop = {singles[1][3]}
    expected = [list(generate_ids(model, prompt, GREEDY, stop_ids=stop)) for prompt in prompts]
    assert generate_batch(model, prompts, GREEDY, pad_id=2, stop_ids=stop) == expected
    assert len(expected[1]) <= 3
    # Aynı istemden birden çok farklı örnek.
    sampled = generate_batch(model, [[0, 40]] * 4, SamplingConfig(max_new_tokens=8, seed=1), pad_id=2)
    assert len({tuple(row) for row in sampled}) > 1
    with pytest.raises(ValueError, match="bağlamı"):
        generate_batch(model, [[1] * 24], GREEDY, pad_id=2)


def test_stop_checker_holds_back_partial_matches() -> None:
    checker = StopChecker(["\n\n", "SON"])
    assert checker.feed("merhaba S") == ("merhaba ", False)  # "S" bir durma yazısının başı olabilir
    assert checker.feed("O") == ("", False)
    assert checker.feed("ru") == ("SOru", False)  # olmadı: bekletilen metin geri verilir
    assert checker.feed(" bitti\n") == (" bitti", False)
    assert checker.feed("\nsonrası") == ("", True)  # durma yazısı ve sonrası gösterilmez
    assert checker.flush() == ""
    plain = StopChecker([])
    assert plain.feed("abc") == ("abc", False)


def test_text_stream_pieces_and_finish_reason(model: LanguageModel, tokenizer: BPETokenizer) -> None:
    prompt = [tokenizer.bos_id, *tokenizer.encode("Korkma")]
    config = SamplingConfig(max_new_tokens=30, temperature=0.0)
    tokens = list(generate_ids(model, prompt, config, stop_ids={tokenizer.eos_id}))
    stream = TextStream(model, tokenizer, prompt, config)
    text = "".join(stream)
    assert text == tokenizer.decode(tokens)
    assert stream.prompt_tokens == len(prompt)
    assert stream.completion_tokens == len(tokens)
    assert stream.finish_reason == ("length" if len(tokens) == 30 else "stop")
    assert generate_text(model, tokenizer, "Korkma", config) == text
    # Durdurma yazısı: çıktı o yazıdan önce biter ve neden "stop" olur.
    visible = [ch for ch in text if not ch.isspace() and ch != "�"]
    if visible:
        stop_text = visible[len(visible) // 2]
        stopped = TextStream(model, tokenizer, prompt, SamplingConfig(30, 0.0, stop=(stop_text,)))
        partial = "".join(stopped)
        assert partial == text[: text.index(stop_text)]
        assert stopped.finish_reason == "stop"
