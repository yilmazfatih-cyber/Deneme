"""Sınıflandırma ölçütleri: doğruluk, karışıklık matrisi, kesinlik / duyarlılık / F1.

Fikir: her şey karışıklık matrisinden türer (satır = gerçek sınıf, sütun = tahmin).
Bir sınıf için: DP = köşegen, YP = sütun toplamı - DP, YN = satır toplamı - DP.

  kesinlik (precision) = DP / (DP + YP)   "pozitif dediklerimin kaçı doğru?"
  duyarlılık (recall)  = DP / (DP + YN)   "gerçek pozitiflerin kaçını yakaladım?"
  F1 = ikisinin harmonik ortalaması

Çok sınıfta ortalama: `macro` her sınıfa eşit ağırlık (azınlık sınıfı önemsiyorsanız),
`micro` her örneğe eşit ağırlık, `weighted` sınıf büyüklüğüyle ağırlıklı.
Hangi ölçüt ne zaman: docs/DEGERLENDIRME.md.
Genişletme: yeni ölçüt = (y_true, y_pred) alıp float döndüren fonksiyon; `scorers.py`'ye kaydedin.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from ml_temel.ortak.types import Array, ArrayLike, IntArray
from ml_temel.ortak.validation import check_consistent_length, column_or_1d


def _labels_and_codes(
    y_true: ArrayLike, y_pred: ArrayLike, labels: ArrayLike | None
) -> tuple[Array, IntArray, IntArray]:
    """Etiketleri sınıf listesine ve 0..K-1 numaralarına çevirir (listede olmayan etiket: -1)."""
    true = column_or_1d(y_true, name="y_true")
    pred = column_or_1d(y_pred, name="y_pred")
    check_consistent_length(true, pred)
    if true.shape[0] == 0:
        raise ValueError("Ölçüt hesaplamak için en az bir örnek gerekir.")
    try:
        classes = np.unique(np.concatenate([true, pred])) if labels is None else np.asarray(labels)
        order = np.argsort(classes, kind="stable")
        ordered = classes[order]
        codes = []
        for values in (true, pred):
            position = np.clip(np.searchsorted(ordered, values), 0, len(ordered) - 1)
            codes.append(np.where(ordered[position] == values, order[position], -1))
    except TypeError as error:
        raise ValueError(
            "y_true ve y_pred etiketleri karşılaştırılamıyor (biri metin, diğeri sayı olabilir). "
            "İkisinde de aynı türden etiket kullanın."
        ) from error
    return classes, codes[0].astype(np.int64), codes[1].astype(np.int64)


def accuracy_score(y_true: ArrayLike, y_pred: ArrayLike) -> float:
    """Doğru tahminlerin oranı. Dengesiz sınıflarda yanıltır (çoğunluğu bilmek yeter)."""
    true = column_or_1d(y_true, name="y_true")
    pred = column_or_1d(y_pred, name="y_pred")
    check_consistent_length(true, pred)
    return float(np.mean(true == pred))


def confusion_matrix(
    y_true: ArrayLike, y_pred: ArrayLike, labels: ArrayLike | None = None
) -> IntArray:
    """K×K sayım matrisi: [i, j] = gerçek sınıfı i olup j tahmin edilen örnek sayısı."""
    classes, true_codes, pred_codes = _labels_and_codes(y_true, y_pred, labels)
    k = len(classes)
    known = (true_codes >= 0) & (pred_codes >= 0)
    flat = np.bincount(true_codes[known] * k + pred_codes[known], minlength=k * k)
    return flat.reshape(k, k)


def _safe_divide(numerator: Array, denominator: Array, zero_division: float) -> Array:
    result = np.full(numerator.shape, float(zero_division))
    np.divide(numerator, denominator, out=result, where=denominator > 0)
    return result


def precision_recall_fscore_support(
    y_true: ArrayLike,
    y_pred: ArrayLike,
    *,
    average: str | None = None,
    pos_label: Any = 1,
    labels: ArrayLike | None = None,
    zero_division: float = 0.0,
) -> tuple[Any, Any, Any, Any]:
    """(kesinlik, duyarlılık, F1, destek). `average=None` → sınıf başına diziler."""
    classes, true_codes, pred_codes = _labels_and_codes(y_true, y_pred, labels)
    k = len(classes)
    hit = (true_codes == pred_codes) & (true_codes >= 0)
    tp = np.bincount(true_codes[hit], minlength=k).astype(np.float64)
    predicted = np.bincount(pred_codes[pred_codes >= 0], minlength=k).astype(np.float64)
    support = np.bincount(true_codes[true_codes >= 0], minlength=k).astype(np.float64)

    if average == "micro":
        tp, predicted, support = (np.array([v.sum()]) for v in (tp, predicted, support))
    precision = _safe_divide(tp, predicted, zero_division)
    recall = _safe_divide(tp, support, zero_division)
    f1 = _safe_divide(2.0 * precision * recall, precision + recall, zero_division)

    if average is None:
        return precision, recall, f1, support.astype(np.int64)
    if average == "binary":
        if pos_label not in classes.tolist():
            raise ValueError(
                f"pos_label={pos_label!r} veride yok (sınıflar: {classes.tolist()}). İkili "
                "ölçütlerde pozitif sınıfı `pos_label` ile belirtin ya da average='macro' kullanın."
            )
        if k > 2:
            raise ValueError(
                f"average='binary' yalnız iki sınıflı hedefte kullanılır; {k} sınıf var. "
                "average='macro' (ya da 'micro' / 'weighted') seçin."
            )
        at = classes.tolist().index(pos_label)
        return float(precision[at]), float(recall[at]), float(f1[at]), int(support[at])
    if average == "micro":
        return float(precision[0]), float(recall[0]), float(f1[0]), int(support[0])
    if average == "macro":
        weights = np.full(k, 1.0 / k)
    elif average == "weighted":
        weights = support / support.sum()
    else:
        raise ValueError(
            f"average='{average}' geçersiz. Seçenekler: binary, macro, micro, weighted, None."
        )
    return (
        float((precision * weights).sum()),
        float((recall * weights).sum()),
        float((f1 * weights).sum()),
        int(support.sum()),
    )


def precision_score(
    y_true: ArrayLike,
    y_pred: ArrayLike,
    *,
    average: str = "binary",
    pos_label: Any = 1,
    zero_division: float = 0.0,
) -> float:
    """Kesinlik: pozitif dediklerimizin doğru çıkma oranı."""
    return float(
        precision_recall_fscore_support(
            y_true, y_pred, average=average, pos_label=pos_label, zero_division=zero_division
        )[0]
    )


def recall_score(
    y_true: ArrayLike,
    y_pred: ArrayLike,
    *,
    average: str = "binary",
    pos_label: Any = 1,
    zero_division: float = 0.0,
) -> float:
    """Duyarlılık: gerçek pozitiflerin yakalanma oranı."""
    return float(
        precision_recall_fscore_support(
            y_true, y_pred, average=average, pos_label=pos_label, zero_division=zero_division
        )[1]
    )


def f1_score(
    y_true: ArrayLike,
    y_pred: ArrayLike,
    *,
    average: str = "binary",
    pos_label: Any = 1,
    zero_division: float = 0.0,
) -> float:
    """F1: kesinlik ile duyarlılığın harmonik ortalaması."""
    return float(
        precision_recall_fscore_support(
            y_true, y_pred, average=average, pos_label=pos_label, zero_division=zero_division
        )[2]
    )


def balanced_accuracy_score(y_true: ArrayLike, y_pred: ArrayLike) -> float:
    """Dengeli doğruluk: sınıf başına duyarlılıkların ortalaması (dengesiz veride kullanın)."""
    true = column_or_1d(y_true, name="y_true")
    _, recall, _, support = precision_recall_fscore_support(true, y_pred, labels=np.unique(true))
    return float(np.mean(recall[support > 0]))


def classification_report(y_true: ArrayLike, y_pred: ArrayLike, digits: int = 3) -> str:
    """Sınıf başına kesinlik / duyarlılık / F1 / destek tablosu (düz metin)."""
    classes, _, _ = _labels_and_codes(y_true, y_pred, None)
    precision, recall, f1, support = precision_recall_fscore_support(y_true, y_pred)
    width = max(12, *(len(str(label)) for label in classes.tolist()))
    header = f"{'sınıf':<{width}}  {'kesinlik':>9}  {'duyarlılık':>10}  {'F1':>7}  {'destek':>7}"
    lines = [header, "-" * len(header)]
    for label, p, r, f, s in zip(classes.tolist(), precision, recall, f1, support, strict=True):
        lines.append(
            f"{label!s:<{width}}  {p:>9.{digits}f}  {r:>10.{digits}f}  {f:>7.{digits}f}  {s:>7d}"
        )
    lines.append("-" * len(header))
    for name in ("macro", "weighted"):
        p, r, f, s = precision_recall_fscore_support(y_true, y_pred, average=name)
        label = "makro ort." if name == "macro" else "ağırlıklı ort."
        lines.append(
            f"{label:<{width}}  {p:>9.{digits}f}  {r:>10.{digits}f}  {f:>7.{digits}f}  {s:>7d}"
        )
    lines.append(f"{'doğruluk':<{width}}  {accuracy_score(y_true, y_pred):>9.{digits}f}")
    return "\n".join(lines)
