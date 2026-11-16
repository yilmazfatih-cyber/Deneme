"""Örnek (c): müşteri kaybı tahmini — gradyan artırma + doğru değerlendirme + kalibrasyon.

1. Tohumlu sentetik müşteri tablosu; sınama kümesi en başta katmanlı olarak ayrılır.
2. Ön işleme + model TEK bir Pipeline: çapraz doğrulamada her katta yeniden uydurulur.
3. SIZINTI GÖSTERİMİ: müşteri numarasını "hedef ortalaması" ile kodlarsak ve bunu bütün veride
   yaparsak çapraz doğrulama neredeyse kusursuz görünür; kat içinde yaparsak gerçek (≈0,5) çıkar.
4. Kalibrasyon: izotonik düzeltme kat dışı tahminlerle öğrenilir; Brier ve ECE karşılaştırılır.
5. Sınama sonucu önyükleme güven aralığıyla raporlanır.
Çalıştırma: python ornekler/03_musteri_kaybi.py   (yaklaşık 10-30 saniye)
"""

from __future__ import annotations

import _setup_path  # noqa: F401
import numpy as np

from ml_temel import olcut
from ml_temel.klasik import CalibratedClassifierCV, HistGradientBoostingClassifier
from ml_temel.onisleme import ColumnTransformer, OrdinalEncoder, Pipeline
from ml_temel.ortak import Table
from ml_temel.secim import StratifiedKFold, cross_val_score, train_test_split
from ml_temel.veri import make_churn_table

NUMERIC = [
    "aylik_ucret",
    "abonelik_ay",
    "kullanim_gb",
    "destek_cagrisi",
    "gecikmeli_odeme",
    "memnuniyet",
]
CATEGORICAL = ["sehir", "paket", "sozlesme", "son_sikayet"]


def build_model() -> Pipeline:
    prepare = ColumnTransformer(
        [("sayisal", "passthrough", NUMERIC), ("kategori", OrdinalEncoder(), CATEGORICAL)]
    )
    booster = HistGradientBoostingClassifier(
        max_iter=200,
        learning_rate=0.05,
        max_leaf_nodes=15,
        l2_regularization=1.0,
        early_stopping=True,
        random_state=0,
    )
    return Pipeline([("hazirlik", prepare), ("model", booster)])


def target_mean(keys: np.ndarray, y: np.ndarray, apply_to: np.ndarray) -> np.ndarray:
    """Her anahtar için hedef ortalaması (görülmemiş anahtar → genel ortalama)."""
    means = {key: y[keys == key].mean() for key in np.unique(keys)}
    return np.array([means.get(key, y.mean()) for key in apply_to])


def leakage_demo(table: Table, y: np.ndarray) -> None:
    ids = table["musteri_no"]
    folds = list(StratifiedKFold(5, shuffle=True, random_state=0).split(ids, y))
    wrong = target_mean(ids, y, ids)  # YANLIŞ: bütün veriyle (sınama satırları dahil) hesaplandı
    wrong_auc = np.mean([olcut.roc_auc_score(y[test], wrong[test]) for _, test in folds])
    right_auc = np.mean(
        [
            olcut.roc_auc_score(y[test], target_mean(ids[train], y[train], ids[test]))
            for train, test in folds
        ]
    )
    print("Sızıntı gösterimi — 'musteri_no'nun hedef ortalaması tek başına:")
    print(f"  YANLIŞ (bütün veride kodlandı) ROC-AUC: {wrong_auc:.3f}   ← kusursuz görünüyor")
    print(f"  DOĞRU (her katta yalnız eğitimle)  ROC-AUC: {right_auc:.3f}   ← gerçekte bilgi yok")


def main() -> None:
    table = make_churn_table(3000, random_state=7)
    y = (table["kayip"] == "evet").astype(int)
    print(f"{len(table)} müşteri, kayıp oranı %{100 * y.mean():.1f}")
    leakage_demo(table, y)

    train, test, y_train, y_test = train_test_split(
        table, y, test_size=0.25, random_state=0, stratify=y
    )
    folds = StratifiedKFold(5, shuffle=True, random_state=0)
    scores = cross_val_score(build_model(), train, y_train, cv=folds, scoring="roc_auc")
    print(f"\nÇapraz doğrulama ROC-AUC: {scores.mean():.3f} ± {scores.std():.3f}")

    raw = build_model().fit(train, y_train)
    calibrated = CalibratedClassifierCV(build_model(), method="isotonic", cv=folds).fit(
        train, y_train
    )
    for name, model in (("ham", raw), ("izotonik kalibrasyonlu", calibrated)):
        p = model.predict_proba(test)[:, 1]
        auc = olcut.bootstrap_ci(olcut.roc_auc_score, y_test, p, n_resamples=500, stratify=True)
        print(f"\nSınama ({name}): ROC-AUC {auc}")
        brier, ece = olcut.brier_score_loss(y_test, p), olcut.expected_calibration_error(y_test, p)
        print(f"  Brier {brier:.4f}   ECE {ece:.4f}")
    p = calibrated.predict_proba(test)[:, 1]
    print("\nKalibrasyon tablosu (tahmin edilen → gerçekleşen, satır):")
    for predicted, observed, count in zip(
        *olcut.calibration_table(y_test, p, n_bins=5), strict=True
    ):
        print(f"  {predicted:.2f} → {observed:.2f}  ({count})")


if __name__ == "__main__":
    main()
