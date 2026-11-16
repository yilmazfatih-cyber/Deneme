"""ONNX eşliği: `onnxruntime` ile çalışan çizge PyTorch ile aynı logitleri verir.

İsteğe bağlı paketler ister (`pip install -e ".[onnx]"`); yoksa atlanır. Uzun denetimdedir.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import torch

from dil_modeli.config import ModelConfig
from dil_modeli.export_onnx import export_onnx
from dil_modeli.model import LanguageModel
from dil_modeli.tokenizer import BPETokenizer

pytestmark = pytest.mark.uzun


def test_onnxruntime_logits_match(tokenizer: BPETokenizer, tmp_path: Path) -> None:
    onnxruntime = pytest.importorskip("onnxruntime")
    pytest.importorskip("onnxscript")
    torch.manual_seed(0)
    config = ModelConfig(
        vocab_size=tokenizer.vocab_size,
        dim=32,
        n_layer=2,
        n_head=4,
        n_kv_head=2,
        max_seq_len=64,
        tie_embeddings=False,
    )
    model = LanguageModel(config).eval()
    path = export_onnx(model, tokenizer, tmp_path)
    session = onnxruntime.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    for shape in ((1, 9), (3, 40), (2, 64)):
        ids = torch.randint(
            0, tokenizer.vocab_size, shape, generator=torch.Generator().manual_seed(1)
        )
        (logits,) = session.run(None, {"ids": ids.numpy()})
        with torch.no_grad():
            expected = model(ids).numpy()
        assert np.abs(logits - expected).max() < 1e-4, shape
    assert (tmp_path / "tokenizer.json").is_file()
