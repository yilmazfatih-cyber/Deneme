"""Ortak test araçları: iş parçacığı sınırı, ağ anahtarı, minik modeller ve örnek veri yolları.

Testler çevrimdışıdır: model indirilmez; tokenizer o anda eğitilir, ağırlıklar tohumlu rastgeledir.
Ağ isteyen testler `@pytest.mark.ag` ile işaretlenir ve yalnız `INCE_AYAR_AG=1` iken koşar.

Genişletme: birden çok test dosyasının kullandığı yardımcıyı buraya ekleyin.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / "ornekler"
NETWORK_ENV = "INCE_AYAR_AG"


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "ag: ağ ister; yalnız INCE_AYAR_AG=1 iken koşar")


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if os.environ.get(NETWORK_ENV) == "1":
        return
    skip = pytest.mark.skip(reason=f"ağ testi: {NETWORK_ENV}=1 ile açılır")
    for item in items:
        if "ag" in item.keywords:
            item.add_marker(skip)


@pytest.fixture(autouse=True)
def _limit_threads() -> Iterator[None]:
    """Paylaşımlı makinede komşuları boğmamak için torch iş parçacığını kısar."""
    import torch

    torch.set_num_threads(2)
    yield


@pytest.fixture(autouse=True)
def _offline(monkeypatch: pytest.MonkeyPatch, request: pytest.FixtureRequest) -> None:
    """Ağ testleri dışında Hugging Face erişimini kapatır: yanlışlıkla indirme olursa test düşer."""
    if "ag" not in request.keywords:
        monkeypatch.setenv("HF_HUB_OFFLINE", "1")
        monkeypatch.setenv("TRANSFORMERS_OFFLINE", "1")


def make_chat_tokenizer(
    specials: list[str],
    template: str,
    eos: str,
    bos: str | None = None,
    pad: str | None = None,
    texts: list[str] | None = None,
) -> Any:
    """İstenen özel belirteçlere ve sohbet şablonuna sahip minik bayt düzeyi BPE tokenizer kurar."""
    from tokenizers import Tokenizer, decoders, models, pre_tokenizers, trainers
    from transformers import PreTrainedTokenizerFast

    corpus = texts or [
        "Merhaba, nasılsınız? İyiyim, teşekkür ederim.",
        "Kargom ne zaman gelir? Üç iş günü içinde teslim edilir.",
        "Şifremi unuttum. Çözüm için e-postanızı denetleyin.",
    ]
    tokenizer = Tokenizer(models.BPE())
    tokenizer.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)
    tokenizer.decoder = decoders.ByteLevel()
    trainer = trainers.BpeTrainer(
        vocab_size=320,
        special_tokens=specials,
        initial_alphabet=pre_tokenizers.ByteLevel.alphabet(),
        show_progress=False,
    )
    tokenizer.train_from_iterator(corpus, trainer)
    fast = PreTrainedTokenizerFast(
        tokenizer_object=tokenizer,
        eos_token=eos,
        bos_token=bos,
        pad_token=pad or eos,
        additional_special_tokens=[s for s in specials if s not in {eos, bos, pad}],
    )
    fast.chat_template = template
    return fast


@pytest.fixture(scope="session")
def chatml_tokenizer() -> Any:
    from ince_ayar.tiny import CHAT_SPECIALS, CHATML_TEMPLATE

    return make_chat_tokenizer(CHAT_SPECIALS, CHATML_TEMPLATE, eos="<|im_end|>", pad="<|endoftext|>")
