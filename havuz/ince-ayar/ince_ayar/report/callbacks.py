"""Eğitim geri çağrıları: günlükleri dosyaya yazar, kısa ilerleme satırı basar, örnek üretim kaydeder.

Kim kullanır: görevlerin `train.py` dosyaları (transformers `Trainer` ve türevleriyle).

- `LogCollector`: her günlük kaydını `egitim_gunlugu.jsonl` dosyasına ekler ve tek satırlık Türkçe
  ilerleme bilgisi yazar (Colab'da ilerleme çubuğu görünmez; bu satırlar görünür).
- `SampleCallback`: her değerlendirmede verilen işlevi çağırır ve sonuçları adım numarasıyla
  `ornek_uretimler.jsonl` dosyasına ekler. Kayıp düşerken çıktının gerçekten iyileşip
  iyileşmediğini gözle görmek için.

Genişletme: yeni bir geri çağrı için `transformers.TrainerCallback`'ten türetip görevin
`callbacks` listesine ekleyin.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

from transformers import TrainerCallback

from ince_ayar import console
from ince_ayar.io_utils import append_jsonl
from ince_ayar.messages import t

LOG_FILE = "egitim_gunlugu.jsonl"
SAMPLES_FILE = "ornek_uretimler.jsonl"


class LogCollector(TrainerCallback):  # type: ignore[misc]
    """Günlük kayıtlarını toplar; eğitim bitince `rows` üzerinden rapora aktarılır."""

    def __init__(self, directory: Path) -> None:
        self.path = directory / LOG_FILE
        self.rows: list[dict[str, Any]] = []
        if self.path.exists():
            self.path.unlink()

    def on_log(self, args: Any, state: Any, control: Any, logs: Any = None, **kwargs: Any) -> None:
        if not logs:
            return
        row = {"adim": int(state.global_step), **{k: v for k, v in logs.items() if _plain(v)}}
        self.rows.append(row)
        append_jsonl(self.path, row)
        total = int(state.max_steps or 0)
        if "loss" in logs:
            console.info(
                t(
                    "egitim.ilerleme",
                    adim=row["adim"],
                    toplam=total,
                    kayip=f"{logs['loss']:.4f}",
                    oran=f"{logs.get('learning_rate', 0.0):.2e}",
                )
            )
        elif "eval_loss" in logs:
            console.info(
                t("egitim.degerlendirme", adim=row["adim"], kayip=f"{logs['eval_loss']:.4f}")
            )


class SampleCallback(TrainerCallback):  # type: ignore[misc]
    """Her değerlendirmede `produce(model)` çağırır; dönen satırları adımla birlikte kaydeder."""

    def __init__(self, directory: Path, produce: Callable[[Any], list[dict[str, Any]]]) -> None:
        self.path = directory / SAMPLES_FILE
        self.produce = produce
        self.rows: list[dict[str, Any]] = []
        self._last_step = -1
        if self.path.exists():
            self.path.unlink()

    def on_evaluate(self, args: Any, state: Any, control: Any, **kwargs: Any) -> None:
        model = kwargs.get("model")
        if model is None or state.global_step == self._last_step:
            return  # aynı adımda ikinci değerlendirme (eğitim sonu) yeni bilgi vermez
        self._last_step = state.global_step
        was_training = bool(model.training)
        model.eval()
        try:
            for sample in self.produce(model):
                row = {"adim": int(state.global_step), **sample}
                self.rows.append(row)
                append_jsonl(self.path, row)
        finally:
            model.train(was_training)


def _plain(value: Any) -> bool:
    return isinstance(value, int | float | str | bool)
