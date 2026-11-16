"""Sınıflandırıcı: model yükleme, olasılık tahmini, eşik kararı ve ağırlıklı kayıplı eğitici.

Kim kullanır: `tasks/classification/train.py`, `evaluate.py`, `predict.py`.

Karar kuralı ve eşik dosyası: `tasks/classification/thresholds.py` (torch'suz, ONNX ile de kullanılır).

Genişletme: başka bir kayıp (ör. odak kaybı) için `WeightedTrainer.compute_loss` içini değiştirin.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from transformers import Trainer

from ince_ayar.tasks.classification.thresholds import THRESHOLD_FILE, Thresholds
from ince_ayar.tasks.encoder_base import find_trained_dir


class WeightedTrainer(Trainer):  # type: ignore[misc]
    """Sınıf ağırlıklı çapraz entropi. Kayıp mikro yığın ortalamasıdır; gradyan biriktirmeye göre
    bölmeyi Trainer yapar (`loss_is_scaled_for_ga = False`)."""

    loss_is_scaled_for_ga = False

    def __init__(self, *args: Any, class_weights: list[float] | None = None, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.class_weights = class_weights

    def compute_loss(
        self,
        model: Any,
        inputs: dict[str, Any],
        return_outputs: bool = False,
        num_items_in_batch: Any = None,
    ) -> Any:
        import torch
        from torch.nn import functional

        labels = inputs.pop("labels")
        outputs = model(**inputs)
        weight = None
        if self.class_weights is not None:
            weight = torch.tensor(
                self.class_weights, dtype=outputs.logits.dtype, device=labels.device
            )
        loss = functional.cross_entropy(outputs.logits.float(), labels, weight=weight)
        return (loss, outputs) if return_outputs else loss


def load_classifier(base: str, labels: list[str], kwargs: dict[str, Any]) -> Any:
    from transformers import AutoModelForSequenceClassification

    return AutoModelForSequenceClassification.from_pretrained(
        base,
        num_labels=len(labels),
        id2label=dict(enumerate(labels)),
        label2id={label: index for index, label in enumerate(labels)},
        **kwargs,
    )


def load_trained(path: Path, device: str = "cpu") -> tuple[Any, Any, Thresholds]:
    """Eğitilmiş sınıflandırıcıyı, tokenizer'ını ve eşiklerini yükler."""
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    directory = find_trained_dir(path)
    model = AutoModelForSequenceClassification.from_pretrained(str(directory)).to(device).eval()
    tokenizer = AutoTokenizer.from_pretrained(str(directory))
    if (directory / THRESHOLD_FILE).is_file():
        thresholds = Thresholds.load(directory)
    else:
        labels = [model.config.id2label[i] for i in range(model.config.num_labels)]
        thresholds = Thresholds(labels)
    return model, tokenizer, thresholds


def predict_proba(
    model: Any, tokenizer: Any, texts: list[str], max_length: int, batch: int = 32
) -> np.ndarray:
    """Metinlerin sınıf olasılıkları (satır: metin, sütun: sınıf)."""
    import torch

    rows: list[np.ndarray] = []
    for start in range(0, len(texts), batch):
        encoded = tokenizer(
            texts[start : start + batch],
            truncation=True,
            max_length=max_length,
            padding=True,
            return_tensors="pt",
        ).to(model.device)
        with torch.no_grad():
            logits = model(**encoded).logits.float()
        rows.append(torch.softmax(logits, dim=-1).cpu().numpy())
    return np.concatenate(rows) if rows else np.zeros((0, model.config.num_labels))
