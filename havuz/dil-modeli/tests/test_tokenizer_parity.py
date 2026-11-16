"""Saf Python tokenizer ile Hugging Face `tokenizers` kütüphanesinin eşliği.

Aynı `tokenizer.json` dosyası iki tarafta da aynı kimlikleri ve aynı çözülmüş metni vermeli;
iki eğitim yolu (saf Python ve `tokenizers`) aynı sözlüğü üretmeli.
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any

import pytest

from dil_modeli.bytelevel import pretokenize, to_bytelevel
from dil_modeli.tokenizer import BPETokenizer
from dil_modeli.tokenizer_train import train_bpe

from .helpers import fixture_text, make_corpus, random_text

tokenizers = pytest.importorskip("tokenizers")


@pytest.fixture(scope="module")
def reference(tokenizer: BPETokenizer, tmp_path_factory: pytest.TempPathFactory) -> Any:
    path = tmp_path_factory.mktemp("tok") / "tokenizer.json"
    tokenizer.save(path)
    return tokenizers.Tokenizer.from_file(str(path))


def _texts(count: int, seed: int) -> list[str]:
    rng = random.Random(seed)
    fixed = [fixture_text(), "a  b", "\t\tx", "a\r\n\r\nb", "Ankara'da", "aaaaaaa", "<|bas|>x<|son|>"]
    return fixed + [random_text(rng, max_len=60) for _ in range(count)]


def test_pretokenization_matches_tokenizers() -> None:
    byte_level = tokenizers.pre_tokenizers.ByteLevel(add_prefix_space=False, use_regex=True)
    for text in _texts(3000, seed=10):
        expected = [piece for piece, _ in byte_level.pre_tokenize_str(text)]
        assert [to_bytelevel(piece) for piece in pretokenize(text)] == expected, repr(text)


def test_encoding_matches_tokenizers(tokenizer: BPETokenizer, reference: Any) -> None:
    for text in _texts(3000, seed=11):
        assert tokenizer.encode(text, allow_special=True) == reference.encode(text).ids, repr(text)


def test_long_unbroken_word_matches_tokenizers(tokenizer: BPETokenizer, reference: Any) -> None:
    rng = random.Random(12)
    for _ in range(5):
        text = "".join(rng.choice("abcçdeğıilmnrsştuü") for _ in range(20_000))
        assert tokenizer.encode(text) == reference.encode(text).ids


def test_decoding_matches_tokenizers(tokenizer: BPETokenizer, reference: Any) -> None:
    rng = random.Random(13)
    for _ in range(2000):
        ids = [rng.randrange(tokenizer.vocab_size) for _ in range(rng.randint(0, 20))]
        assert tokenizer.decode(ids) == reference.decode(ids)
        assert tokenizer.decode(ids, skip_special=False) == reference.decode(
            ids, skip_special_tokens=False
        )


def test_bos_template_is_understood_by_tokenizers(tokenizer: BPETokenizer, tmp_path: Path) -> None:
    path = tmp_path / "tokenizer.json"
    tokenizer.save(path, add_bos=True)
    hf = tokenizers.Tokenizer.from_file(str(path))
    ids = tokenizer.encode("Korkma, sönmez")
    assert hf.encode("Korkma, sönmez").ids == [tokenizer.bos_id, *ids]
    assert hf.encode("Korkma, sönmez", add_special_tokens=False).ids == ids


@pytest.mark.parametrize(("vocab_size", "min_frequency"), [(300, 2), (600, 2), (2000, 1), (900, 5)])
def test_pure_python_trainer_matches_tokenizers_trainer(vocab_size: int, min_frequency: int) -> None:
    corpus = [fixture_text(), *make_corpus(lines=300, seed=vocab_size)]
    ours = train_bpe(corpus, vocab_size, min_frequency=min_frequency)
    theirs = train_bpe(corpus, vocab_size, min_frequency=min_frequency, fast=True)
    assert ours.merges == theirs.merges
    assert ours.vocab == theirs.vocab


def test_file_written_by_tokenizers_round_trips_through_ours(tokenizer: BPETokenizer) -> None:
    """Bizim dosyamızı `tokenizers` yeniden yazınca içerik değişmemeli (aynı alt küme)."""
    reference = tokenizers.Tokenizer.from_str(json.dumps(tokenizer.to_json()))
    assert json.loads(reference.to_str()) == tokenizer.to_json()
