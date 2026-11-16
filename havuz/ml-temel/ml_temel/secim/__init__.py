"""secim — veri ayırma, çapraz doğrulama ve hiperparametre araması.

  split.py      train_test_split (katmanlı / gruplu / sıralı)
  splitters.py  KFold, StratifiedKFold, GroupKFold, TimeSeriesSplit
  validate.py   cross_validate, cross_val_score, cross_val_predict
  search.py     ParameterGrid, GridSearchCV

Sızıntı tuzakları ve hangi ayrımın ne zaman kullanılacağı: docs/DEGERLENDIRME.md.
Genişletme: yeni bölücü için `splitters.py` içindeki `KFold`'u kopyalayın.
"""

from ml_temel.secim.search import GridSearchCV, ParameterGrid
from ml_temel.secim.split import train_test_split
from ml_temel.secim.splitters import (
    GroupKFold,
    KFold,
    StratifiedKFold,
    TimeSeriesSplit,
    check_cv,
)
from ml_temel.secim.validate import cross_val_predict, cross_val_score, cross_validate

__all__ = [
    "GridSearchCV",
    "GroupKFold",
    "KFold",
    "ParameterGrid",
    "StratifiedKFold",
    "TimeSeriesSplit",
    "check_cv",
    "cross_val_predict",
    "cross_val_score",
    "cross_validate",
    "train_test_split",
]
