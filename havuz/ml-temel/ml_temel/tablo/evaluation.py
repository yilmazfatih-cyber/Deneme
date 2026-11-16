"""Değerlendirme: ölçütler, kat dışı (out-of-fold) tahminler, kalibrasyon seçimi, güven aralığı.

  task_metrics       görev için raporlanacak ölçütler (ilki ANA ölçüttür: model seçimi buna göre)
  cross_validate     her katta modelin temiz kopyasını eğitir; kat dışı tahminleri ve kat
                     puanlarını toplar (bir sınıf bir katın eğitiminde yoksa sütunu 0 olasılık alır)
  choose_calibration ikili sınıflamada kat dışı olasılıklarla "yok / sigmoid / izotonik" arasından
                     seçim; seçim de ayrı bir iç çapraz doğrulamayla yapılır (sınama verisine
                     bakılmaz)
  bootstrap_metrics  sınama ölçütleri için önyükleme güven aralıkları
Genişletme: yeni bir ölçüt için `METRICS` sözlüğüne (ad → (fonksiyon, büyük mü iyi)) ekleyin.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from ml_temel import olcut
from ml_temel.klasik.calibration import IsotonicRegression, SigmoidCalibration
from ml_temel.ortak.base import clone
from ml_temel.ortak.table import Table
from ml_temel.ortak.types import Array
from ml_temel.secim.splitters import KFold
from ml_temel.tablo.model import logit


@dataclass(frozen=True)
class TargetInfo:
    """Hedefle ilgili sabit bilgiler: görev, sınıflar, pozitif sınıf, eşik."""

    task: str
    classes: Array | None = None
    positive: Any = None
    threshold: float = 0.5

    @property
    def binary(self) -> bool:
        return self.classes is not None and len(self.classes) == 2


def _positive_column(info: TargetInfo) -> int:
    assert info.classes is not None
    return int(np.flatnonzero(info.classes == info.positive)[0])


def _binary_parts(y: Array, output: Array, info: TargetInfo) -> tuple[Array, Array, Array]:
    column = _positive_column(info)
    y01 = (y == info.positive).astype(int)
    p = output[:, column]
    return y01, p, (p >= info.threshold).astype(int)


def _labels(output: Array, info: TargetInfo) -> Array:
    assert info.classes is not None
    if info.binary:
        column = _positive_column(info)
        chosen = np.where(output[:, column] >= info.threshold, column, 1 - column)
        labels: Array = info.classes[chosen]
        return labels
    labels = info.classes[output.argmax(axis=1)]
    return labels


def _roc(y: Array, out: Array, info: TargetInfo) -> float:
    y01, p, _ = _binary_parts(y, out, info)
    return olcut.roc_auc_score(y01, p)


def _pr(y: Array, out: Array, info: TargetInfo) -> float:
    y01, p, _ = _binary_parts(y, out, info)
    return olcut.average_precision_score(y01, p)


def _log_loss(y: Array, out: Array, info: TargetInfo) -> float:
    if info.binary:
        y01, p, _ = _binary_parts(y, out, info)
        return olcut.log_loss(y01, p, labels=[0, 1])
    return olcut.log_loss(y, out, labels=info.classes)


def _brier(y: Array, out: Array, info: TargetInfo) -> float:
    y01, p, _ = _binary_parts(y, out, info)
    return olcut.brier_score_loss(y01, p, pos_label=1)


def _f1(y: Array, out: Array, info: TargetInfo) -> float:
    y01, _, predicted = _binary_parts(y, out, info)
    return olcut.f1_score(y01, predicted, pos_label=1)


METRICS: dict[str, tuple[Callable[[Array, Array, TargetInfo], float], bool]] = {
    "roc_auc": (_roc, True),
    "pr_auc": (_pr, True),
    "log_loss": (_log_loss, False),
    "brier": (_brier, False),
    "accuracy": (lambda y, out, info: olcut.accuracy_score(y, _labels(out, info)), True),
    "balanced_accuracy": (
        lambda y, out, info: olcut.balanced_accuracy_score(y, _labels(out, info)),
        True,
    ),
    "f1": (_f1, True),
    "f1_macro": (
        lambda y, out, info: olcut.f1_score(y, _labels(out, info), average="macro"),
        True,
    ),
    "rmse": (lambda y, out, info: olcut.root_mean_squared_error(y, out), False),
    "mae": (lambda y, out, info: olcut.mean_absolute_error(y, out), False),
    "r2": (lambda y, out, info: olcut.r2_score(y, out), True),
    # YENİ ÖLÇÜT BURAYA
}


def task_metrics(info: TargetInfo) -> list[str]:
    """Raporlanacak ölçütler; ilki ana ölçüttür."""
    if info.task == "regresyon":
        return ["rmse", "mae", "r2"]
    if info.binary:
        return ["roc_auc", "pr_auc", "log_loss", "brier", "balanced_accuracy", "f1"]
    return ["log_loss", "accuracy", "balanced_accuracy", "f1_macro"]


def higher_is_better(metric: str) -> bool:
    return METRICS[metric][1]


def score(metric: str, y: Array, output: Array, info: TargetInfo) -> float:
    """Ölçütü hesaplar; tanımsızsa (ör. sınamada tek sınıf) NaN döndürür."""
    try:
        return float(METRICS[metric][0](y, output, info))
    except ValueError:
        return float("nan")


def model_output(model: Any, data: Any, info: TargetInfo) -> Array:
    """Regresyonda tahminler (n,); sınıflandırmada `info.classes` sırasında olasılıklar (n, K)."""
    if info.task == "regresyon":
        return np.asarray(model.predict(data), dtype=np.float64)
    assert info.classes is not None
    probabilities = np.asarray(model.predict_proba(data), dtype=np.float64)
    aligned = np.zeros((probabilities.shape[0], len(info.classes)))
    aligned[:, np.searchsorted(info.classes, model.classes_)] = probabilities
    return aligned


@dataclass
class CandidateResult:
    """Bir adayın çapraz doğrulama sonucu."""

    name: str
    fold_scores: dict[str, list[float]]
    oof: Array
    oof_mask: Array
    seconds: float
    fold_sizes: list[int] = field(default_factory=list)

    def mean(self, metric: str) -> float:
        values = np.asarray(self.fold_scores[metric], dtype=float)
        return float(np.nanmean(values)) if np.isfinite(values).any() else float("nan")

    def std(self, metric: str) -> float:
        values = np.asarray(self.fold_scores[metric], dtype=float)
        return float(np.nanstd(values)) if np.isfinite(values).any() else float("nan")


def cross_validate(
    name: str,
    estimator: Any,
    data: Table,
    y: Array,
    folds: list[tuple[Array, Array]],
    info: TargetInfo,
) -> CandidateResult:
    """Önceden hesaplanmış katlarla çapraz doğrulama; kat dışı tahminleri saklar."""
    width = 1 if info.classes is None else len(info.classes)
    oof = np.full((len(y), width), np.nan)
    mask = np.zeros(len(y), dtype=bool)
    metrics = task_metrics(info)
    scores: dict[str, list[float]] = {metric: [] for metric in metrics}
    started = time.perf_counter()
    for train, test in folds:
        model = clone(estimator).fit(data.take_rows(train), y[train])
        output = model_output(model, data.take_rows(test), info)
        oof[test] = output.reshape(len(test), width)
        mask[test] = True
        for metric in metrics:
            scores[metric].append(score(metric, y[test], output, info))
    return CandidateResult(
        name, scores, oof, mask, time.perf_counter() - started, [len(test) for _, test in folds]
    )


def _calibrated_oof_loss(method: str, scores: Array, y01: Array, seed: int) -> float:
    """Kalibratörü iç çapraz doğrulamayla değerlendirir: kat dışı log-kayıp."""
    predicted = np.empty_like(scores)
    for train, test in KFold(5, shuffle=True, random_state=seed).split(scores):
        mapper: Any = SigmoidCalibration() if method == "sigmoid" else IsotonicRegression()
        predicted[test] = mapper.fit(scores[train], y01[train]).predict(scores[test])
    return olcut.log_loss(y01, np.clip(predicted, 1e-6, 1 - 1e-6), labels=[0, 1])


def choose_calibration(
    oof_positive: Array, y01: Array, seed: int
) -> tuple[str, dict[str, float], Any]:
    """(yöntem, aday log-kayıpları, eşleme). Yöntem: 'yok', 'sigmoid' ya da 'isotonic'.

    Eşleme, bütün kat dışı skorlarla eğitilir; 'yok' seçildiyse None'dır.
    """
    scores = logit(oof_positive)
    losses = {"yok": olcut.log_loss(y01, np.clip(oof_positive, 1e-6, 1 - 1e-6), labels=[0, 1])}
    if y01.size >= 50 and 0 < y01.sum() < y01.size:
        losses["sigmoid"] = _calibrated_oof_loss("sigmoid", scores, y01, seed)
        if y01.size >= 1000:  # izotonik az veride aşırı öğrenir
            losses["isotonic"] = _calibrated_oof_loss("isotonic", scores, y01, seed)
    method = min(losses, key=lambda name: (losses[name], name != "yok"))
    if losses[method] > 0.998 * losses["yok"]:  # %0,2'den az iyileşme: dokunma
        method = "yok"
    if method == "yok":
        return method, losses, None
    mapper: Any = SigmoidCalibration() if method == "sigmoid" else IsotonicRegression()
    return method, losses, mapper.fit(scores, y01)


def best_f1_threshold(y01: Array, positive: Array) -> float:
    """Kat dışı olasılıklarda F1'i en büyükleyen eşik (bilgi amaçlı raporlanır)."""
    candidates = np.unique(np.round(positive, 3))
    if candidates.size > 200:
        candidates = np.quantile(positive, np.linspace(0.01, 0.99, 199))
    best, best_f1 = 0.5, -1.0
    for threshold in candidates.tolist():
        value = olcut.f1_score(y01, (positive >= threshold).astype(int), pos_label=1)
        if value > best_f1:
            best, best_f1 = float(threshold), value
    return best


def bootstrap_metrics(
    y: Array,
    output: Array,
    info: TargetInfo,
    n_resamples: int,
    seed: int,
    groups: Array | None = None,
) -> dict[str, olcut.BootstrapResult]:
    """Her ölçüt için %95 önyükleme güven aralığı (sınıflandırmada katmanlı örnekleme)."""
    results: dict[str, olcut.BootstrapResult] = {}
    stratify = info.task == "siniflandirma" and groups is None
    for metric in task_metrics(info):

        def compute(true: Array, out: Array, metric: str = metric) -> float:
            value = score(metric, true, out, info)
            if not np.isfinite(value):
                raise ValueError("tanımsız")
            return value

        try:
            results[metric] = olcut.bootstrap_ci(
                compute,
                y,
                output,
                n_resamples=n_resamples,
                random_state=seed,
                stratify=stratify,
                groups=groups,
            )
        except ValueError:
            continue
    return results
