"""Izgara araması: hiperparametre seçimi (`ParameterGrid`, `GridSearchCV`).

Fikir: aday hiperparametre değerlerinin bütün birleşimlerini çapraz doğrulamayla puanlar,
ortalaması en iyi olanı seçer ve (istenirse) bütün veriyle yeniden eğitir.

SIZINTI NOTU: `best_score_` iyimserdir — en iyi birleşim, bu katlara bakılarak seçildi.
Dürüst başarı ölçümü için ya ayrı bir sınama kümesi tutun ya da `GridSearchCV` nesnesinin
kendisini `cross_validate`'e verin (iç içe çapraz doğrulama). Ayrıntı: docs/DEGERLENDIRME.md.

Genişletme: rastgele arama gerekirse `ParameterGrid` yerine rastgele örnekleyen bir üreteç yazıp
`GridSearchCV.fit` içindeki döngüyü örnek alın.
"""

from __future__ import annotations

import itertools
from collections.abc import Callable, Iterator, Mapping, Sequence
from typing import Any, Self

import numpy as np

from ml_temel.ortak.base import BaseEstimator, clone
from ml_temel.ortak.validation import check_is_fitted
from ml_temel.secim.validate import cross_validate

Grid = Mapping[str, Sequence[Any]]


class ParameterGrid:
    """`{"C": [0.1, 1], "penalty": ["l2"]}` → her birleşim için bir sözlük. Liste de verilebilir."""

    def __init__(self, param_grid: Grid | Sequence[Grid]) -> None:
        grids = [param_grid] if isinstance(param_grid, Mapping) else list(param_grid)
        for grid in grids:
            for name, values in grid.items():
                if isinstance(values, str) or not isinstance(values, Sequence) or not len(values):
                    raise ValueError(
                        f"param_grid['{name}'] boş olmayan bir liste olmalı (ör. [0.1, 1, 10])."
                    )
        self.grids = grids

    def __iter__(self) -> Iterator[dict[str, Any]]:
        for grid in self.grids:
            names = sorted(grid)
            for values in itertools.product(*(grid[name] for name in names)):
                yield dict(zip(names, values, strict=True))

    def __len__(self) -> int:
        return sum(int(np.prod([len(v) for v in grid.values()])) for grid in self.grids)


class GridSearchCV(BaseEstimator):
    """Bütün birleşimleri çapraz doğrulayıp en iyisini seçen (ve yeniden eğiten) tahminleyici."""

    def __init__(
        self,
        estimator: Any,
        param_grid: Grid | Sequence[Grid],
        scoring: str | Callable[[Any, Any, Any], float] | None = None,
        cv: Any = 5,
        refit: bool = True,
    ) -> None:
        self.estimator = estimator
        self.param_grid = param_grid
        self.scoring = scoring
        self.cv = cv
        self.refit = refit

    @property
    def _estimator_type(self) -> Any:
        return getattr(self.estimator, "_estimator_type", None)

    def fit(self, X: Any, y: Any = None, groups: Any = None) -> Self:
        candidates = list(ParameterGrid(self.param_grid))
        means, stds = [], []
        for params in candidates:
            model = clone(self.estimator).set_params(**params)
            scores = cross_validate(model, X, y, groups=groups, scoring=self.scoring, cv=self.cv)[
                "test_score"
            ]
            means.append(float(np.mean(scores)))
            stds.append(float(np.std(scores)))
        mean_scores = np.asarray(means)
        if np.isnan(mean_scores).all():
            raise ValueError("Hiçbir birleşim puanlanamadı (bütün puanlar NaN).")
        order = np.argsort(-np.nan_to_num(mean_scores, nan=-np.inf), kind="stable")
        ranks = np.empty(len(candidates), dtype=np.int64)
        ranks[order] = np.arange(1, len(candidates) + 1)
        self.cv_results_ = {
            "params": candidates,
            "mean_test_score": mean_scores,
            "std_test_score": np.asarray(stds),
            "rank_test_score": ranks,
        }
        self.best_index_ = int(order[0])
        self.best_params_ = candidates[self.best_index_]
        self.best_score_ = float(mean_scores[self.best_index_])
        if self.refit:
            self.best_estimator_ = clone(self.estimator).set_params(**self.best_params_)
            self.best_estimator_.fit(X, y)
            if hasattr(self.best_estimator_, "classes_"):
                self.classes_ = self.best_estimator_.classes_
        return self

    def _best(self) -> Any:
        check_is_fitted(self, "best_params_")
        if not self.refit:
            raise ValueError("refit=False ile kuruldu; tahmin için refit=True kullanın.")
        return self.best_estimator_

    # Yöntemler en iyi modelde varsa görünür (`hasattr` doğru yanıt versin diye özellik olarak).
    @property
    def predict(self) -> Callable[[Any], Any]:
        method: Callable[[Any], Any] = self._best().predict
        return method

    @property
    def predict_proba(self) -> Callable[[Any], Any]:
        method: Callable[[Any], Any] = self._best().predict_proba
        return method

    @property
    def decision_function(self) -> Callable[[Any], Any]:
        method: Callable[[Any], Any] = self._best().decision_function
        return method

    @property
    def transform(self) -> Callable[[Any], Any]:
        method: Callable[[Any], Any] = self._best().transform
        return method

    def score(self, X: Any, y: Any) -> float:
        from ml_temel.olcut.scorers import get_scorer

        return float(get_scorer(self.scoring, self._best())(self._best(), X, y))
