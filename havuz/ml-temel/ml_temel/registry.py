"""Kayıt: model dosyasına yazılıp güvenle geri okunabilen bütün sınıfların TEK listesi.

`ml_temel/persistence.py` bir dosyayı yüklerken YALNIZ buradaki sınıfları kurar; listede olmayan
bir sınıf adı görürse durur (güvenlik). Kural testi (`tests/test_rules.py`) paketteki her
tahminleyicinin (BaseEstimator alt sınıfı) burada olmasını zorlar.

Genişletme: yeni bir sınıf yazdığınızda aşağıdaki listeye ekleyin (YENİ SINIF BURAYA).
"""

from __future__ import annotations

from ml_temel.klasik import (
    PCA,
    CalibratedClassifierCV,
    DecisionTreeClassifier,
    DecisionTreeRegressor,
    DummyClassifier,
    DummyRegressor,
    GaussianNB,
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
    IsolationForest,
    IsotonicRegression,
    KMeans,
    KNeighborsClassifier,
    KNeighborsRegressor,
    LinearRegression,
    LinearSVC,
    LogisticRegression,
    MultinomialNB,
    RandomForestClassifier,
    RandomForestRegressor,
    Ridge,
    SigmoidCalibration,
)
from ml_temel.klasik._binning import BinMapper
from ml_temel.klasik._tree_structure import Tree
from ml_temel.klasik.calibration import CalibratedPair
from ml_temel.onisleme import (
    ColumnTransformer,
    CountVectorizer,
    HashingVectorizer,
    MinMaxScaler,
    OneHotEncoder,
    OrdinalEncoder,
    Pipeline,
    SimpleImputer,
    StandardScaler,
    TfidfVectorizer,
)
from ml_temel.secim import (
    GridSearchCV,
    GroupKFold,
    KFold,
    PredefinedSplits,
    StratifiedKFold,
    TimeSeriesSplit,
)
from ml_temel.tablo.model import TabularModel
from ml_temel.zaman import ExponentialSmoothing, SeasonalNaive

_CLASSES: list[type] = [
    # klasik
    LinearRegression,
    Ridge,
    LogisticRegression,
    LinearSVC,
    GaussianNB,
    MultinomialNB,
    KNeighborsClassifier,
    KNeighborsRegressor,
    KMeans,
    PCA,
    DecisionTreeClassifier,
    DecisionTreeRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
    CalibratedClassifierCV,
    IsotonicRegression,
    SigmoidCalibration,
    IsolationForest,
    DummyClassifier,
    DummyRegressor,
    # klasik iç yapıları
    Tree,
    BinMapper,
    CalibratedPair,
    # onisleme
    StandardScaler,
    MinMaxScaler,
    SimpleImputer,
    OneHotEncoder,
    OrdinalEncoder,
    CountVectorizer,
    TfidfVectorizer,
    HashingVectorizer,
    Pipeline,
    ColumnTransformer,
    # secim
    KFold,
    StratifiedKFold,
    GroupKFold,
    TimeSeriesSplit,
    PredefinedSplits,
    GridSearchCV,
    # zaman
    SeasonalNaive,
    ExponentialSmoothing,
    # tablo
    TabularModel,
    # YENİ SINIF BURAYA
]

SAVEABLE: dict[str, type] = {cls.__name__: cls for cls in _CLASSES}

if len(SAVEABLE) != len(_CLASSES):  # aynı adlı iki sınıf dosyada karışır
    raise RuntimeError(
        "registry.py: iki kayıtlı sınıf aynı adı taşıyor; birini yeniden adlandırın."
    )
