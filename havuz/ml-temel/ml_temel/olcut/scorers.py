"""Puanlayıcı kaydı: ölçüt adından `(tahminleyici, X, y) -> float` fonksiyonuna.

Çapraz doğrulama ve ızgara araması ölçütleri adla ister (`scoring="roc_auc"`). Adlar ve
"büyük olan iyidir" kuralı scikit-learn ile aynıdır: hata ölçütleri `neg_` önekiyle eksiye
çevrilir ki her puanlayıcıda en büyük değer en iyi model olsun.

`needs`: ölçütün modelden ne istediği → "predict" (etiket/değer), "proba" (pozitif sınıf
olasılığı; ikili), "proba_all" (bütün sınıfların olasılıkları).
Genişletme: yeni ölçütü aşağıdaki sözlüğe ekleyin (YENİ ÖLÇÜT BURAYA).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import numpy as np

from ml_temel.olcut import classification, probability, ranking, regression


@dataclass(frozen=True)
class Scorer:
    """Bir ölçütün adı, fonksiyonu, yönü ve modelden ne istediği."""

    name: str
    function: Callable[..., float]
    sign: float = 1.0
    needs: str = "predict"

    def __call__(self, estimator: Any, X: Any, y: Any) -> float:
        if self.needs == "predict":
            return self.sign * float(self.function(y, estimator.predict(X)))
        probabilities = np.asarray(estimator.predict_proba(X))
        classes = getattr(estimator, "classes_", None)
        if self.needs == "proba":
            if probabilities.shape[1] != 2:
                raise ValueError(
                    f"'{self.name}' iki sınıflı hedef ister; {probabilities.shape[1]} sınıf "
                    "var. Çok sınıf için 'neg_log_loss', 'f1_macro' ya da 'accuracy' kullanın."
                )
            positive = None if classes is None else classes[1]
            return self.sign * float(self.function(y, probabilities[:, 1], pos_label=positive))
        return self.sign * float(self.function(y, probabilities, labels=classes))


def _f1_macro(y_true: Any, y_pred: Any) -> float:
    return classification.f1_score(y_true, y_pred, average="macro")


SCORERS: dict[str, Scorer] = {
    "accuracy": Scorer("accuracy", classification.accuracy_score),
    "balanced_accuracy": Scorer("balanced_accuracy", classification.balanced_accuracy_score),
    "f1_macro": Scorer("f1_macro", _f1_macro),
    "roc_auc": Scorer("roc_auc", ranking.roc_auc_score, needs="proba"),
    "average_precision": Scorer(
        "average_precision", ranking.average_precision_score, needs="proba"
    ),
    "neg_brier_score": Scorer("neg_brier_score", probability.brier_score_loss, -1.0, "proba"),
    "neg_log_loss": Scorer("neg_log_loss", probability.log_loss, -1.0, "proba_all"),
    "r2": Scorer("r2", regression.r2_score),
    "neg_root_mean_squared_error": Scorer(
        "neg_root_mean_squared_error", regression.root_mean_squared_error, -1.0
    ),
    "neg_mean_absolute_error": Scorer(
        "neg_mean_absolute_error", regression.mean_absolute_error, -1.0
    ),
    "neg_mean_squared_error": Scorer("neg_mean_squared_error", regression.mean_squared_error, -1.0),
    # YENİ ÖLÇÜT BURAYA
}


def get_scorer(
    scoring: str | Callable[[Any, Any, Any], float] | None, estimator: Any = None
) -> Any:
    """Ad, hazır fonksiyon ya da None'dan puanlayıcı üretir (None → modelin kendi `score`'u)."""
    if scoring is None:
        if estimator is None or not hasattr(estimator, "score"):
            raise ValueError("scoring verilmedi ve tahminleyicinin `score` yöntemi yok.")
        return lambda est, X, y: float(est.score(X, y))
    if callable(scoring):
        return scoring
    if scoring not in SCORERS:
        raise ValueError(
            f"Bilinmeyen ölçüt adı: '{scoring}'. Geçerli adlar: {', '.join(sorted(SCORERS))}."
        )
    return SCORERS[scoring]
