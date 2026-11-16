"""klasik — scikit-learn arayüzlü klasik makine öğrenmesi modelleri (yalnız numpy).

  linear.py        LinearRegression, Ridge
  logistic.py      LogisticRegression (ikili + çok sınıflı, L2)
  svm.py           LinearSVC
  naive_bayes.py   GaussianNB, MultinomialNB
  neighbors.py     KNeighborsClassifier, KNeighborsRegressor
  cluster.py       KMeans (k-means++)
  decomposition.py PCA
  tree.py          DecisionTreeClassifier, DecisionTreeRegressor   (motor: _cart.py)
  forest.py        RandomForestClassifier, RandomForestRegressor
  boosting.py      HistGradientBoostingRegressor / Classifier      (motor: _hist_grower.py)
  calibration.py   CalibratedClassifierCV, IsotonicRegression, SigmoidCalibration
  isolation.py     IsolationForest
  dummy.py         DummyClassifier, DummyRegressor (taban çizgisi)

Ortak sözleşme (`fit` / `predict` / `predict_proba` / `transform`, `clone`):
`ml_temel/ortak/base.py`.
Genişletme: AGENTS.md → "Yeni tahminleyici ekle" (sınıfı yazın, buraya ve `ml_temel/registry.py`'ye
ekleyin, scikit-learn karşılaştırma testini yazın).
"""

from ml_temel.klasik.boosting import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from ml_temel.klasik.calibration import (
    CalibratedClassifierCV,
    IsotonicRegression,
    SigmoidCalibration,
)
from ml_temel.klasik.cluster import KMeans
from ml_temel.klasik.decomposition import PCA
from ml_temel.klasik.dummy import DummyClassifier, DummyRegressor
from ml_temel.klasik.forest import RandomForestClassifier, RandomForestRegressor
from ml_temel.klasik.isolation import IsolationForest
from ml_temel.klasik.linear import LinearRegression, Ridge
from ml_temel.klasik.logistic import LogisticRegression
from ml_temel.klasik.naive_bayes import GaussianNB, MultinomialNB
from ml_temel.klasik.neighbors import KNeighborsClassifier, KNeighborsRegressor
from ml_temel.klasik.svm import LinearSVC
from ml_temel.klasik.tree import DecisionTreeClassifier, DecisionTreeRegressor

__all__ = [
    "PCA",
    "CalibratedClassifierCV",
    "DecisionTreeClassifier",
    "DecisionTreeRegressor",
    "DummyClassifier",
    "DummyRegressor",
    "GaussianNB",
    "HistGradientBoostingClassifier",
    "HistGradientBoostingRegressor",
    "IsolationForest",
    "IsotonicRegression",
    "KMeans",
    "KNeighborsClassifier",
    "KNeighborsRegressor",
    "LinearRegression",
    "LinearSVC",
    "LogisticRegression",
    "MultinomialNB",
    "RandomForestClassifier",
    "RandomForestRegressor",
    "Ridge",
    "SigmoidCalibration",
]
