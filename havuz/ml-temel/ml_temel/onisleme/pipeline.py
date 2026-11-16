"""Pipeline: ön işleme adımlarını ve modeli tek bir tahminleyici gibi zincirler.

Fikir: `Pipeline([("olcek", StandardScaler()), ("model", LogisticRegression())])` nesnesinin
`fit`'i sırayla her dönüştürücüyü EĞİTİM verisiyle uydurup uygular, sonra modeli eğitir;
`predict`'i aynı dönüşümleri (yeniden uydurmadan) uygulayıp tahmin eder.

Neden önemli: çapraz doğrulama her katta Pipeline'ın temiz bir kopyasını yalnız o katın eğitim
satırlarıyla uydurur. Böylece ölçekleme/doldurma/TF-IDF gibi adımlar sınama satırlarını hiç
görmez — sızıntıya karşı en sağlam alışkanlık budur.

Parametre adları `adım__parametre` biçimindedir (`GridSearchCV` için): `model__C`.
Genişletme: yeni bir birleşik tahminleyici için `NamedSteps` karışımını kullanın.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Self

from ml_temel.ortak.base import BaseEstimator
from ml_temel.ortak.turkish import lower_ascii
from ml_temel.ortak.validation import check_is_fitted

Step = tuple[str, Any]


class NamedSteps(BaseEstimator):
    """(ad, tahminleyici) listesi tutan sınıflar için `ad__parametre` desteği."""

    _steps_attribute = "steps"

    def _named(self) -> list[Step]:
        return [(item[0], item[1]) for item in getattr(self, self._steps_attribute)]

    def get_params(self, deep: bool = True) -> dict[str, Any]:
        params = super().get_params(deep=False)
        if not deep:
            return params
        for name, estimator in self._named():
            params[name] = estimator
            if hasattr(estimator, "get_params"):
                for key, value in estimator.get_params(deep=True).items():
                    params[f"{name}__{key}"] = value
        return params

    def set_params(self, **params: Any) -> Self:
        own = super().get_params(deep=False)
        named = dict(self._named())
        for key, value in params.items():
            name, _, rest = key.partition("__")
            if key in own:
                setattr(self, key, value)
            elif name in named and rest:
                named[name].set_params(**{rest: value})
            elif name in named:
                rebuilt = [  # adımın tamamını yeni tahminleyiciyle değiştir
                    (item[0], value, *item[2:]) if item[0] == name else item
                    for item in getattr(self, self._steps_attribute)
                ]
                setattr(self, self._steps_attribute, rebuilt)
            else:
                raise ValueError(
                    f"{type(self).__name__} için geçersiz parametre: '{key}'. Adım adları: "
                    f"{', '.join(named)}. Adım parametresi için `adım__parametre` yazın."
                )
        return self

    def _check_names(self) -> None:
        names = [name for name, _ in self._named()]
        if len(set(names)) != len(names):
            raise ValueError(f"Adım adları benzersiz olmalı; verilen: {names}")
        for name in names:
            if "__" in name:
                raise ValueError(f"Adım adı çift alt çizgi içeremez: '{name}'")


class Pipeline(NamedSteps):
    """Dönüştürücüler + (isteğe bağlı) son adımda model."""

    def __init__(self, steps: Sequence[Step]) -> None:
        self.steps = steps

    @property
    def named_steps(self) -> dict[str, Any]:
        return dict(self._named())

    @property
    def _final(self) -> Any:
        return self.steps[-1][1]

    @property
    def _estimator_type(self) -> Any:
        return getattr(self._final, "_estimator_type", None)

    @property
    def classes_(self) -> Any:
        return self._final.classes_

    def _fit_transformers(self, X: Any, y: Any) -> Any:
        if not self.steps:
            raise ValueError("Pipeline en az bir adım ister: [(ad, tahminleyici), ...].")
        self._check_names()
        for name, transformer in self.steps[:-1]:
            if not hasattr(transformer, "transform"):
                raise TypeError(
                    f"'{name}' adımı bir dönüştürücü değil (transform yöntemi yok). Model yalnız "
                    "son adım olabilir."
                )
            X = transformer.fit_transform(X, y)
        return X

    def fit(self, X: Any, y: Any = None) -> Self:
        transformed = self._fit_transformers(X, y)
        self._final.fit(transformed, y)
        self.fitted_ = True
        return self

    def _transform_before_final(self, X: Any) -> Any:
        check_is_fitted(self, "fitted_")
        for _, transformer in self.steps[:-1]:
            X = transformer.transform(X)
        return X

    def predict(self, X: Any) -> Any:
        return self._final.predict(self._transform_before_final(X))

    def predict_proba(self, X: Any) -> Any:
        return self._final.predict_proba(self._transform_before_final(X))

    def decision_function(self, X: Any) -> Any:
        return self._final.decision_function(self._transform_before_final(X))

    def transform(self, X: Any) -> Any:
        return self._final.transform(self._transform_before_final(X))

    def fit_transform(self, X: Any, y: Any = None) -> Any:
        transformed = self._fit_transformers(X, y)
        self.fitted_ = True
        return self._final.fit_transform(transformed, y)

    def score(self, X: Any, y: Any) -> float:
        return float(self._final.score(self._transform_before_final(X), y))


def make_pipeline(*steps: Any) -> Pipeline:
    """Adları sınıf adından üreterek Pipeline kurar: make_pipeline(StandardScaler(), Ridge())."""
    names: list[str] = []
    for step in steps:
        base = lower_ascii(type(step).__name__)
        name, suffix = base, 2
        while name in names:
            name, suffix = f"{base}-{suffix}", suffix + 1
        names.append(name)
    return Pipeline(list(zip(names, steps, strict=True)))
