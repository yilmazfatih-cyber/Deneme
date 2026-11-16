"""Sınıflandırma ölçütleri: doğruluk, sınıf başına kesinlik/duyarlılık/F1, makro F1, karışıklık
matrisi ve eşik ayarı (bağımlılıksız; testlerde scikit-learn ile karşılaştırılır).

Kim kullanır: `tasks/classification` (eğitim sırasında ve `degerlendir` eyleminde),
`tasks/ner` (belirteç düzeyi doğruluk).

Tanımlar:
- Karışıklık matrisi: satır = gerçek sınıf, sütun = tahmin.
- Makro F1: gerçekte ya da tahminde en az bir kez görülen sınıfların F1 ortalaması (her sınıf
  eşit ağırlıkta; dengesiz veride doğruluktan daha dürüsttür).
- İkili eşik: olumlu sınıf olasılığı için makro F1'i en yükselten kesme noktası.
- Güven eşiği: "en yüksek olasılık bu değerin altındaysa karar verme" sınırı; hedeflenen
  doğruluğu sağlayan en düşük eşik ve o eşikte yanıtlanan örnek oranı (kapsama).

Genişletme: yeni bir ölçüt için `ClassificationReport` içine alan ekleyin ve
`tests/test_metrics_classification.py` içinde scikit-learn karşılığıyla doğrulayın.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from itertools import pairwise

from ince_ayar.console import format_table
from ince_ayar.messages import headers


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

    def to_dict(self) -> dict[str, object]:
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


def confusion_matrix(y_true: Sequence[int], y_pred: Sequence[int], size: int) -> list[list[int]]:
    """`matrix[gerçek][tahmin]` sayıları."""
    matrix = [[0] * size for _ in range(size)]
    for truth, guess in zip(y_true, y_pred, strict=True):
        matrix[truth][guess] += 1
    return matrix


def _ratio(numerator: int, denominator: int) -> float:
    return numerator / denominator if denominator else 0.0


def classification_report(
    y_true: Sequence[int], y_pred: Sequence[int], labels: Sequence[str]
) -> ClassificationReport:
    """Bütün ölçütleri tek geçişte hesaplar. `y_*` değerleri `labels` içindeki sıra numaralarıdır."""
    size = len(labels)
    matrix = confusion_matrix(y_true, y_pred, size)
    per_class: dict[str, ClassScore] = {}
    f1_values: list[float] = []
    for index, label in enumerate(labels):
        true_positive = matrix[index][index]
        support = sum(matrix[index])
        predicted = sum(matrix[row][index] for row in range(size))
        precision = _ratio(true_positive, predicted)
        recall = _ratio(true_positive, support)
        f1 = _ratio(2 * true_positive, support + predicted)
        per_class[label] = ClassScore(precision, recall, f1, support)
        if support or predicted:
            f1_values.append(f1)
    correct = sum(matrix[index][index] for index in range(size))
    return ClassificationReport(
        labels=list(labels),
        accuracy=_ratio(correct, len(y_true)),
        macro_f1=sum(f1_values) / len(f1_values) if f1_values else 0.0,
        per_class=per_class,
        confusion=matrix,
    )


def render_report(report: ClassificationReport) -> str:
    """Raporu iki düz tablo olarak yazar: sınıf ölçütleri ve karışıklık matrisi."""
    rows = [
        [label, score.precision, score.recall, score.f1, score.support]
        for label, score in report.per_class.items()
    ]
    scores = format_table(headers("siniflandirma.tablo"), rows)
    matrix_rows = [[label, *report.confusion[i]] for i, label in enumerate(report.labels)]
    matrix = format_table([headers("siniflandirma.matris")[0], *report.labels], matrix_rows)
    summary = f"{headers('siniflandirma.ozet')[0]}: {report.accuracy:.4f}   "
    summary += f"{headers('siniflandirma.ozet')[1]}: {report.macro_f1:.4f}"
    return f"{summary}\n\n{scores}\n\n{headers('siniflandirma.matris')[1]}\n{matrix}"


def best_binary_threshold(
    positive_scores: Sequence[float], y_true: Sequence[int]
) -> tuple[float, float]:
    """İkili sınıflandırmada makro F1'i en yükselten eşik: (eşik, makro F1).

    Aday eşikler ardışık farklı skorların orta noktalarıdır. Eşitlikte 0,5'e en yakın aday seçilir
    (gereksiz yere uç değere kaçmamak için). Kural: skor >= eşik ise olumlu (1).
    """
    if not positive_scores:
        return 0.5, 0.0
    unique = sorted(set(positive_scores))
    candidates = [0.5] + [(low + high) / 2 for low, high in pairwise(unique)]
    best_threshold, best_score = 0.5, -1.0
    for threshold in sorted(candidates, key=lambda value: (abs(value - 0.5), value)):
        predicted = [1 if score >= threshold else 0 for score in positive_scores]
        score = classification_report(y_true, predicted, ["0", "1"]).macro_f1
        if score > best_score + 1e-12:
            best_threshold, best_score = threshold, score
    return best_threshold, best_score


def confidence_threshold(
    confidences: Sequence[float], correct: Sequence[bool], target_accuracy: float
) -> tuple[float | None, float]:
    """Hedef doğruluğu sağlayan en düşük güven eşiği: (eşik ya da None, kapsama).

    Örnekler güvene göre azalan sırada kabul edilir; kabul edilenlerin doğruluğu hedefin altına
    düşmeyen en geniş küme seçilir. Hiçbir küme hedefi tutturamıyorsa (None, 0.0) döner.
    """
    order = sorted(range(len(confidences)), key=lambda index: -confidences[index])
    best: tuple[float | None, float] = (None, 0.0)
    hits = 0
    for position, index in enumerate(order, start=1):
        hits += 1 if correct[index] else 0
        is_boundary = position == len(order) or confidences[order[position]] < confidences[index]
        if is_boundary and hits / position >= target_accuracy:
            best = (confidences[index], position / len(order))
    return best
