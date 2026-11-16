"""Aygıt ve duyarlık seçimi: CPU'da karışık duyarlık kapalı, yanlış istek açık hata verir."""

from __future__ import annotations

import pytest
import torch

from dil_modeli.device import autocast, pick_device, resolve_precision


def test_cpu_precision_rules() -> None:
    cpu = torch.device("cpu")
    auto = resolve_precision("auto", cpu)
    assert (auto.name, auto.enabled, auto.use_scaler) == ("fp32", False, False)
    assert resolve_precision("fp32", cpu).dtype is None
    for name in ("bf16", "fp16"):
        with pytest.raises(ValueError, match="yalnız CUDA"):
            resolve_precision(name, cpu)
    with pytest.raises(ValueError, match="Bilinmeyen duyarlık"):
        resolve_precision("fp8", cpu)
    with autocast(cpu, auto):  # kapalı autocast hesaplamayı değiştirmez
        assert (torch.ones(2) @ torch.ones(2)).dtype == torch.float32


def test_pick_device() -> None:
    assert pick_device("cpu").type == "cpu"
    assert pick_device("auto").type in ("cpu", "cuda", "mps")
    if not torch.cuda.is_available():
        with pytest.raises(ValueError, match="GPU yok"):
            pick_device("cuda")
