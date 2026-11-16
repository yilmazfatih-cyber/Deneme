"""Aygıt ve duyarlık seçimi: cuda / mps / cpu ve karışık duyarlık (yalnız CUDA'da).

`train.py`, `finetune.py`, `evaluate.py` ve komut satırı kullanır.

Not: Karışık duyarlık (bf16 / fp16) bu depoda yalnız CPU'lu makinede geliştirildi; CUDA yolu
PyTorch belgelerindeki kalıbı izler ama GPU üzerinde denenmedi (bkz. README "Sınırlar").

Genişletme: Yeni bir aygıt türü için `pick_device` içine bir dal ekleyin.
"""

from __future__ import annotations

from dataclasses import dataclass

import torch

PRECISIONS = ("auto", "fp32", "bf16", "fp16")


def pick_device(name: str = "auto") -> torch.device:
    """`auto`: varsa CUDA, yoksa Apple MPS, yoksa CPU. Açık ad verilirse o kullanılır."""
    if name != "auto":
        device = torch.device(name)
        if device.type == "cuda" and not torch.cuda.is_available():
            raise ValueError("CUDA istendi ama bu makinede kullanılabilir GPU yok. device='auto' deneyin.")
        if device.type == "mps" and not torch.backends.mps.is_available():
            raise ValueError("MPS istendi ama bu makinede kullanılamıyor. device='auto' deneyin.")
        return device
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


@dataclass(frozen=True)
class Precision:
    """Çözülmüş duyarlık ayarı."""

    name: str  # fp32 | bf16 | fp16
    dtype: torch.dtype | None  # autocast türü; None: karışık duyarlık kapalı
    use_scaler: bool  # fp16'da gradyan ölçekleyici gerekir

    @property
    def enabled(self) -> bool:
        return self.dtype is not None


def resolve_precision(name: str, device: torch.device) -> Precision:
    """Duyarlık adını aygıta göre çözer. Karışık duyarlık yalnız CUDA'da açılır."""
    if name not in PRECISIONS:
        raise ValueError(f"Bilinmeyen duyarlık: {name!r}. Seçenekler: {', '.join(PRECISIONS)}.")
    if name == "auto":
        if device.type != "cuda":
            return Precision("fp32", None, False)
        name = "bf16" if torch.cuda.is_bf16_supported() else "fp16"
    if name == "fp32":
        return Precision("fp32", None, False)
    if device.type != "cuda":
        raise ValueError(
            f"'{name}' karışık duyarlığı yalnız CUDA'da kullanılır; bu aygıt: {device.type}. "
            "precision='auto' ya da 'fp32' seçin."
        )
    if name == "bf16":
        return Precision("bf16", torch.bfloat16, False)
    return Precision("fp16", torch.float16, True)


def autocast(device: torch.device, precision: Precision) -> torch.autocast:
    """İleri geçişi saran bağlam yöneticisi; kapalıysa hiçbir şey yapmaz."""
    return torch.autocast(
        device_type=device.type, dtype=precision.dtype, enabled=precision.enabled
    )
