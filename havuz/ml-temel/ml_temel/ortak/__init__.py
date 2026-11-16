"""ortak — bütün alt paketlerin paylaştığı küçük yardımcılar.

  types.py       Array, IntArray, Seed tip adları
  validation.py  girdi doğrulama (check_array, check_X_y, make_rng, take_rows…)
  base.py        BaseEstimator, clone ve karışım (mixin) sınıfları
  table.py       Table: adlandırılmış sütunlu küçük tablo
  turkish.py     lower_tr / upper_tr / lower_ascii / fold_ascii_tr / sort_key_tr
  messages.py    kullanıcıya görünen Türkçe metinlerin tek sözlüğü

Genişletme: iki alt paketin birden ihtiyaç duyduğu yardımcı buraya gelir; tek paketin
ihtiyacı o paketin içinde kalır.
"""

from ml_temel.ortak.base import (
    BaseEstimator,
    ClassifierMixin,
    RegressorMixin,
    TransformerMixin,
    clone,
    is_classifier,
)
from ml_temel.ortak.table import Table
from ml_temel.ortak.turkish import fold_ascii_tr, lower_ascii, lower_tr, sort_key_tr, upper_tr
from ml_temel.ortak.types import Array, ArrayLike, IntArray, Seed
from ml_temel.ortak.validation import (
    NotFittedError,
    check_array,
    check_consistent_length,
    check_is_fitted,
    check_n_features,
    check_regression_target,
    check_sample_weight,
    check_X_y,
    column_or_1d,
    encode_labels,
    make_rng,
    num_rows,
    take_rows,
)

__all__ = [
    "Array",
    "ArrayLike",
    "BaseEstimator",
    "ClassifierMixin",
    "IntArray",
    "NotFittedError",
    "RegressorMixin",
    "Seed",
    "Table",
    "TransformerMixin",
    "check_X_y",
    "check_array",
    "check_consistent_length",
    "check_is_fitted",
    "check_n_features",
    "check_regression_target",
    "check_sample_weight",
    "clone",
    "column_or_1d",
    "encode_labels",
    "fold_ascii_tr",
    "is_classifier",
    "lower_ascii",
    "lower_tr",
    "make_rng",
    "num_rows",
    "sort_key_tr",
    "take_rows",
    "upper_tr",
]
