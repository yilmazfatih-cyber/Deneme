"""Yapılandırma (TOML + -D), donanım/duyarlık kararı, bellek tahmini ve plan hesapları."""

from __future__ import annotations

import tomllib
from pathlib import Path

import pytest

from ince_ayar.config import (
    apply_overrides,
    dump_config,
    load_config,
    parse_override,
    resolve_config_path,
)
from ince_ayar.errors import UserError
from ince_ayar.hardware import Hardware, four_bit_config, limit_threads, resolve_precision
from ince_ayar.memory import ModelShape, estimate_full, estimate_lora, meta_counts, read_shape
from ince_ayar.plan import Target, memory_verdict, training_steps
from ince_ayar.tasks.chat.config import ChatConfig
from tests.conftest import ROOT

CPU = Hardware("cpu", "CPU", None, False)
T4 = Hardware("cuda", "Tesla T4", 15.0, False)
A5000 = Hardware("cuda", "RTX A5000", 24.0, True)


def test_degistir_degerleri_toml_turlerine_cevrilir() -> None:
    assert parse_override("egitim.yigin=8") == (["egitim", "yigin"], 8)
    assert parse_override("egitim.ogrenme_orani=2e-4")[1] == 2e-4
    assert parse_override("lora.etkin=false")[1] is False
    assert parse_override("model.taban=Qwen/Qwen3-0.6B")[1] == "Qwen/Qwen3-0.6B"
    assert parse_override('lora.hedef_moduller=["q_proj","v_proj"]')[1] == ["q_proj", "v_proj"]
    assert apply_overrides({"a": {"b": 1}}, ["a.c=2", "d=3"]) == {"a": {"b": 1, "c": 2}, "d": 3}
    with pytest.raises(UserError, match="bolum.anahtar=deger"):
        parse_override("egitim.yigin")


def test_taninmayan_anahtar_turkce_hata() -> None:
    path = ROOT / "yapilandirma/sohbet/cpu-deneme.toml"
    with pytest.raises(UserError, match=r"`egitim.yiginn` tanınmayan alan"):
        load_config(path, ChatConfig, ["egitim.yiginn=4"])
    with pytest.raises(UserError, match=r"`egitim.yigin` en az 1 olmalı"):
        load_config(path, ChatConfig, ["egitim.yigin=0"])


def test_yapilandirma_dokumu_geri_okunur() -> None:
    config = load_config(ROOT / "yapilandirma/sohbet/colab-t4.toml", ChatConfig)
    again = ChatConfig.model_validate(tomllib.loads(dump_config(config)))
    assert again == config


def test_ayar_secimi_hatalari() -> None:
    with pytest.raises(UserError, match="birlikte verilemez"):
        resolve_config_path("sohbet", "x.toml", "cpu-deneme")
    with pytest.raises(UserError, match="--hazir cpu-deneme"):
        resolve_config_path("sohbet", None, None)
    with pytest.raises(UserError, match="Seçenekler: cpu-deneme"):
        resolve_config_path("sohbet", None, "yok")


def test_duyarlik_karari() -> None:
    cpu = resolve_precision("fp16", CPU, trainable_base=False)
    assert (cpu.label, cpu.weight_dtype) == ("fp32", "float32") and cpu.note
    t4_lora = resolve_precision("oto", T4, trainable_base=False)
    assert (t4_lora.label, t4_lora.weight_dtype) == ("fp16", "float16")
    t4_full = resolve_precision("oto", T4, trainable_base=True)
    assert (t4_full.label, t4_full.weight_dtype) == ("fp16", "float32")
    assert resolve_precision("bf16", T4, False).note  # T4'te bf16 yok
    assert resolve_precision("oto", A5000, False).label == "bf16"


def test_dort_bit_cpuda_acik_hata() -> None:
    with pytest.raises(UserError, match="CUDA'lı bir GPU ister"):
        four_bit_config(CPU, resolve_precision("oto", CPU, False))


def test_is_parcacigi_ortam_degiskeni(monkeypatch: pytest.MonkeyPatch) -> None:
    import torch

    monkeypatch.setenv("INCE_AYAR_IS_PARCACIGI", "1")
    assert limit_threads(0) == 1 and torch.get_num_threads() == 1
    assert limit_threads(2) == 2


def test_adim_sayisi() -> None:
    assert training_steps(10, 3, 2, 2.0, -1) == 4
    assert training_steps(10, 3, 2, 2.0, 7) == 7
    assert training_steps(1, 8, 4, 1.0, -1) == 1


def test_bellek_tahmini_kalemleri() -> None:
    shape = ModelShape(1_700_000_000, 2048, 28, 6144, 151_936, "deneme", trainable=17_000_000)
    fp16 = estimate_lora(shape, 16, "all-linear", 4, 1024, True, 2, False, True)
    four = estimate_lora(shape, 16, "all-linear", 4, 1024, True, 2, True, True)
    no_ckpt = estimate_lora(shape, 16, "all-linear", 4, 1024, True, 2, False, False)
    assert four.weights_gb < fp16.weights_gb
    assert no_ckpt.activations_gb > fp16.activations_gb
    assert fp16.trainable_parameters == 17_000_000
    full = estimate_full(shape, 4, 128, True)
    assert full.trainable_gb == pytest.approx(1_700_000_000 * 16 / 1024**3)
    target = Target(True, True, 15.0, "T4")
    assert "sığar" in memory_verdict(fp16, target)
    assert "SIĞMAZ" in memory_verdict(full, Target(True, True, 4.0, "küçük"))


def test_meta_sayim_gercek_modelle_ayni(tmp_path: Path) -> None:
    from peft import LoraConfig, get_peft_model
    from transformers import AutoModelForCausalLM

    from ince_ayar.tiny import create_tiny_chat_model

    create_tiny_chat_model(["merhaba dünya", "kargo iade"], tmp_path)
    lora = LoraConfig(r=4, lora_alpha=8, target_modules="all-linear", task_type="CAUSAL_LM")
    from transformers import AutoConfig

    total, trainable = meta_counts(AutoConfig.from_pretrained(tmp_path), "causal", lora)
    real = AutoModelForCausalLM.from_pretrained(tmp_path)
    assert total == sum(p.numel() for p in real.parameters())
    adapted = get_peft_model(
        real, LoraConfig(r=4, lora_alpha=8, target_modules="all-linear", task_type="CAUSAL_LM")
    )
    assert trainable == sum(p.numel() for p in adapted.parameters() if p.requires_grad)
    shape = read_shape(str(tmp_path))
    assert shape.parameters == total and "kesin" in shape.source
