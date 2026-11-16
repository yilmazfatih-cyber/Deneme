"""onisleme — veriyi modele hazırlayan dönüştürücüler (arayüz scikit-learn `preprocessing` gibi).

  scalers.py      StandardScaler, MinMaxScaler
  impute.py       SimpleImputer
  encoders.py     OneHotEncoder, OrdinalEncoder
  text.py         Türkçe'ye duyarlı belirteçleme, TURKISH_STOP_WORDS
  vectorizers.py  CountVectorizer, TfidfVectorizer
  hashing.py      HashingVectorizer
  pipeline.py     Pipeline, make_pipeline
  column.py       ColumnTransformer

Her dönüştürücü `fit` (eğitim verisinden öğren) ve `transform` (uygula) yöntemlerine sahiptir.
Sızıntıyı önlemek için hepsini `Pipeline` içinde kullanın (docs/DEGERLENDIRME.md).
Genişletme: AGENTS.md → "Yeni dönüştürücü ekle".
"""

from ml_temel.onisleme.column import ColumnTransformer
from ml_temel.onisleme.encoders import OneHotEncoder, OrdinalEncoder
from ml_temel.onisleme.hashing import HashingVectorizer
from ml_temel.onisleme.impute import SimpleImputer
from ml_temel.onisleme.pipeline import Pipeline, make_pipeline
from ml_temel.onisleme.scalers import MinMaxScaler, StandardScaler
from ml_temel.onisleme.text import TURKISH_STOP_WORDS, tokenize
from ml_temel.onisleme.vectorizers import CountVectorizer, TfidfVectorizer

__all__ = [
    "TURKISH_STOP_WORDS",
    "ColumnTransformer",
    "CountVectorizer",
    "HashingVectorizer",
    "MinMaxScaler",
    "OneHotEncoder",
    "OrdinalEncoder",
    "Pipeline",
    "SimpleImputer",
    "StandardScaler",
    "TfidfVectorizer",
    "make_pipeline",
    "tokenize",
]
