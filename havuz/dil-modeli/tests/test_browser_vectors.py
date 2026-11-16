"""Depodaki tarayıcı sınama vektörleri Python davranışıyla tutarlı mı?

JS testleri (node --test tarayici/) bu vektörlerle karşılaştırır. Python'da tokenizer, model ya
da üretim kuralı değişirse bu test kırılır: `python scripts/tarayici_sinama.py` ile vektörleri
yeniden üretin, sonra JS tarafını da güncelleyip `node --test tarayici/` çalıştırın.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
import torch

from dil_modeli.export_web import load_web
from dil_modeli.generate import generate_ids
from dil_modeli.model import LanguageModel
from dil_modeli.sampling import SamplingConfig
from dil_modeli.tokenizer_api import Tokenizer

ROOT = Path(__file__).resolve().parent.parent
SINAMA = ROOT / "tarayici" / "sinama"
EXAMPLE = ROOT / "ornek-model" / "tarayici"
HINT = "Vektörler eskimiş: python scripts/tarayici_sinama.py çalıştırın."


def _check(
    model: LanguageModel,
    tokenizer: Tokenizer,
    vectors: dict[str, Any],
    encode: list[dict[str, Any]],
) -> None:
    for item in encode:
        assert tokenizer.encode(item["text"]) == item["ids"], HINT
        assert tokenizer.encode(item["text"], allow_special=True) == item["special"], HINT
    ids = vectors["logits"]["ids"]
    positions = vectors["logits"]["positions"]
    with torch.no_grad():
        logits = model(torch.tensor([ids]))[0, len(ids) - len(positions) :]
    assert torch.allclose(logits, torch.tensor(positions), atol=1e-4), HINT
    for item in vectors["greedy"]:
        config = SamplingConfig(item["steps"], temperature=0.0, repetition_penalty=item["penalty"])
        assert list(generate_ids(model, item["prompt"], config)) == item["output"], HINT


def test_fixture_vectors_match_python() -> None:
    vectors = json.loads((SINAMA / "vektorler.json").read_text(encoding="utf-8"))
    model, tokenizer = load_web(SINAMA)
    _check(model, tokenizer, vectors, vectors["tokenizer"]["encode"])
    for item in vectors["tokenizer"]["decode"]:
        assert tokenizer.decode(item["ids"], skip_special=False) == item["text"], HINT


@pytest.mark.skipif(not (EXAMPLE / "manifest.json").is_file(), reason="örnek model yok")
def test_example_model_vectors_match_python() -> None:
    vectors = json.loads((SINAMA / "ornek-model.json").read_text(encoding="utf-8"))
    model, tokenizer = load_web(EXAMPLE)
    _check(model, tokenizer, vectors, vectors["tokenizer"])
