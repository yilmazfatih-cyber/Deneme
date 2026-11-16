"""olcut — değerlendirme ölçütleri (adlar ve imzalar scikit-learn `metrics` ile aynıdır).

  classification.py  doğruluk, karışıklık matrisi, kesinlik / duyarlılık / F1
  ranking.py         ROC eğrisi, ROC-AUC, kesinlik-duyarlılık eğrisi, PR-AUC
  probability.py     log-kayıp, Brier, kalibrasyon eğrisi, ECE
  regression.py      RMSE, MAE, R², MSE, MAPE
  bootstrap.py       önyükleme güven aralığı
  scorers.py         ada göre puanlayıcı kaydı (çapraz doğrulama için)

Hangi ölçüt ne zaman: docs/DEGERLENDIRME.md.
Genişletme: AGENTS.md → "Yeni ölçüt ekle".
"""

from ml_temel.olcut.bootstrap import BootstrapResult, bootstrap_ci
from ml_temel.olcut.classification import (
    accuracy_score,
    balanced_accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
    precision_score,
    recall_score,
)
from ml_temel.olcut.probability import (
    brier_score_loss,
    calibration_curve,
    calibration_table,
    expected_calibration_error,
    log_loss,
)
from ml_temel.olcut.ranking import (
    average_precision_score,
    pr_auc_score,
    precision_recall_curve,
    roc_auc_score,
    roc_curve,
)
from ml_temel.olcut.regression import (
    mean_absolute_error,
    mean_absolute_percentage_error,
    mean_squared_error,
    r2_score,
    root_mean_squared_error,
)
from ml_temel.olcut.scorers import SCORERS, Scorer, get_scorer

__all__ = [
    "SCORERS",
    "BootstrapResult",
    "Scorer",
    "accuracy_score",
    "average_precision_score",
    "balanced_accuracy_score",
    "bootstrap_ci",
    "brier_score_loss",
    "calibration_curve",
    "calibration_table",
    "classification_report",
    "confusion_matrix",
    "expected_calibration_error",
    "f1_score",
    "get_scorer",
    "log_loss",
    "mean_absolute_error",
    "mean_absolute_percentage_error",
    "mean_squared_error",
    "pr_auc_score",
    "precision_recall_curve",
    "precision_recall_fscore_support",
    "precision_score",
    "r2_score",
    "recall_score",
    "roc_auc_score",
    "roc_curve",
    "root_mean_squared_error",
]
