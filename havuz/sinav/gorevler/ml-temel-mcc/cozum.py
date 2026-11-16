"""Başvuru çözümü: matthews_corrcoef (karışıklık matrisinden, Gorodkin genellemesi) + kayıt + test.

Ajana verilmez. Kim kullanır: `sinav.py dogrula`.
Genişletme: olcut/__init__.py'nin içe aktarma bloğu değişirse aranan metinleri güncelleyin.
"""

from pathlib import Path

from exam.edit import insert_before, read, replace, run, write

FUNCTION = '''

def matthews_corrcoef(y_true: ArrayLike, y_pred: ArrayLike) -> float:
    """Matthews korelasyon katsayısı: -1 (tam ters) … 0 (rastgele) … 1 (kusursuz).

    Çok sınıfta da çalışır.

    Karışıklık matrisinden hesaplanır (Gorodkin genellemesi). Payda sıfırsa (ör. bütün tahminler tek
    sınıf) 0.0 döner; scikit-learn ile aynı.
    """
    matrix = confusion_matrix(y_true, y_pred).astype(np.float64)
    total = matrix.sum()
    correct = np.trace(matrix)
    true_counts = matrix.sum(axis=1)
    pred_counts = matrix.sum(axis=0)
    numerator = correct * total - true_counts @ pred_counts
    denominator = np.sqrt(
        (total**2 - pred_counts @ pred_counts) * (total**2 - true_counts @ true_counts)
    )
    return float(numerator / denominator) if denominator > 0 else 0.0
'''

TEST = '''"""matthews_corrcoef: scikit-learn ile karşılaştırma ve elle hesaplanmış örnek."""

import numpy as np
import pytest

from ml_temel import olcut


def test_matthews_corrcoef_matches_sklearn() -> None:
    skm = pytest.importorskip("sklearn.metrics")
    rng = np.random.default_rng(5)
    for classes in (2, 3, 5):
        y = rng.integers(0, classes, 200)
        pred = np.where(rng.random(200) < 0.6, y, rng.integers(0, classes, 200))
        assert olcut.matthews_corrcoef(y, pred) == pytest.approx(skm.matthews_corrcoef(y, pred))


def test_matthews_corrcoef_by_hand_and_zero_denominator() -> None:
    assert olcut.matthews_corrcoef([1, 1, 0, 0], [1, 1, 0, 0]) == pytest.approx(1.0)
    assert olcut.matthews_corrcoef([1, 1, 0, 0], [0, 0, 1, 1]) == pytest.approx(-1.0)
    assert olcut.matthews_corrcoef(["a", "b", "a"], ["a", "a", "a"]) == 0.0
'''


def coz(kopya: Path) -> None:
    classification = kopya / "ml_temel/olcut/classification.py"
    write(classification, read(classification) + FUNCTION)
    init = kopya / "ml_temel/olcut/__init__.py"
    replace(
        init,
        "    f1_score,\n    precision_recall_fscore_support,",
        "    f1_score,\n    matthews_corrcoef,\n    precision_recall_fscore_support,",
    )
    replace(init, '    "log_loss",\n', '    "log_loss",\n    "matthews_corrcoef",\n')
    insert_before(
        kopya / "ml_temel/olcut/scorers.py",
        "    # YENİ ÖLÇÜT BURAYA",
        '    "matthews_corrcoef": Scorer("matthews_corrcoef", classification.matthews_corrcoef),\n',
    )
    write(kopya / "tests/test_olcut_mcc.py", TEST)
    python = str(kopya / ".venv/bin/python")
    run([python, "-m", "ruff", "format", "-q", "ml_temel/olcut", "tests/test_olcut_mcc.py"], kopya)
