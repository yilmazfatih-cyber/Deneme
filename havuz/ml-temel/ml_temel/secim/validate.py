"""Çapraz doğrulama: `cross_validate`, `cross_val_score`, `cross_val_predict`.

Fikir: tek bir eğitim/sınama ayrımı şansa bağlıdır. Veriyi K parçaya bölüp her parçayı bir kez
sınama yaparsak K ayrı ölçüm elde ederiz; ortalaması daha güvenilir, yayılımı belirsizliği gösterir.

SIZINTI KURALI: her katta tahminleyicinin EĞİTİLMEMİŞ bir kopyası (`clone`) yalnız o katın eğitim
satırlarıyla `fit` edilir. Ölçekleme, eksik doldurma, TF-IDF gibi ön işlemeler de veriden öğrenir;
bu yüzden onları modelle birlikte bir `Pipeline` içine koyup buraya `Pipeline`'ı verin. Ön işlemeyi
bütün veriyle bir kez yapıp sonra çapraz doğrulamak, sınama satırlarının bilgisini eğitime sızdırır.

Genişletme: yeni bir ölçüt için `olcut/scorers.py`; yeni bir ayrım için `secim/splitters.py`.
"""

from __future__ import annotations

import time
from collections.abc import Callable, Sequence
from typing import Any

import numpy as np

from ml_temel.olcut.scorers import get_scorer
from ml_temel.ortak.base import clone, is_classifier
from ml_temel.ortak.types import Array
from ml_temel.ortak.validation import check_consistent_length, num_rows, take_rows
from ml_temel.secim.splitters import check_cv

Scoring = str | Callable[[Any, Any, Any], float] | Sequence[str] | None


def _scorers(scoring: Scoring, estimator: Any) -> dict[str, Any]:
    """Ölçüt tanımını ad → puanlayıcı sözlüğüne çevirir (tek ölçütte ad 'score'dur)."""
    if scoring is None or isinstance(scoring, str) or callable(scoring):
        return {"score": get_scorer(scoring, estimator)}
    return {name: get_scorer(name, estimator) for name in scoring}


def cross_validate(
    estimator: Any,
    X: Any,
    y: Any = None,
    *,
    groups: Any = None,
    scoring: Scoring = None,
    cv: Any = 5,
    return_train_score: bool = False,
    return_estimator: bool = False,
) -> dict[str, Any]:
    """Her kat için ölçütleri hesaplar: `{"test_score": [...], "fit_time": [...], ...}`.

    Birden çok ölçüt istenirse (`scoring=["roc_auc", "neg_log_loss"]`) anahtarlar `test_roc_auc`
    biçimindedir. `cv` tam sayı ya da bir bölücüdür; gruplu veride `GroupKFold` + `groups` verin.
    """
    check_consistent_length(X, y, groups)
    splitter = check_cv(cv, y, classifier=is_classifier(estimator))
    scorers = _scorers(scoring, estimator)
    results: dict[str, list[Any]] = {"fit_time": [], "score_time": []}
    for name in scorers:
        results[f"test_{name}"] = []
        if return_train_score:
            results[f"train_{name}"] = []
    if return_estimator:
        results["estimator"] = []

    for train, test in splitter.split(X, y, groups):
        model = clone(estimator)
        X_train, X_test = take_rows(X, train), take_rows(X, test)
        y_train = None if y is None else take_rows(y, train)
        y_test = None if y is None else take_rows(y, test)
        started = time.perf_counter()
        model.fit(X_train, y_train)
        fitted = time.perf_counter()
        for name, scorer in scorers.items():
            results[f"test_{name}"].append(scorer(model, X_test, y_test))
            if return_train_score:
                results[f"train_{name}"].append(scorer(model, X_train, y_train))
        results["fit_time"].append(fitted - started)
        results["score_time"].append(time.perf_counter() - fitted)
        if return_estimator:
            results["estimator"].append(model)
    return {
        key: values if key == "estimator" else np.asarray(values) for key, values in results.items()
    }


def cross_val_score(
    estimator: Any,
    X: Any,
    y: Any = None,
    *,
    groups: Any = None,
    scoring: str | Callable[[Any, Any, Any], float] | None = None,
    cv: Any = 5,
) -> Array:
    """Her katın sınama puanı (tek ölçüt)."""
    scores: Array = cross_validate(estimator, X, y, groups=groups, scoring=scoring, cv=cv)[
        "test_score"
    ]
    return scores


def cross_val_predict(
    estimator: Any,
    X: Any,
    y: Any = None,
    *,
    groups: Any = None,
    cv: Any = 5,
    method: str = "predict",
) -> Array:
    """Kat-dışı tahminler: her satır, o satırı eğitimde GÖRMEMİŞ modelin tahminini alır.

    Kalibrasyon ve yığma (stacking) için kullanılır. `method="predict_proba"` olasılık döndürür.
    Her satırın tam bir kez sınamada olduğu bölücüler gerekir (TimeSeriesSplit uygun değildir).
    """
    check_consistent_length(X, y, groups)
    splitter = check_cv(cv, y, classifier=is_classifier(estimator))
    n_samples = num_rows(X)
    seen = np.zeros(n_samples, dtype=np.int64)
    output: Array | None = None
    all_classes = None if y is None or method == "predict" else np.unique(np.asarray(y))
    for train, test in splitter.split(X, y, groups):
        model = clone(estimator)
        model.fit(take_rows(X, train), None if y is None else take_rows(y, train))
        predicted = np.asarray(getattr(model, method)(take_rows(X, test)))
        if all_classes is not None and predicted.ndim == 2:
            # Katın eğitiminde hiç görülmemiş sınıfın sütunu eksik kalır; 0 olasılıkla doldur.
            aligned = np.zeros((predicted.shape[0], len(all_classes)))
            aligned[:, np.searchsorted(all_classes, model.classes_)] = predicted
            predicted = aligned
        if output is None:
            output = np.empty((n_samples, *predicted.shape[1:]), dtype=predicted.dtype)
        output[test] = predicted
        seen[test] += 1
    if output is None or not (seen == 1).all():
        raise ValueError(
            "cross_val_predict, her satırın tam bir kez sınamada olduğu bir bölücü ister "
            "(KFold, StratifiedKFold, GroupKFold). TimeSeriesSplit bunu sağlamaz."
        )
    return output
