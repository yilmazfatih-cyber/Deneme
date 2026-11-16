"""Donanım algılama ve duyarlık (fp32 / fp16 / bf16) seçimi; 4-bit ve iş parçacığı denetimi.

Kim kullanır: her görevin eğitim ve değerlendirme kodu. GPU'ya özgü her karar burada verilir ki
görev kodu "GPU var mı" diye dallanmasın:
- CPU ve Apple MPS: her zaman fp32. fp16/bf16 istenmişse uyarıyla fp32'ye düşülür (güvenli yedek).
- CUDA: `oto` → gerçek bf16 desteği varsa bf16, yoksa (ör. T4) fp16.
- 4-bit yükleme yalnız CUDA + `bitsandbytes` ile olur; yoksa **açık hata** verilir (sessizce tam
  duyarlığa düşmek belleği taşırabilir).

DİKKAT: Bu makinede GPU yoktur; CUDA dalları yalnız sahte donanım nesnesiyle sınanmıştır
(`tests/test_hardware.py`), gerçek GPU'da denenmemiştir.

Genişletme: yeni bir hızlandırıcı için `detect_hardware` ve `resolve_precision` içine dal ekleyin.
"""

from __future__ import annotations

import importlib.util
import os
from dataclasses import dataclass
from typing import Any

from ince_ayar.errors import UserError
from ince_ayar.messages import t

MAX_AUTO_THREADS = 4
THREAD_ENV = "INCE_AYAR_IS_PARCACIGI"


@dataclass(frozen=True)
class Hardware:
    device: str  # "cuda" | "mps" | "cpu"
    name: str
    memory_gb: float | None
    bf16: bool


@dataclass(frozen=True)
class Precision:
    """Eğitimde kullanılacak duyarlık. `note` doluysa kullanıcıya uyarı olarak gösterilir."""

    bf16: bool
    fp16: bool
    weight_dtype: str  # "float32" | "float16" | "bfloat16": dondurulmuş taban ağırlıkları için
    note: str | None = None

    @property
    def label(self) -> str:
        return "bf16" if self.bf16 else "fp16" if self.fp16 else "fp32"


def detect_hardware() -> Hardware:
    """Kullanılabilir en iyi aygıtı bulur."""
    import torch

    if torch.cuda.is_available():
        properties = torch.cuda.get_device_properties(0)
        try:
            bf16 = bool(torch.cuda.is_bf16_supported(including_emulation=False))
        except TypeError:  # eski torch: parametre yok
            bf16 = bool(torch.cuda.is_bf16_supported())
        return Hardware("cuda", properties.name, properties.total_memory / 1024**3, bf16)
    if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        return Hardware("mps", "Apple MPS", None, False)
    return Hardware("cpu", "CPU", None, False)


def resolve_precision(requested: str, hardware: Hardware, trainable_base: bool) -> Precision:
    """İstenen duyarlığı donanıma göre çözer.

    `trainable_base`: taban ağırlıkları da eğitiliyorsa (tam ince ayar) True. fp16'da eğitilen
    ağırlıklar fp32 tutulmalıdır (GradScaler fp16 ağırlığı güncelleyemez); LoRA'da taban donuk
    olduğundan fp16 yüklenebilir ve bellek yarıya iner.
    """
    if hardware.device != "cuda":
        note = None
        if requested in ("fp16", "bf16"):
            note = t("donanim.duyarlik_yedek", istenen=requested, aygit=hardware.name)
        return Precision(False, False, "float32", note)
    if requested == "fp32":
        return Precision(False, False, "float32")
    if requested in ("oto", "bf16") and hardware.bf16:
        return Precision(True, False, "float32" if trainable_base else "bfloat16")
    note = t("donanim.bf16_yok", aygit=hardware.name) if requested == "bf16" else None
    return Precision(False, True, "float32" if trainable_base else "float16", note)


def four_bit_config(hardware: Hardware, precision: Precision) -> Any:
    """4-bit (QLoRA) yükleme ayarını kurar; ortam desteklemiyorsa ne yapılacağını söyler."""
    if hardware.device != "cuda":
        raise UserError(t("donanim.dort_bit_gpu", aygit=hardware.name))
    if importlib.util.find_spec("bitsandbytes") is None:
        raise UserError(t("donanim.dort_bit_paket"))
    import torch
    from transformers import BitsAndBytesConfig

    return BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.bfloat16 if precision.bf16 else torch.float16,
    )


def limit_threads(requested: int = 0) -> int:
    """CPU iş parçacığı sayısını sınırlar (paylaşımlı makinede komşuları boğmamak için)."""
    import torch

    from_env = os.environ.get(THREAD_ENV, "")
    if requested <= 0 and from_env.isdigit():
        requested = int(from_env)
    count = requested if requested > 0 else min(os.cpu_count() or 1, MAX_AUTO_THREADS)
    torch.set_num_threads(count)
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    return count
