"""Donanım algılama, karma duyarlık (AMP) seçimi ve CPU iş parçacığı sınırı.

Kim kullanır: eğitim (`siniflandirma/train.py`), kuru çalıştırma planı, gömme modeli.
Kaynak: `havuz/ince-ayar/ince_ayar/hardware.py` (görüntü eğitimine göre sadeleştirildi).

- CPU ve Apple MPS: her zaman fp32 (fp16/bf16 istenmişse uyarıyla fp32'ye düşülür).
- CUDA: `oto` → gerçek bf16 desteği varsa bf16, yoksa (ör. Colab T4) fp16 + GradScaler.
  Ağırlıklar her zaman fp32 tutulur; yalnız ileri/geri hesap düşük duyarlıkta yapılır (autocast).
DİKKAT: Bu temelin geliştirildiği makinede GPU yoktu; CUDA dalları GPU'da DENENMEDİ (README Sınırlar).

Genişletme: yeni bir hızlandırıcı için `detect_device` ve `resolve_amp` içine dal ekleyin.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from goruntu.messages import t

MAX_AUTO_THREADS = 4
THREAD_ENV = "GORUNTU_IS_PARCACIGI"


@dataclass(frozen=True)
class Device:
    kind: str  # "cuda" | "mps" | "cpu"
    name: str
    memory_gb: float | None
    bf16: bool


@dataclass(frozen=True)
class Amp:
    """Karma duyarlık kararı. `dtype` None ise fp32; `note` doluysa kullanıcıya uyarı gösterilir."""

    dtype: str | None  # "float16" | "bfloat16" | None
    note: str | None = None

    @property
    def label(self) -> str:
        return {"float16": "fp16", "bfloat16": "bf16"}.get(self.dtype or "", "fp32")


def detect_device() -> Device:
    import torch

    if torch.cuda.is_available():
        properties = torch.cuda.get_device_properties(0)
        try:
            bf16 = bool(torch.cuda.is_bf16_supported(including_emulation=False))
        except TypeError:  # eski torch: parametre yok
            bf16 = bool(torch.cuda.is_bf16_supported())
        return Device("cuda", properties.name, properties.total_memory / 1024**3, bf16)
    if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        return Device("mps", "Apple MPS", None, False)
    return Device("cpu", "CPU", None, False)


def resolve_amp(requested: str, device: Device) -> Amp:
    """İstenen duyarlığı (oto/fp32/fp16/bf16) aygıta göre çözer."""
    if device.kind != "cuda":
        note = None
        if requested in ("fp16", "bf16"):
            note = t("donanim.duyarlik_yedek", istenen=requested, aygit=device.name)
        return Amp(None, note)
    if requested == "fp32":
        return Amp(None)
    if requested in ("oto", "bf16") and device.bf16:
        return Amp("bfloat16")
    note = t("donanim.bf16_yok", aygit=device.name) if requested == "bf16" else None
    return Amp("float16", note)


def limit_threads(requested: int = 0) -> int:
    """CPU iş parçacığı sayısını sınırlar (paylaşımlı makinede komşuları boğmamak için)."""
    import torch

    from_env = os.environ.get(THREAD_ENV, "")
    if requested <= 0 and from_env.isdigit():
        requested = int(from_env)
    count = requested if requested > 0 else min(os.cpu_count() or 1, MAX_AUTO_THREADS)
    torch.set_num_threads(count)
    return count
