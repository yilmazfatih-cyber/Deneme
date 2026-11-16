"""Tahminleyici tabanı: scikit-learn'ün `get_params / set_params / clone` sözleşmesinin sade hâli.

Sözleşme (scikit-learn ile aynı, küçük modeller bu arayüzü tanır):
  1. `__init__` yalnız hiperparametreleri alır ve AYNI ADLA `self`'e yazar; başka iş yapmaz.
  2. Öğrenilen her şey `fit` içinde, adı alt çizgiyle biten alanlara yazılır (`coef_`, `classes_`).
  3. `fit` her zaman `self` döndürür.
Bu üç kurala uyan her sınıf `clone`, `Pipeline`, `cross_validate` ve `GridSearchCV` ile çalışır.
Kurallar `tests/test_estimator_contract.py` ile sınanır.

Kim kullanır: `klasik`, `onisleme`, `secim` içindeki bütün sınıflar.
Genişletme: yeni tahminleyici için AGENTS.md → "Yeni tahminleyici ekle".
"""

from __future__ import annotations

import copy
import inspect
from typing import Any, Self

import numpy as np

from ml_temel.ortak.types import Array


def _param_names(cls: type) -> list[str]:
    """`__init__` imzasındaki hiperparametre adları."""
    signature = inspect.signature(cls.__init__)  # type: ignore[misc]
    names: list[str] = []
    for name, parameter in signature.parameters.items():
        if name == "self":
            continue
        if parameter.kind in (parameter.VAR_POSITIONAL, parameter.VAR_KEYWORD):
            raise TypeError(
                f"{cls.__name__}.__init__ *args/**kwargs kullanamaz; her hiperparametreyi adıyla "
                "yazın (get_params/clone bunlara güvenir)."
            )
        names.append(name)
    return names


class BaseEstimator:
    """Bütün tahminleyici ve dönüştürücülerin ortak atası."""

    def get_params(self, deep: bool = True) -> dict[str, Any]:
        """Hiperparametreler; `deep=True` ise iç tahminleyicilerinkiler `ad__parametre` olarak."""
        params: dict[str, Any] = {}
        for name in _param_names(type(self)):
            value = getattr(self, name)
            params[name] = value
            if deep and hasattr(value, "get_params") and not isinstance(value, type):
                for sub_name, sub_value in value.get_params(deep=True).items():
                    params[f"{name}__{sub_name}"] = sub_value
        return params

    def set_params(self, **params: Any) -> Self:
        """Hiperparametreleri değiştirir; iç tahminleyiciler için `ad__parametre` yazılır."""
        valid = _param_names(type(self))
        nested: dict[str, dict[str, Any]] = {}
        for key, value in params.items():
            name, _, rest = key.partition("__")
            if name not in valid:
                raise ValueError(
                    f"{type(self).__name__} için geçersiz parametre: '{name}'. "
                    f"Geçerli olanlar: {', '.join(valid)}."
                )
            if rest:
                nested.setdefault(name, {})[rest] = value
            else:
                setattr(self, name, value)
        for name, sub_params in nested.items():
            getattr(self, name).set_params(**sub_params)
        return self

    def __repr__(self) -> str:
        shown = ", ".join(f"{k}={v!r}" for k, v in self.get_params(deep=False).items())
        return f"{type(self).__name__}({shown})"


def clone(estimator: Any) -> Any:
    """Aynı hiperparametrelerle, EĞİTİLMEMİŞ yeni bir kopya (çapraz doğrulamanın temel taşı)."""
    if isinstance(estimator, (list, tuple)):
        return type(estimator)(clone(item) for item in estimator)
    if not hasattr(estimator, "get_params") or isinstance(estimator, type):
        return copy.deepcopy(estimator)
    params = {name: clone(value) for name, value in estimator.get_params(deep=False).items()}
    return type(estimator)(**params)


class ClassifierMixin:
    """Sınıflandırıcılar için varsayılan `score`: doğruluk."""

    _estimator_type = "classifier"

    def score(self, X: Any, y: Any) -> float:
        predicted = self.predict(X)  # type: ignore[attr-defined]
        return float(np.mean(np.asarray(predicted) == np.asarray(y)))


class RegressorMixin:
    """Regresyon modelleri için varsayılan `score`: R² (1 = kusursuz, 0 = ortalama kadar iyi)."""

    _estimator_type = "regressor"

    def score(self, X: Any, y: Any) -> float:
        target = np.asarray(y, dtype=np.float64)
        predicted: Array = np.asarray(self.predict(X), dtype=np.float64)  # type: ignore[attr-defined]
        residual = float(((target - predicted) ** 2).sum())
        total = float(((target - target.mean()) ** 2).sum())
        if total == 0.0:
            return 1.0 if residual == 0.0 else 0.0
        return 1.0 - residual / total


class TransformerMixin:
    """Dönüştürücüler için `fit_transform` = `fit` + `transform`."""

    def fit_transform(self, X: Any, y: Any = None) -> Any:
        return self.fit(X, y).transform(X)  # type: ignore[attr-defined]


def is_classifier(estimator: Any) -> bool:
    """Tahminleyici sınıflandırıcı mı? (`Pipeline` son adımına bakar.)"""
    return getattr(estimator, "_estimator_type", None) == "classifier"
