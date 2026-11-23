"""Eğitilmiş modelle tahmin: PyTorch kaydından ya da ONNX paketinden — aynı arayüz, aynı karar kuralı.

Kim kullanır: `tahmin`, `degerlendir` komutları.

`load_classifier(yol, onnx=True)` → `OnnxClassifier` (torch'suz), `onnx=False` → `TorchClassifier`.
İkisi de `labels`, `decision`, `logits(görüntüler)`, `predict(görüntüler)` sunar; ön işleme ikisinde de
`hazirlik.model_input.prepare_batch`'tir. Çok görüntüde bellek taşmasın diye `CHUNK`'lık parçalar.

Genişletme: başka bir çalışma zamanı (ör. OpenVINO) için aynı yöntemleri sağlayan bir sınıf yazıp
`load_classifier` içine dal ekleyin.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any, Protocol

import numpy as np
from PIL import Image

from goruntu.disa_aktar.runtime import OnnxClassifier, Prediction, predictions_from
from goruntu.errors import ImageRejectedError
from goruntu.hazirlik.loader import LoadLimits, load_rgb
from goruntu.hazirlik.model_input import InputSpec, prepare_batch
from goruntu.siniflandirma.calibration import Decision

CHUNK = 32


class Classifier(Protocol):
    decision: Decision

    @property
    def labels(self) -> list[str]: ...

    def logits(self, images: list[Image.Image]) -> np.ndarray: ...

    def predict(self, images: list[Image.Image], top: int = 3) -> list[Prediction]: ...


class TorchClassifier:
    def __init__(self, path: Path) -> None:
        from goruntu.siniflandirma.model import load_checkpoint

        self.model, self.meta = load_checkpoint(path)
        self.spec = InputSpec.model_validate(self.meta["on_isleme"])
        self.decision = Decision(
            self.meta["etiketler"], float(self.meta["sicaklik"]), float(self.meta["esik"])
        )

    @property
    def labels(self) -> list[str]:
        return list(self.meta["etiketler"])

    def logits(self, images: list[Image.Image]) -> np.ndarray:
        import torch

        if not images:
            return np.zeros((0, len(self.labels)), dtype=np.float32)
        batch = torch.from_numpy(prepare_batch(images, self.spec))
        with torch.inference_mode():
            return np.asarray(self.model(batch).float().numpy())

    def predict(self, images: list[Image.Image], top: int = 3) -> list[Prediction]:
        probabilities = self.decision.probabilities(self.logits(images))
        return predictions_from(probabilities, self.decision, top)


def load_classifier(path: Path, onnx: bool = False, int8: bool = False) -> Classifier:
    if onnx or path.suffix == ".onnx":
        return OnnxClassifier(path, int8=int8)
    return TorchClassifier(path)


def iterate_logits(
    classifier: Classifier, paths: list[Path], limits: LoadLimits
) -> Iterator[tuple[list[Path], np.ndarray, list[tuple[Path, str]]]]:
    """Dosyaları `CHUNK`'lık parçalarla açar: (açılanlar, logitler, açılamayanlar[yol, ileti])."""
    for start in range(0, len(paths), CHUNK):
        opened: list[Path] = []
        images: list[Image.Image] = []
        failed: list[tuple[Path, str]] = []
        for path in paths[start : start + CHUNK]:
            try:
                images.append(load_rgb(path, limits))
                opened.append(path)
            except ImageRejectedError as exc:
                failed.append((path, str(exc)))
        yield opened, classifier.logits(images), failed


def training_dir_of(path: Path) -> Path | None:
    """Eğitim çıktı klasörünü bulur (`ayrim.json` olan klasör): kök, model/ ya da paket/ verilebilir."""
    candidates: list[Any] = [path, path.parent, path.parent.parent]
    for candidate in candidates:
        if isinstance(candidate, Path) and (candidate / "ayrim.json").is_file():
            return candidate
    return None
