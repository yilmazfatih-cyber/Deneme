"""Önyükleme (bootstrap) güven aralığı: "bu ölçüm ne kadar güvenilir?" sorusunun yanıtı.

Fikir: sınama kümesi, olası verilerden yalnız bir örneklemdir; başka bir örneklemde ölçüt biraz
farklı çıkardı. Bunu taklit etmek için sınama satırlarını YERİNE KOYARAK yeniden örnekler,
ölçütü her seferinde yeniden hesaplarız. Sonuçların %2,5 ve %97,5'lik dilimleri %95 güven
aralığını verir (yüzdelik yöntemi). Aralık genişse sınama kümesi küçüktür; iki modelin
aralıkları büyük ölçüde örtüşüyorsa "biri daha iyi" demek için kanıt zayıftır.

İncelikler:
  - `stratify=True`: her sınıf kendi içinde örneklenir (azınlık sınıfı hiç çıkmayan örneklem olmaz).
  - `groups`: aynı gruba (müşteri, hasta) ait satırlar birlikte örneklenir; yoksa aralık
    olduğundan dar çıkar.
  - İki modeli karşılaştırmak için farkın aralığına bakın:
    `metric=lambda y, a, b: m(y, a) - m(y, b)`.
Genişletme: gerekmez; her ölçüt fonksiyonu `metric` olarak verilebilir.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from ml_temel.ortak.types import Array, ArrayLike, IntArray, Seed
from ml_temel.ortak.validation import check_consistent_length, make_rng


@dataclass(frozen=True)
class BootstrapResult:
    """`estimate`: tüm veride ölçüt; `low`–`high`: güven aralığı; `n_valid`: geçerli örneklem."""

    estimate: float
    low: float
    high: float
    confidence: float
    n_valid: int

    def __str__(self) -> str:
        percent = round(self.confidence * 100)
        return f"{self.estimate:.3f} (%{percent} GA: {self.low:.3f}–{self.high:.3f})"


def _resample_indices(
    rng: np.random.Generator, n: int, strata: IntArray | None, groups: IntArray | None
) -> IntArray:
    """Bir önyükleme örnekleminin satır indeksleri."""
    if groups is not None:
        unique, inverse = np.unique(groups, return_inverse=True)
        chosen = rng.integers(0, len(unique), size=len(unique))
        order = np.argsort(inverse, kind="stable")
        starts = np.searchsorted(inverse[order], np.arange(len(unique) + 1))
        return np.concatenate([order[starts[g] : starts[g + 1]] for g in chosen])
    if strata is not None:
        parts = []
        for value in np.unique(strata):
            members = np.flatnonzero(strata == value)
            parts.append(members[rng.integers(0, len(members), size=len(members))])
        return np.concatenate(parts)
    return rng.integers(0, n, size=n)


def bootstrap_ci(
    metric: Callable[..., float],
    y_true: ArrayLike,
    *predictions: ArrayLike,
    n_resamples: int = 1000,
    confidence: float = 0.95,
    random_state: Seed = 0,
    stratify: bool = False,
    groups: ArrayLike | None = None,
) -> BootstrapResult:
    """`metric(y_true, *predictions)` için yüzdelik önyükleme güven aralığı.

    Örnek: `bootstrap_ci(roc_auc_score, y_test, proba[:, 1], stratify=True)`.
    """
    true = np.asarray(y_true)
    arrays: list[Array] = [np.asarray(p) for p in predictions]
    if not arrays:
        raise ValueError("En az bir tahmin dizisi verin: bootstrap_ci(metric, y_true, y_pred).")
    check_consistent_length(true, *arrays, groups)
    if not 0.0 < confidence < 1.0:
        raise ValueError(f"confidence 0 ile 1 arasında olmalı (ör. 0.95); verilen: {confidence}")
    if stratify and groups is not None:
        raise ValueError(
            "stratify ve groups birlikte kullanılamaz; grup varsa yalnız `groups` verin."
        )
    rng = make_rng(random_state)
    strata = np.unique(true, return_inverse=True)[1] if stratify else None
    group_ids = None if groups is None else np.asarray(groups)

    estimate = float(metric(true, *arrays))
    values: list[float] = []
    for _ in range(n_resamples):
        rows = _resample_indices(rng, true.shape[0], strata, group_ids)
        try:
            value = float(metric(true[rows], *(a[rows] for a in arrays)))
        except ValueError:
            continue  # ör. örneklemde tek sınıf kaldı: bu örneklemde ölçüt tanımsız
        if np.isfinite(value):
            values.append(value)
    if len(values) < max(10, n_resamples // 2):
        raise ValueError(
            f"Önyükleme örneklemlerinin çoğunda ölçüt hesaplanamadı ({len(values)}/{n_resamples}). "
            "Sınama kümesi çok küçük ya da tek sınıflı olabilir; stratify=True deneyin."
        )
    tail = (1.0 - confidence) / 2.0
    low, high = np.quantile(values, [tail, 1.0 - tail])
    return BootstrapResult(estimate, float(low), float(high), confidence, len(values))
