"""İnce ayar uçtan uca: küçük modeli kaydet, sohbet verisiyle LoRA ve tam ince ayar yap."""

from __future__ import annotations

from pathlib import Path

import pytest
import torch

from dil_modeli.config import ModelConfig
from dil_modeli.finetune import ADAPTER_DIR, MERGED_DIR, FinetuneConfig, _split, collate, finetune
from dil_modeli.lora import load_adapter
from dil_modeli.model import IGNORE_INDEX, LanguageModel
from dil_modeli.model_io import load_model, save_model
from dil_modeli.tokenizer import BPETokenizer

from .helpers import FIXTURES


@pytest.fixture(scope="module")
def base_dir(tokenizer: BPETokenizer, tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Küçük temel model. Gömmeler büyütülür: rastgele başlangıçta (std 0,02) donuk çıkış katmanı
    logitleri keskinleştiremez; eğitilmiş bir modelde ağırlık normları zaten büyüktür."""
    torch.manual_seed(0)
    config = ModelConfig(
        vocab_size=tokenizer.vocab_size, dim=32, n_layer=2, n_head=2, max_seq_len=64
    )
    model = LanguageModel(config)
    with torch.no_grad():
        model.embed.weight.mul_(25.0)
    return save_model(tmp_path_factory.mktemp("temel") / "model", model, tokenizer)


def _silent(_: str) -> None:
    return None


def test_lora_finetune_learns_and_writes_adapter_and_merged_model(
    base_dir: Path, tmp_path: Path
) -> None:
    config = FinetuneConfig(
        model_dir=str(base_dir),
        data=str(FIXTURES / "sohbet.jsonl"),
        out_dir=str(tmp_path),
        max_steps=60,
        batch_size=4,
        learning_rate=1e-2,
        val_fraction=0.2,
        eval_every=30,
    )
    result = finetune(config, log=_silent)
    assert result.last_loss < result.first_loss * 0.5
    assert result.val_loss is not None
    assert result.examples == 6
    merged, tokenizer = load_model(tmp_path / MERGED_DIR)
    base, _ = load_model(base_dir)
    load_adapter(base, tmp_path / ADAPTER_DIR)  # temel model + bağdaştırıcı = birleşik model
    ids = torch.tensor([tokenizer.encode("Merhaba")])
    assert torch.allclose(base.eval()(ids), merged(ids), atol=1e-5)
    assert (tmp_path / "gunluk.jsonl").is_file()


def test_full_finetune_has_no_adapter(base_dir: Path, tmp_path: Path) -> None:
    config = FinetuneConfig(
        model_dir=str(base_dir),
        data=str(FIXTURES / "sohbet.jsonl"),
        out_dir=str(tmp_path),
        lora=False,
        max_steps=5,
        batch_size=2,
        learning_rate=1e-3,
    )
    result = finetune(config, log=_silent)
    assert result.trainable_parameters == load_model(base_dir)[0].num_parameters()
    assert not (tmp_path / ADAPTER_DIR).exists()
    assert (tmp_path / MERGED_DIR / "model.safetensors").is_file()


def test_split_keeps_one_validation_example() -> None:
    pairs = [([i], [i]) for i in range(3)]
    train, val = _split(pairs, 0.1, seed=0)
    assert len(val) >= 1
    assert sorted(train + val) == pairs
    assert _split(pairs[:1], 0.5, seed=0) == (pairs[:1], [])
    assert _split(pairs, 0.0, seed=0) == (pairs, [])


def test_collate_pads_right_and_ignores_padding() -> None:
    inputs, targets = collate([([5, 6, 7], [6, 7, IGNORE_INDEX]), ([9], [4])], pad_id=2)
    assert inputs.tolist() == [[5, 6, 7], [9, 2, 2]]
    assert targets.tolist() == [[6, 7, IGNORE_INDEX], [4, IGNORE_INDEX, IGNORE_INDEX]]
