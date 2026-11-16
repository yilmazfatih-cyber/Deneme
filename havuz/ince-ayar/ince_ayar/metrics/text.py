"""Üretilen metni beklenenle karşılaştıran ölçütler: tam eşleşme ve ROUGE-L (bağımlılıksız).

Kim kullanır: sohbet görevinin değerlendirmesi (`tasks/chat/evaluate.py`).

- Tam eşleşme: sadeleştirilmiş (Türkçe küçük harf, noktalama ve fazla boşluk atılmış) metinler
  birebir aynı mı. Kısa, tek doğru yanıtlı işler için (sınıf adı, tarih, evet/hayır) uygundur.
- ROUGE-L: en uzun ortak alt dizi (LCS) üzerinden kesinlik, duyarlılık ve F1. Sözcük düzeyi katıdır
  ("evde" ≠ "evdeki"); karakter düzeyi Türkçe eklerine toleranslıdır. İkisi de raporlanır.

Bu ölçütler anlamı değil **yüzey benzerliğini** ölçer; ne zaman yanılttıkları
`docs/DEGERLENDIRME.md` içinde anlatılır.

Genişletme: yeni ölçütü `score_generations` sonucuna ekleyin ve `tests/test_metrics_text.py`
içinde elle hesaplanmış bir örnekle doğrulayın.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from ince_ayar.text_tr import normalize_for_metric, words

Unit = Literal["sozcuk", "karakter"]


@dataclass(frozen=True)
class RougeL:
    precision: float
    recall: float
    f1: float


def exact_match(prediction: str, reference: str) -> bool:
    """Sadeleştirilmiş metinler birebir aynı mı."""
    return normalize_for_metric(prediction) == normalize_for_metric(reference)


def lcs_length(left: Sequence[str], right: Sequence[str]) -> int:
    """En uzun ortak alt dizinin uzunluğu (O(n·m) zaman, O(m) bellek)."""
    if not left or not right:
        return 0
    previous = [0] * (len(right) + 1)
    for item in left:
        current = [0]
        for index, other in enumerate(right, start=1):
            if item == other:
                current.append(previous[index - 1] + 1)
            else:
                current.append(max(previous[index], current[index - 1]))
        previous = current
    return previous[-1]


def rouge_l(prediction: str, reference: str, unit: Unit = "sozcuk") -> RougeL:
    """ROUGE-L kesinlik / duyarlılık / F1. İki metin de boşsa 1, yalnız biri boşsa 0."""
    if unit == "sozcuk":
        candidate: Sequence[str] = words(prediction)
        target: Sequence[str] = words(reference)
    else:
        candidate = normalize_for_metric(prediction)
        target = normalize_for_metric(reference)
    if not candidate and not target:
        return RougeL(1.0, 1.0, 1.0)
    if not candidate or not target:
        return RougeL(0.0, 0.0, 0.0)
    common = lcs_length(candidate, target)
    precision = common / len(candidate)
    recall = common / len(target)
    f1 = 2 * precision * recall / (precision + recall) if common else 0.0
    return RougeL(precision, recall, f1)


def score_generations(predictions: Sequence[str], references: Sequence[str]) -> dict[str, float]:
    """Örnek ortalamaları: tam eşleşme oranı, ROUGE-L F1 (sözcük ve karakter)."""
    if len(predictions) != len(references):
        raise ValueError("predictions ve references aynı uzunlukta olmalı")
    count = len(predictions)
    if count == 0:
        return {"ornek": 0, "tam_eslesme": 0.0, "rouge_l": 0.0, "rouge_l_karakter": 0.0}
    pairs = list(zip(predictions, references, strict=True))
    return {
        "ornek": count,
        "tam_eslesme": sum(exact_match(p, r) for p, r in pairs) / count,
        "rouge_l": sum(rouge_l(p, r).f1 for p, r in pairs) / count,
        "rouge_l_karakter": sum(rouge_l(p, r, "karakter").f1 for p, r in pairs) / count,
    }
