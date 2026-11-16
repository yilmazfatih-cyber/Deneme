"""Sıralama ölçütleri: ROC eğrisi / ROC-AUC ve kesinlik-duyarlılık eğrisi / PR-AUC.

Fikir: model bir skor (olasılık) verir; eşik seçmeden "pozitifleri negatiflerin önüne ne kadar
iyi diziyor" sorusunu ölçeriz. Skorları büyükten küçüğe dizip eşiği kaydırırken biriken doğru
pozitif ve yanlış pozitifleri sayarız.

  ROC-AUC  rastgele bir pozitifin rastgele bir negatiften yüksek skor alma olasılığı
           (0.5 = yazı-tura, 1.0 = kusursuz). Sınıf oranından etkilenmez.
  PR-AUC   ortalama kesinlik (AP). Pozitifler azsa (dolandırıcılık, kayıp) ROC'tan daha dürüsttür;
           taban çizgisi 0.5 değil, pozitif oranıdır.

Genişletme: yeni sıralama ölçütü için `_binary_counts` biriken sayımları hazır verir.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from ml_temel.ortak.types import Array, ArrayLike
from ml_temel.ortak.validation import check_consistent_length, column_or_1d


def binarize_target(y_true: ArrayLike, pos_label: Any = None) -> Array:
    """İkili hedefi 0/1 dizisine çevirir; `pos_label` verilmezse büyük olan etiket pozitiftir."""
    true = column_or_1d(y_true, name="y_true")
    classes = np.unique(true)
    if len(classes) > 2:
        raise ValueError(
            f"Bu ölçüt iki sınıflı hedef ister; {len(classes)} sınıf var: {classes.tolist()[:6]}."
        )
    if pos_label is None:
        pos_label = classes[-1]
    return (true == pos_label).astype(np.float64)


def _binary_counts(
    y_true: ArrayLike, y_score: ArrayLike, pos_label: Any
) -> tuple[Array, Array, Array]:
    """Azalan eşikler için (yanlış pozitif sayısı, doğru pozitif sayısı, eşik)."""
    target = binarize_target(y_true, pos_label)
    score = np.asarray(y_score, dtype=np.float64)
    if score.ndim == 2 and score.shape[1] == 2:
        score = score[:, 1]
    if score.ndim != 1:
        raise ValueError(
            f"y_score 1 boyutlu olmalı (pozitif sınıfın skoru); verilen biçim {score.shape}. "
            "`predict_proba(X)[:, 1]` verin."
        )
    check_consistent_length(target, score)
    if not np.isfinite(score).all():
        raise ValueError("y_score içinde NaN ya da sonsuz değer var.")
    order = np.argsort(-score, kind="stable")
    score, target = score[order], target[order]
    distinct = np.flatnonzero(np.diff(score))  # skorun değiştiği yerler (eşit skorlar birlikte)
    ends = np.concatenate([distinct, [score.size - 1]])
    tps = np.cumsum(target)[ends]
    fps = 1.0 + ends - tps
    return fps, tps, score[ends]


def _trapezoid(x: Array, y: Array) -> float:
    return float(np.sum(np.diff(x) * (y[1:] + y[:-1]) / 2.0))


def roc_curve(
    y_true: ArrayLike, y_score: ArrayLike, pos_label: Any = None
) -> tuple[Array, Array, Array]:
    """ROC eğrisi: (yanlış pozitif oranı, doğru pozitif oranı, eşikler). İlk nokta (0, 0)'dır."""
    fps, tps, thresholds = _binary_counts(y_true, y_score, pos_label)
    if tps[-1] == 0 or fps[-1] == 0:
        raise ValueError(
            "ROC eğrisi için veride hem pozitif hem negatif örnek olmalı; yalnız tek sınıf var. "
            "Sınama kümesi çok küçükse katmanlı ayrım (stratify) kullanın."
        )
    fpr = np.concatenate([[0.0], fps / fps[-1]])
    tpr = np.concatenate([[0.0], tps / tps[-1]])
    return fpr, tpr, np.concatenate([[np.inf], thresholds])


def roc_auc_score(y_true: ArrayLike, y_score: ArrayLike, pos_label: Any = None) -> float:
    """ROC eğrisi altındaki alan; `y_score` (n, K) ise bire-karşı-hepsi makro ortalama."""
    score = np.asarray(y_score, dtype=np.float64)
    if score.ndim == 2 and score.shape[1] > 2:
        true = column_or_1d(y_true, name="y_true")
        classes = np.unique(true)
        if len(classes) != score.shape[1]:
            raise ValueError(
                f"y_score {score.shape[1]} sütunlu ama y_true içinde {len(classes)} sınıf var; "
                "sütunlar sıralı sınıflarla (`classes_`) aynı sırada ve sayıda olmalı."
            )
        return float(
            np.mean([roc_auc_score(true == c, score[:, i]) for i, c in enumerate(classes)])
        )
    fpr, tpr, _ = roc_curve(y_true, score, pos_label)
    return _trapezoid(fpr, tpr)


def precision_recall_curve(
    y_true: ArrayLike, y_score: ArrayLike, pos_label: Any = None
) -> tuple[Array, Array, Array]:
    """Kesinlik-duyarlılık eğrisi: (kesinlik, duyarlılık, eşikler); duyarlılık azalan sıradadır."""
    fps, tps, thresholds = _binary_counts(y_true, y_score, pos_label)
    if tps[-1] == 0:
        raise ValueError("Kesinlik-duyarlılık eğrisi için veride en az bir pozitif örnek olmalı.")
    precision = tps / (tps + fps)
    recall = tps / tps[-1]
    # scikit-learn ile aynı düzen: eşik arttıkça; son nokta (kesinlik=1, duyarlılık=0).
    return (
        np.concatenate([precision[::-1], [1.0]]),
        np.concatenate([recall[::-1], [0.0]]),
        thresholds[::-1],
    )


def average_precision_score(y_true: ArrayLike, y_score: ArrayLike, pos_label: Any = None) -> float:
    """PR-AUC'nin önerilen kestirimi: AP = Σ (Rₙ - Rₙ₋₁)·Pₙ (basamak toplamı; yamuk değil)."""
    precision, recall, _ = precision_recall_curve(y_true, y_score, pos_label)
    return float(-np.sum(np.diff(recall) * precision[:-1]))


pr_auc_score = average_precision_score
