"""Kuru çalıştırma planı: eğitim başlamadan ne olacağını ve tahmini belleği yazar.

Kim kullanır: her görevin `egit` eylemi (plan her zaman yazılır; `--kuru` verilmişse orada durur).

Genişletme: plana yeni satır eklemek için görevin `train.py` dosyasındaki `rows` listesine
`(başlık, değer)` çifti ekleyin; bu dosya yalnız biçimlendirir ve adım/bellek hesabını yapar.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from ince_ayar.hardware import Hardware, Precision
from ince_ayar.memory import MemoryEstimate
from ince_ayar.messages import t


@dataclass(frozen=True)
class Target:
    """Planın hangi donanım için yapıldığı (bu makine ya da hazır ayarın hedeflediği kart)."""

    on_gpu: bool
    mixed_precision: bool
    memory_gb: float | None
    label: str


def training_steps(
    examples: int, batch: int, accumulation: int, epochs: float, max_steps: int
) -> int:
    """Toplam güncelleme adımı (Trainer ile aynı hesap): dönem başına ⌈⌈n/yığın⌉/biriktirme⌉."""
    if max_steps > 0:
        return max_steps
    per_epoch = max(math.ceil(math.ceil(examples / batch) / accumulation), 1)
    return math.ceil(epochs * per_epoch)


def plan_target(
    hardware: Hardware, precision: Precision, requested_precision: str, target_gb: float
) -> Target:
    """Bellek tahmininin hedefi: GPU varsa o; yoksa hazır ayarın `hedef_bellek_gb` değeri."""
    if hardware.device == "cuda":
        mixed = precision.bf16 or precision.fp16
        return Target(True, mixed, hardware.memory_gb, hardware.name)
    if target_gb > 0:
        return Target(
            True, requested_precision != "fp32", target_gb, t("plan.hedef_kart", gb=target_gb)
        )
    return Target(False, False, None, hardware.name)


def memory_verdict(estimate: MemoryEstimate, target: Target) -> str:
    """Tahmini hedef bellekle karşılaştırır: sığar / sınırda / sığmaz."""
    span = t("plan.bellek_aralik", dusuk=f"{estimate.low_gb:.1f}", yuksek=f"{estimate.high_gb:.1f}")
    if target.memory_gb is None:
        return span
    if estimate.high_gb <= target.memory_gb:
        return span + " " + t("plan.sigar", gb=f"{target.memory_gb:.0f}")
    if estimate.low_gb <= target.memory_gb:
        return span + " " + t("plan.sinirda", gb=f"{target.memory_gb:.0f}")
    return span + " " + t("plan.sigmaz", gb=f"{target.memory_gb:.0f}")


def memory_rows(estimate: MemoryEstimate, target: Target) -> list[tuple[str, str]]:
    """Bellek tahminini plan satırlarına çevirir."""
    return [
        (t("plan.satir.hedef"), target.label),
        (t("plan.satir.egitilen"), f"{estimate.trainable_parameters:,}".replace(",", ".")),
        (t("plan.satir.agirlik"), f"{estimate.weights_gb:.2f} GB"),
        (t("plan.satir.egitilen_bellek"), f"{estimate.trainable_gb:.2f} GB"),
        (t("plan.satir.etkinlestirme"), f"{estimate.activations_gb:.2f} GB"),
        (t("plan.satir.sabit"), f"{estimate.overhead_gb:.2f} GB"),
        (t("plan.satir.toplam"), memory_verdict(estimate, target)),
        (t("plan.satir.varsayim"), "; ".join(estimate.assumptions)),
    ]


def render_plan(title: str, rows: list[tuple[str, str]], notes: list[str]) -> str:
    """Planı hizalı satırlar ve uyarı listesi olarak biçimlendirir."""
    width = max(len(label) for label, _ in rows)
    lines = [title, "=" * len(title)]
    lines.extend(f"{label.ljust(width)} : {value}" for label, value in rows)
    if notes:
        lines.append("")
        lines.append(t("plan.uyarilar"))
        lines.extend(f"  - {note}" for note in notes)
    return "\n".join(lines)


def encoder_memory_rows(
    base: str,
    hardware: Hardware,
    precision: Precision,
    requested_precision: str,
    target_gb: float,
    sequences: int,
    length: int,
    notes: list[str],
) -> list[tuple[str, str]]:
    """Kodlayıcı görevlerinin (tam ince ayar) bellek satırları; tahmin yapılamazsa not düşer.

    `sequences`: bir ileri-geri geçişte aynı anda bellekte duran dizi sayısı (yığın × sütun).
    """
    from ince_ayar.memory import estimate_full, read_shape

    target = plan_target(hardware, precision, requested_precision, target_gb)
    try:
        shape = read_shape(base, "encoder")
    except Exception as exc:  # çevrimdışı Hub kimliği, bozuk yapılandırma…
        notes.append(t("plan.bellek_yok", ayrinti=str(exc).splitlines()[0]))
        return []
    estimate = estimate_full(shape, sequences, length, target.mixed_precision)
    return memory_rows(estimate, target)
