"""Bütün testlerin ortak ayarları ve paylaşılan küçük nesneler."""

from __future__ import annotations

import pytest
import torch

from dil_modeli.tokenizer import BPETokenizer
from dil_modeli.tokenizer_train import train_bpe

from .helpers import fixture_text, make_corpus

# Makine paylaşımlı: testler en fazla iki iş parçacığı kullanır. Sabit sayı aynı zamanda
# kayan nokta sonuçlarını koşudan koşuya aynı tutar.
torch.set_num_threads(2)


@pytest.fixture(scope="session")
def corpus() -> list[str]:
    return [fixture_text(), *make_corpus()]


@pytest.fixture(scope="session")
def tokenizer(corpus: list[str]) -> BPETokenizer:
    """Örnek derlemle eğitilmiş küçük BPE (sözlük 512)."""
    return train_bpe(corpus, vocab_size=512)
