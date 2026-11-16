"""Tarayıcı dışa aktarımı: biçim, hizalama, nicemleme hatası sınırı, geri yükleme, bütünlük."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
import torch

from dil_modeli.config import ModelConfig
from dil_modeli.export_web import export_web, load_web, quantize_rows
from dil_modeli.model import LanguageModel
from dil_modeli.tokenizer import BPETokenizer
from dil_modeli.tokenizer_char import CharTokenizer


@pytest.fixture(scope="module")
def model(tokenizer: BPETokenizer) -> LanguageModel:
    torch.manual_seed(0)
    config = ModelConfig(
        vocab_size=tokenizer.vocab_size,
        dim=32,
        n_layer=2,
        n_head=4,
        n_kv_head=2,
        max_seq_len=32,
        tie_embeddings=False,
    )
    return LanguageModel(config).eval()


@pytest.mark.parametrize(("dtype", "atol"), [("float32", 0.0), ("float16", 2e-3), ("int8", 5e-2)])
def test_round_trip(
    model: LanguageModel, tokenizer: BPETokenizer, tmp_path: Path, dtype: str, atol: float
) -> None:
    manifest = export_web(model, tokenizer, tmp_path, dtype)
    loaded, loaded_tokenizer = load_web(tmp_path)
    ids = torch.tensor([tokenizer.encode("Korkma, sönmez bu şafaklarda")])
    with torch.no_grad():
        difference = (loaded(ids) - model(ids)).abs().max().item()
    assert difference <= atol
    assert loaded_tokenizer.encode("Çatma") == tokenizer.encode("Çatma")
    for entry in manifest["tensors"].values():
        assert all(part[0] % 4 == 0 for key, part in entry.items() if key in ("data", "scales"))
        if len(entry["shape"]) == 1:
            assert entry["dtype"] == "float32"  # normlar nicemlenmez
    assert manifest["bytes"] == (tmp_path / "model.bin").stat().st_size
    assert (
        json.loads((tmp_path / "manifest.json").read_text(encoding="utf-8"))["special"]["assistant"]
        == 5
    )


def test_sizes_shrink(model: LanguageModel, tokenizer: BPETokenizer, tmp_path: Path) -> None:
    sizes = {
        d: export_web(model, tokenizer, tmp_path / d, d)["bytes"]
        for d in ("float32", "float16", "int8")
    }
    assert sizes["float16"] < 0.55 * sizes["float32"]
    assert sizes["int8"] < 0.3 * sizes["float32"]


def test_quantization_error_is_bounded_by_half_a_step() -> None:
    weight = np.random.default_rng(0).normal(size=(16, 40)).astype(np.float32)
    weight[3] = 0.0  # tamamen sıfır satır bölme hatası vermemeli
    values, scales = quantize_rows(weight)
    restored = values.astype(np.float32) * scales[:, None]
    assert np.all(np.abs(restored - weight) <= scales[:, None] / 2 + 1e-7)
    assert np.abs(values).max() == 127
    assert np.all(restored[3] == 0.0)


def test_corruption_and_wrong_inputs_are_reported(
    model: LanguageModel, tokenizer: BPETokenizer, tmp_path: Path
) -> None:
    export_web(model, tokenizer, tmp_path, "float16")
    data = bytearray((tmp_path / "model.bin").read_bytes())
    data[10] ^= 0xFF
    (tmp_path / "model.bin").write_bytes(bytes(data))
    with pytest.raises(ValueError, match="SHA-256"):
        load_web(tmp_path)
    with pytest.raises(ValueError, match="Bilinmeyen tür"):
        export_web(model, tokenizer, tmp_path, "int4")
    with pytest.raises(ValueError, match="BPE"):
        export_web(model, CharTokenizer.train(["abc"]), tmp_path, "int8")
