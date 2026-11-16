"""Sınıflandırma eşikleri ve karar kuralı (yalnız numpy; ONNX çalışma zamanı da kullanır).

Kim kullanır: `tasks/classification/modeling.py`, `evaluate.py`, `export/onnx_runtime.py`.

Karar kuralı (`Thresholds.decide`):
1. İkili görevde `binary_threshold` varsa: olumlu sınıf olasılığı ≥ eşik → olumlu, değilse diğeri.
   Çok sınıflıda: en yüksek olasılıklı sınıf.
2. `confidence_threshold` varsa ve seçilen sınıfın olasılığı bunun altındaysa karar `None`
   ("belirsiz": karar insana bırakılır).

Genişletme: sınıfa özgü eşik gerekiyorsa `decide` içine yeni dal ekleyin ve `esik.json` biçimini
`save`/`load` ile birlikte güncelleyin.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from ince_ayar.io_utils import read_json, write_json

THRESHOLD_FILE = "esik.json"


@dataclass(frozen=True)
class Thresholds:
    labels: list[str]
    positive_label: str | None = None
    binary_threshold: float | None = None
    confidence_threshold: float | None = None
    coverage: float | None = None

    def decide(self, probabilities: np.ndarray) -> list[str | None]:
        """Olasılık satırlarından etiket kararları (None: belirsiz)."""
        decisions: list[str | None] = []
        for row in probabilities:
            if self.binary_threshold is not None and self.positive_label is not None:
                positive = self.labels.index(self.positive_label)
                index = positive if row[positive] >= self.binary_threshold else 1 - positive
            else:
                index = int(np.argmax(row))
            confident = self.confidence_threshold is None or row[index] >= self.confidence_threshold
            decisions.append(self.labels[index] if confident else None)
        return decisions

    def save(self, directory: Path) -> None:
        write_json(directory / THRESHOLD_FILE, asdict(self))

    @classmethod
    def load(cls, directory: Path) -> Thresholds:
        return cls(**read_json(directory / THRESHOLD_FILE))
