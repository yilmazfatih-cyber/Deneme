"""Sınıflandırıcı değerlendirmesi: eşik ayarı, doğruluk + makro F1 + karışıklık matrisi, kapsama.

Kim kullanır: `tasks/classification/train.py` (eğitim sonunda) ve
`python -m ince_ayar siniflandirma degerlendir` (PyTorch ya da `--onnx` ile ONNX modeliyle).

Eşik ayarı **doğrulama** kümesinde yapılır, rapor **test** kümesinde verilir (test yoksa
doğrulamada; bu durumda sonuç iyimserdir ve rapora not düşülür).

Genişletme: yeni bir rapor alanı için `report_on` sonucuna anahtar ekleyin.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np

from ince_ayar import console
from ince_ayar.data.records import LabeledText
from ince_ayar.data.validate import load_classification
from ince_ayar.io_utils import write_json
from ince_ayar.messages import t
from ince_ayar.metrics.classification import (
    best_binary_threshold,
    classification_report,
    confidence_threshold,
    render_report,
)
from ince_ayar.runs import EVALUATION_FILE
from ince_ayar.tasks.classification.config import ClassificationConfig, ThresholdSection
from ince_ayar.tasks.classification.data import prepare_splits
from ince_ayar.tasks.classification.thresholds import Thresholds


def tune_thresholds(
    probabilities: np.ndarray,
    rows: list[LabeledText],
    labels: list[str],
    train_rows: list[LabeledText],
    settings: ThresholdSection,
) -> Thresholds:
    """Doğrulama olasılıklarından eşikleri seçer (bkz. `metrics/classification.py`)."""
    truth = [labels.index(row.label) for row in rows]
    positive: str | None = None
    binary: float | None = None
    if len(labels) == 2 and settings.ikili_esik_ayari and rows:
        counts = Counter(row.label for row in train_rows)
        positive = min(labels, key=lambda label: (counts[label], label))  # az olan sınıf
        index = labels.index(positive)
        binary, _ = best_binary_threshold(
            [float(p[index]) for p in probabilities], [1 if y == index else 0 for y in truth]
        )
    thresholds = Thresholds(labels, positive, binary)
    if settings.hedef_dogruluk > 0 and rows:
        decided = thresholds.decide(probabilities)
        chosen = [labels.index(d) if d is not None else 0 for d in decided]
        confidence = [float(p[i]) for p, i in zip(probabilities, chosen, strict=True)]
        correct = [i == y for i, y in zip(chosen, truth, strict=True)]
        level, coverage = confidence_threshold(confidence, correct, settings.hedef_dogruluk)
        thresholds = Thresholds(labels, positive, binary, level, coverage)
    return thresholds


def report_on(
    rows: list[LabeledText], probabilities: np.ndarray, thresholds: Thresholds
) -> dict[str, Any]:
    """Kararları uygular ve ölçütleri hesaplar; 'belirsiz' kararlar ayrıca sayılır."""
    labels = thresholds.labels
    plain = Thresholds(labels, thresholds.positive_label, thresholds.binary_threshold)
    decided = plain.decide(probabilities)
    truth = [labels.index(row.label) for row in rows]
    predicted = [labels.index(str(label)) for label in decided]
    report = classification_report(truth, predicted, labels)
    result: dict[str, Any] = {
        "ornek": len(rows),
        **report.to_dict(),
        "tablo": render_report(report),
    }
    if thresholds.confidence_threshold is not None:
        guarded = thresholds.decide(probabilities)
        answered = [i for i, d in enumerate(guarded) if d is not None]
        hits = sum(1 for i in answered if guarded[i] == rows[i].label)
        result["guven_esigi"] = thresholds.confidence_threshold
        result["kapsama"] = len(answered) / len(rows) if rows else 0.0
        result["yanitlananlarda_dogruluk"] = hits / len(answered) if answered else 0.0
    return result


def probabilities_for(
    model_path: Path, texts: list[str], max_length: int, use_onnx: bool
) -> tuple[np.ndarray, Thresholds]:
    """PyTorch ya da ONNX modeliyle olasılıkları hesaplar."""
    if use_onnx:
        from ince_ayar.export.onnx_runtime import OnnxClassifier

        onnx_model = OnnxClassifier(model_path)
        return onnx_model.probabilities(texts), onnx_model.thresholds
    from ince_ayar.tasks.classification.modeling import load_trained, predict_proba

    model, tokenizer, thresholds = load_trained(model_path)
    return predict_proba(model, tokenizer, texts, max_length), thresholds


def evaluate_classifier(
    config: ClassificationConfig, model_path: str | None, data_path: str | None, use_onnx: bool
) -> dict[str, Any]:
    """Komut satırı değerlendirmesi: test kümesi (ya da verilen dosya) üzerinde rapor."""
    if data_path:
        loaded = load_classification(Path(data_path), config.veri.kodlama)
        loaded.raise_if_errors()
        rows, name = loaded.rows, data_path
    else:
        splits = prepare_splits(config.veri)
        rows, name = (splits.test, "test") if splits.test else (splits.validation, "dogrulama")
    target = Path(model_path or config.egitim.cikti)
    probabilities, thresholds = probabilities_for(
        target, [row.text for row in rows], config.veri.azami_uzunluk, use_onnx
    )
    result = report_on(rows, probabilities, thresholds)
    console.result(t("siniflandirma.rapor_baslik", kume=name, ornek=len(rows)))
    console.result(result.pop("tablo"))
    if "kapsama" in result:
        console.result(
            t(
                "siniflandirma.kapsama",
                esik=f"{result['guven_esigi']:.3f}",
                kapsama=f"{result['kapsama']:.1%}",
                dogruluk=f"{result['yanitlananlarda_dogruluk']:.4f}",
            )
        )
    if target.is_dir():
        write_json(target / EVALUATION_FILE, {"veri": name, "onnx": use_onnx, **result})
    return result
