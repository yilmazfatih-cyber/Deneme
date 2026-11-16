"""Eğitim koşusunun ortak parçaları: `Trainer` argümanları, çıktı dosyaları, sürüm ve donanım kaydı.

Kim kullanır: bütün görevlerin `train.py` dosyaları. Her koşu çıktı klasörüne şunları bırakır:
`ayar.toml` (çözülmüş yapılandırma), `ozet.json` (ölçütler, süre, sürümler, tohum),
`egitim_gunlugu.jsonl`, `rapor.html` ve `denetim/` (ara kayıtlar; `--surdur` buradan devam eder).

Genişletme: bütün görevlerde geçerli yeni bir `Trainer` ayarı için `common_arguments` içine satır
ekleyin; tek göreve özgü ayar o görevin `train.py` dosyasında kalır.
"""

from __future__ import annotations

import importlib.metadata
import platform
import time
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from ince_ayar import console
from ince_ayar.config import TrainSection, dump_config
from ince_ayar.hardware import Hardware, Precision
from ince_ayar.io_utils import write_json
from ince_ayar.messages import t

CHECKPOINT_DIR = "denetim"
SUMMARY_FILE = "ozet.json"
CONFIG_FILE = "ayar.toml"
REPORT_FILE = "rapor.html"
EVALUATION_FILE = "degerlendirme.json"
PACKAGES = (
    "torch", "transformers", "tokenizers", "datasets", "peft", "trl", "accelerate",
    "sentence-transformers", "onnx", "onnxruntime",
)  # fmt: skip


def common_arguments(
    train: TrainSection,
    hardware: Hardware,
    precision: Precision,
    out_dir: Path,
    has_eval: bool,
    eval_steps: int = 0,
    best_metric: str = "eval_loss",
    greater_is_better: bool = False,
) -> dict[str, Any]:
    """Bütün görevlerin paylaştığı `TrainingArguments` alanları."""
    strategy = "no" if not has_eval else ("steps" if eval_steps > 0 else "epoch")
    arguments: dict[str, Any] = {
        "output_dir": str(out_dir / CHECKPOINT_DIR),
        "num_train_epochs": train.donem,
        "max_steps": train.azami_adim,
        "per_device_train_batch_size": train.yigin,
        "per_device_eval_batch_size": train.degerlendirme_yigini,
        "gradient_accumulation_steps": train.biriktirme,
        "learning_rate": train.ogrenme_orani,
        "lr_scheduler_type": train.zamanlayici,
        "warmup_steps": train.isinma_orani,  # [0, 1) aralığındaki değer oran olarak yorumlanır
        "weight_decay": train.agirlik_curumesi,
        "bf16": precision.bf16,
        "fp16": precision.fp16,
        "use_cpu": hardware.device == "cpu",
        "logging_steps": train.kayit_adimi,
        "logging_first_step": True,
        "eval_strategy": strategy,
        "save_strategy": strategy,
        "save_total_limit": 2,
        "load_best_model_at_end": has_eval,
        "metric_for_best_model": best_metric,
        "greater_is_better": greater_is_better,
        "report_to": "none",
        "seed": train.tohum,
        "data_seed": train.tohum,
        "dataloader_pin_memory": hardware.device == "cuda",
        "disable_tqdm": True,
    }
    if strategy == "steps":
        arguments["eval_steps"] = eval_steps
        arguments["save_steps"] = eval_steps
    return arguments


def last_checkpoint(out_dir: Path) -> str | None:
    """`--surdur` için en son ara kaydı bulur; yoksa None."""
    from transformers.trainer_utils import get_last_checkpoint

    directory = out_dir / CHECKPOINT_DIR
    return get_last_checkpoint(str(directory)) if directory.is_dir() else None


def quiet_trainer(trainer: Any) -> None:
    """Trainer'ın kendi sözlük dökümünü kapatır; ilerlemeyi `LogCollector` yazar."""
    from transformers.trainer_callback import PrinterCallback, ProgressCallback

    trainer.remove_callback(PrinterCallback)
    trainer.remove_callback(ProgressCallback)


def environment_info(hardware: Hardware, precision: Precision) -> dict[str, Any]:
    """Yeniden üretilebilirlik için sürüm ve donanım kaydı."""
    versions: dict[str, str] = {"python": platform.python_version()}
    for package in PACKAGES:
        try:
            versions[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            continue
    return {
        "surumler": versions,
        "donanim": {
            "aygit": hardware.device,
            "ad": hardware.name,
            "bellek_gb": hardware.memory_gb,
            "duyarlik": precision.label,
        },
    }


def write_run_files(out_dir: Path, config: BaseModel, summary: dict[str, Any]) -> None:
    """Çözülmüş yapılandırmayı ve özet dosyasını çıktı klasörüne yazar."""
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / CONFIG_FILE).write_text(dump_config(config), encoding="utf-8")
    write_json(out_dir / SUMMARY_FILE, summary)
    console.info(t("egitim.kaydedildi", yol=out_dir))


class Stopwatch:
    """Süre ölçer (saat dışarıdan verilebilir ki test edilebilsin)."""

    def __init__(self, clock: Any = time.perf_counter) -> None:
        self._clock = clock
        self._start = clock()

    def seconds(self) -> float:
        return round(float(self._clock() - self._start), 2)
