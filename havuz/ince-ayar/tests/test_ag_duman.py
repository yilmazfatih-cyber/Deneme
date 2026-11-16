"""Ağ isteyen duman testleri: Hugging Face'ten indirilen GERÇEK küçük modellerle CPU'da birkaç adım.

Varsayılan olarak atlanır; `INCE_AYAR_AG=1` ile açılır (ya da `python scripts/duman_testi.py`).
Modeller (lisansları katalogda doğrulandı):
- sohbet  : HuggingFaceTB/SmolLM2-135M-Instruct (Apache-2.0, ~269 MB)
- kodlayıcı: dbmdz/electra-small-turkish-cased-discriminator (MIT, ~55 MB)
`INCE_AYAR_DUMAN_RAPOR=dosya.json` verilirse süreler ve ölçümler o dosyaya yazılır
(`docs/DENEME_KAYDI.md` bu çıktıdan yazılır).
"""

from __future__ import annotations

import json
import os
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from ince_ayar.config import load_config
from tests.conftest import ROOT

pytestmark = pytest.mark.ag
CHAT_MODEL = "HuggingFaceTB/SmolLM2-135M-Instruct"
ENCODER = "dbmdz/electra-small-turkish-cased-discriminator"
RESULTS: dict[str, Any] = {}


@pytest.fixture(scope="module", autouse=True)
def _report() -> Iterator[None]:
    os.environ.setdefault("HF_HUB_DISABLE_XET", "1")  # bu ortamda Xet uç noktası takılıyordu
    yield
    target = os.environ.get("INCE_AYAR_DUMAN_RAPOR")
    if target:
        Path(target).write_text(json.dumps(RESULTS, ensure_ascii=False, indent=2), encoding="utf-8")


def _preset(task: str, overrides: list[str], schema: Any) -> Any:
    return load_config(ROOT / "yapilandirma" / task / "cpu-deneme.toml", schema, overrides)


def test_sohbet_gercek_kucuk_model(tmp_path: Path) -> None:
    from ince_ayar.tasks.chat.config import ChatConfig
    from ince_ayar.tasks.chat.export import export_for_ollama
    from ince_ayar.tasks.chat.masking import encode_chat
    from ince_ayar.tasks.chat.merge import merge_adapter
    from ince_ayar.tasks.chat.modeling import load_tokenizer
    from ince_ayar.tasks.chat.train import run_training

    overrides = [
        f"model.taban={CHAT_MODEL!r}",
        f"egitim.cikti={str(tmp_path / 'sohbet')!r}",
        "veri.azami_uzunluk=512",
        "egitim.ogrenme_orani=2e-4",
        f"veri.egitim={str(ROOT / 'ornekler/sohbet.jsonl')!r}",
    ]
    config = _preset("sohbet", overrides, ChatConfig)
    tokenizer = load_tokenizer(CHAT_MODEL)
    example = [
        {"role": "user", "content": "Kargom ne zaman gelir?"},
        {"role": "assistant", "content": "Üç iş günü içinde."},
    ]
    encoded = encode_chat(tokenizer, example)
    labeled = tokenizer.decode(
        [i for i, label in zip(encoded.input_ids, encoded.labels, strict=True) if label != -100]
    )
    assert labeled == "Üç iş günü içinde.<|im_end|>\n"
    started = time.perf_counter()
    summary = run_training(config)
    RESULTS["sohbet_egitim"] = {
        "model": CHAT_MODEL,
        "adim": summary["adim"],
        "sure_sn": round(time.perf_counter() - started, 1),
        "egitim_kaybi": summary["egitim_kaybi"],
        "dogrulama_kaybi": summary["dogrulama_kaybi"],
    }
    merged = merge_adapter(tmp_path / "sohbet", tmp_path / "birlesik", dtype="fp32", verify=True)
    record = json.loads((merged / "birlestirme.json").read_text(encoding="utf-8"))
    RESULTS["sohbet_birlestirme_fark"] = record["en_buyuk_logit_farki"]
    assert record["en_buyuk_logit_farki"] < 1e-3
    modelfile = export_for_ollama(merged, tmp_path / "gguf", None, "q8_0", None, "smol", None, 2048)
    assert "<|im_start|>assistant" in modelfile.read_text(encoding="utf-8")


def test_siniflandirma_gercek_kodlayici_ve_onnx(tmp_path: Path) -> None:
    from ince_ayar.tasks.classification.config import ClassificationConfig
    from ince_ayar.tasks.classification.export import export_classifier
    from ince_ayar.tasks.classification.train import run_training

    overrides = [
        f"model.taban={ENCODER!r}",
        f"egitim.cikti={str(tmp_path)!r}",
        "egitim.ogrenme_orani=5e-5",
        f"veri.egitim={str(ROOT / 'ornekler/siniflandirma.csv')!r}",
    ]
    started = time.perf_counter()
    summary = run_training(_preset("siniflandirma", overrides, ClassificationConfig))
    info = export_classifier(tmp_path, tmp_path / "onnx", int8=True, max_length=64)
    RESULTS["siniflandirma"] = {
        "model": ENCODER,
        "adim": summary["adim"],
        "sure_sn": round(time.perf_counter() - started, 1),
        "onnx_fp32_fark": info["fp32_en_buyuk_fark"],
        "onnx_int8_fark": info["int8_en_buyuk_fark"],
        "int8_karar_uyumu": info["int8_karar_uyumu"],
        "onnx_mb": round((tmp_path / "onnx/model.onnx").stat().st_size / 1e6, 1),
        "int8_mb": round((tmp_path / "onnx/model.int8.onnx").stat().st_size / 1e6, 1),
    }
    assert info["fp32_en_buyuk_fark"] < 1e-4


def test_gomme_gercek_kodlayici_ve_onnx(tmp_path: Path) -> None:
    from ince_ayar.tasks.embedding.config import EmbeddingConfig
    from ince_ayar.tasks.embedding.export import export_embedder
    from ince_ayar.tasks.embedding.train import run_training

    overrides = [
        f"model.taban={ENCODER!r}",
        f"egitim.cikti={str(tmp_path)!r}",
        "egitim.ogrenme_orani=5e-5",
        f"veri.egitim={str(ROOT / 'ornekler/gomme.jsonl')!r}",
    ]
    started = time.perf_counter()
    summary = run_training(_preset("gomme", overrides, EmbeddingConfig))
    info = export_embedder(
        tmp_path, tmp_path / "onnx", int8=False, query_prefix="", document_prefix=""
    )
    RESULTS["gomme"] = {
        "model": ENCODER,
        "adim": summary["adim"],
        "sure_sn": round(time.perf_counter() - started, 1),
        "onnx_fp32_fark": info["fp32_en_buyuk_fark"],
        "once": summary["once"],
        "sonra": summary["sonra"],
    }
    assert info["fp32_en_buyuk_fark"] < 1e-4


@pytest.mark.parametrize("task", ["sohbet", "siniflandirma", "gomme", "varlik"])
def test_gpu_hazir_ayarlarinin_kuru_calistirmasi(task: str, tmp_path: Path) -> None:
    """GPU hazır ayarlarının modelleri çözülür (yapılandırma + tokenizer indirilir, ağırlık inmez)."""
    from ince_ayar.cli import build_parser
    from ince_ayar.registry import TASKS

    for preset in ("colab-t4", "tek-gpu-24gb"):
        argv = [
            task,
            "egit",
            "--hazir",
            preset,
            "--kuru",
            "-D",
            f"egitim.cikti={str(tmp_path / preset)!r}",
        ]
        args = build_parser().parse_args(argv)
        assert TASKS[task].actions["egit"].run(args) == 0
