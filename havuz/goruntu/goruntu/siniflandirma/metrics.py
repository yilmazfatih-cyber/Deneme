"""Sınıflandırma ölçütleri (yalnız numpy): doğruluk, sınıf başına kesinlik/duyarlılık/F1, makro F1,
karışıklık matrisi, en çok karıştırılan çiftler, en emin yanlışlar.

Kim kullanır: `train.py` (her dönem), `evaluate.py` (rapor). Testte scikit-learn ile karşılaştırılır.

Tanımlar:
- Karışıklık matrisi: satır = gerçek sınıf, sütun = tahmin.
- Makro F1: gerçekte ya da tahminde en az bir kez görülen sınıfların F1 ortalaması (scikit-learn'ün
  `average="macro"` davranışı). Dengesiz veride doğruluktan dürüsttür: az olan sınıf da eşit sayılır.
- Karıştırılan çift: (gerçek, tahmin) hücresi; oran = o hücre / gerçek sınıfın örnek sayısı.
- En emin yanlışlar: yanlış ama yüksek güvenli tahminler — çoğu kez ETİKET HATASIdır; elle bakın.

Genişletme: yeni ölçüt için `ClassificationReport`'a alan ekleyin, `tests/test_metrics.py` içinde
scikit-learn karşılığıyla doğrulayın.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import numpy as np


@dataclass(frozen=True)
class ClassScore:
    precision: float
    recall: float
    f1: float
    support: int


@dataclass(frozen=True)
class ClassificationReport:
    labels: list[str]
    accuracy: float
    macro_f1: float
    per_class: dict[str, ClassScore]
    confusion: list[list[int]]

    def to_dict(self) -> dict[str, Any]:
        return {
            "dogruluk": self.accuracy,
            "makro_f1": self.macro_f1,
            "sinif": {
                label: {
                    "kesinlik": score.precision,
                    "duyarlilik": score.recall,
                    "f1": score.f1,
                    "ornek": score.support,
                }
                for label, score in self.per_class.items()
            },
            "etiketler": self.labels,
            "karisiklik_matrisi": self.confusion,
        }


def confusion_matrix(y_true: Sequence[int], y_pred: Sequence[int], size: int) -> np.ndarray:
    """`matrix[gerçek, tahmin]` sayıları (int64)."""
    matrix = np.zeros((size, size), dtype=np.int64)
    np.add.at(matrix, (np.asarray(y_true, dtype=np.int64), np.asarray(y_pred, dtype=np.int64)), 1)
    return matrix


def _ratio(numerator: float, denominator: float) -> float:
    return float(numerator / denominator) if denominator else 0.0


def classification_report(
    y_true: Sequence[int], y_pred: Sequence[int], labels: Sequence[str]
) -> ClassificationReport:
    """Bütün ölçütleri tek geçişte hesaplar. `y_*` değerleri `labels` içindeki sıra numaralarıdır."""
    size = len(labels)
    matrix = confusion_matrix(y_true, y_pred, size)
    per_class: dict[str, ClassScore] = {}
    f1_values: list[float] = []
    for index, label in enumerate(labels):
        true_positive = int(matrix[index, index])
        support = int(matrix[index].sum())
        predicted = int(matrix[:, index].sum())
        f1 = _ratio(2 * true_positive, support + predicted)
        per_class[label] = ClassScore(
            _ratio(true_positive, predicted), _ratio(true_positive, support), f1, support
        )
        if support or predicted:
            f1_values.append(f1)
    total = int(matrix.sum())
    return ClassificationReport(
        labels=list(labels),
        accuracy=_ratio(float(np.trace(matrix)), total),
        macro_f1=sum(f1_values) / len(f1_values) if f1_values else 0.0,
        per_class=per_class,
        confusion=matrix.tolist(),
    )


def confused_pairs(report: ClassificationReport, limit: int = 10) -> list[dict[str, Any]]:
    """En çok karıştırılan (gerçek → tahmin) çiftleri, sayıya göre azalan."""
    pairs: list[dict[str, Any]] = []
    for row, true_label in enumerate(report.labels):
        support = sum(report.confusion[row])
        for column, predicted_label in enumerate(report.labels):
            count = report.confusion[row][column]
            if row != column and count:
                pairs.append(
                    {
                        "gercek": true_label,
                        "tahmin": predicted_label,
                        "sayi": count,
                        "oran": _ratio(count, support),
                    }
                )
    pairs.sort(key=lambda item: (-item["sayi"], item["gercek"], item["tahmin"]))
    return pairs[:limit]


def confident_mistakes(
    probabilities: np.ndarray,
    y_true: Sequence[int],
    names: Sequence[str],
    labels: Sequence[str],
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Yanlış ama en emin tahminler: etiket hatası adayları (dosya, gerçek, tahmin, güven)."""
    predicted = probabilities.argmax(axis=1)
    confidence = probabilities.max(axis=1)
    wrong = [i for i in range(len(names)) if int(predicted[i]) != int(y_true[i])]
    wrong.sort(key=lambda i: -float(confidence[i]))
    return [
        {
            "dosya": names[i],
            "gercek": labels[int(y_true[i])],
            "tahmin": labels[int(predicted[i])],
            "guven": float(confidence[i]),
        }
        for i in wrong[:limit]
    ]
