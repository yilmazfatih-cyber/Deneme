"""Sohbet hattı uçtan uca (minik rastgele model, CPU): eğitim 3 adım, TRL'nin maskeyi değiştirmediği,
birleştirilmiş model = bağdaştırıcılı model, değerlendirme, tahmin ve Modelfile."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import torch

from ince_ayar.config import load_config
from ince_ayar.tasks.chat.config import ChatConfig
from tests.conftest import ROOT

PRESET = ROOT / "yapilandirma/sohbet/cpu-deneme.toml"


@pytest.fixture(scope="module")
def trained(tmp_path_factory: pytest.TempPathFactory) -> tuple[ChatConfig, dict[str, Any]]:
    from ince_ayar.tasks.chat.train import run_training

    out = tmp_path_factory.mktemp("sohbet")
    overrides = [
        f"egitim.cikti={str(out)!r}",
        "egitim.ogrenme_orani=0.05",
        f"veri.egitim={str(ROOT / 'ornekler/sohbet.jsonl')!r}",
    ]
    config = load_config(PRESET, ChatConfig, overrides)
    return config, run_training(config)


def test_egitim_ciktilari(trained: tuple[ChatConfig, dict[str, Any]]) -> None:
    config, summary = trained
    out = Path(config.egitim.cikti)
    assert summary["adim"] == 3 and summary["yontem"] == "lora"
    for name in (
        "bagdastirici/adapter_config.json",
        "rapor.html",
        "ozet.json",
        "ayar.toml",
        "egitim_gunlugu.jsonl",
    ):
        assert (out / name).is_file(), name
    assert summary["dogrulama_kaybi"] is not None


def test_trl_bizim_kayip_maskemizi_aynen_kullanir(
    trained: tuple[ChatConfig, dict[str, Any]],
) -> None:
    from transformers import AutoModelForCausalLM

    from ince_ayar.hardware import detect_hardware, resolve_precision
    from ince_ayar.runs import common_arguments
    from ince_ayar.tasks.chat.data import encode_examples, load_examples
    from ince_ayar.tasks.chat.modeling import load_tokenizer
    from ince_ayar.tasks.chat.train import _build_trainer

    config, _ = trained
    base = str(Path(config.egitim.cikti) / "taban")
    tokenizer = load_tokenizer(base)
    data = load_examples(config.veri)
    train_set = encode_examples(tokenizer, data.train, config.veri, "eğitim")
    hardware = detect_hardware()
    precision = resolve_precision("fp32", hardware, False)
    arguments = common_arguments(
        config.egitim, hardware, precision, Path(config.egitim.cikti) / "maske", False
    )
    trainer = _build_trainer(
        config,
        AutoModelForCausalLM.from_pretrained(base),
        tokenizer,
        train_set,
        None,
        arguments,
        [],
    )
    for index, item in enumerate(train_set.encoded):
        row = trainer.train_dataset[index]
        assert row["input_ids"] == item.input_ids
        assert row["labels"] == item.labels  # maskelenen konumlar -100, gerisi belirtecin kendisi
    batch = trainer.data_collator([trainer.train_dataset[0], trainer.train_dataset[1]])
    assert (batch["labels"][batch["attention_mask"] == 0] == -100).all()


def test_birlesik_model_bagdastiricili_modelle_ayni(
    trained: tuple[ChatConfig, dict[str, Any]], tmp_path: Path
) -> None:
    from peft import PeftModel
    from transformers import AutoModelForCausalLM

    from ince_ayar.tasks.chat.merge import merge_adapter

    config, _ = trained
    out = Path(config.egitim.cikti)
    merged_dir = merge_adapter(out, tmp_path / "birlesik", dtype="fp32", verify=True)
    ids = torch.tensor([[5, 17, 42, 99, 3, 7, 11]])
    merged = AutoModelForCausalLM.from_pretrained(merged_dir).eval()
    base = AutoModelForCausalLM.from_pretrained(out / "taban").eval()
    with torch.no_grad():
        base_logits = base(input_ids=ids).logits
        adapted = PeftModel.from_pretrained(base, str(out / "bagdastirici")).eval()
        adapter_logits = adapted(input_ids=ids).logits
        merged_logits = merged(input_ids=ids).logits
    assert (merged_logits - adapter_logits).abs().max().item() < 1e-5
    assert (
        adapter_logits - base_logits
    ).abs().max().item() > 1e-3  # bağdaştırıcı gerçekten bir şey değiştirdi
    stops = merged.generation_config.eos_token_id
    assert isinstance(stops, list) and len(stops) >= 1


def test_degerlendirme_tahmin_ve_modelfile(
    trained: tuple[ChatConfig, dict[str, Any]], tmp_path: Path
) -> None:
    from ince_ayar.tasks.chat.evaluate import evaluate_chat
    from ince_ayar.tasks.chat.export import export_for_ollama
    from ince_ayar.tasks.chat.merge import merge_adapter
    from ince_ayar.tasks.chat.predict import predict_chat

    config, summary = trained
    result = evaluate_chat(config, None, None, compare_base=True)
    assert set(result) >= {"ince_ayarli", "taban"}
    assert result["ince_ayarli"]["kayip"] == pytest.approx(summary["dogrulama_kaybi"], rel=1e-4)
    rows = predict_chat(config.egitim.cikti, "Kargom ne zaman gelir?", None, None, None, 4)
    assert len(rows) == 1 and isinstance(rows[0]["uretilen"], str)
    merged = merge_adapter(Path(config.egitim.cikti), tmp_path / "m")
    modelfile = export_for_ollama(
        merged, tmp_path / "gguf", None, "q8_0", None, "deneme", "Kısa yanıt ver.", 2048
    )
    assert "<|im_start|>assistant" in modelfile.read_text(encoding="utf-8")


def test_dosyadan_tahmin(trained: tuple[ChatConfig, dict[str, Any]], tmp_path: Path) -> None:
    import json

    from ince_ayar.tasks.chat.predict import predict_chat

    config, _ = trained
    rows = predict_chat(
        config.egitim.cikti,
        None,
        str(ROOT / "ornekler/sohbet.jsonl"),
        str(tmp_path / "y.jsonl"),
        None,
        4,
    )
    written = [
        json.loads(line) for line in (tmp_path / "y.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert len(rows) == len(written) == 12
    assert written[0]["beklenen"] == "Siparişler üç iş günü içinde teslim edilir."
