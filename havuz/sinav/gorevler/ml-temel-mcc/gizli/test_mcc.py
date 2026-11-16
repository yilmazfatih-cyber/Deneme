"""Gizli sınav testi (ml-temel-mcc): matthews_corrcoef scikit-learn ile aynı; puanlayıcı adıyla kayıtlı."""

import numpy as np
import pytest
import sklearn.metrics as skm
from ml_temel import olcut
from ml_temel.klasik import LogisticRegression
from ml_temel.olcut import SCORERS, get_scorer
from ml_temel.secim import cross_validate


def test_ikili_ve_cok_sinifli_scikit_learn_ile_ayni() -> None:
    rng = np.random.default_rng(2026)
    for classes in (2, 3, 4, 7):
        for _ in range(25):
            n = int(rng.integers(5, 300))
            y = rng.integers(0, classes, n)
            pred = np.where(rng.random(n) < rng.random(), y, rng.integers(0, classes, n))
            ours = olcut.matthews_corrcoef(y, pred)
            assert isinstance(ours, float)
            assert ours == pytest.approx(skm.matthews_corrcoef(y, pred), abs=1e-12)


def test_metin_etiketler() -> None:
    rng = np.random.default_rng(7)
    names = np.array(["kedi", "köpek", "kuş", "İguana"])
    y = names[rng.integers(0, 4, 120)]
    pred = np.where(rng.random(120) < 0.7, y, names[rng.integers(0, 4, 120)])
    assert olcut.matthews_corrcoef(list(y), list(pred)) == pytest.approx(
        skm.matthews_corrcoef(y, pred)
    )


def test_bilinen_degerler_ve_sifir_payda() -> None:
    assert olcut.matthews_corrcoef([1, 1, 0, 0], [1, 1, 0, 0]) == pytest.approx(1.0)
    assert olcut.matthews_corrcoef([1, 1, 0, 0], [0, 0, 1, 1]) == pytest.approx(-1.0)
    assert olcut.matthews_corrcoef([1, 1, 1, 0, 0, 0], [1, 1, 0, 0, 0, 1]) == pytest.approx(1 / 3)
    assert olcut.matthews_corrcoef([1, 0, 1, 0], [1, 1, 1, 1]) == 0.0
    assert olcut.matthews_corrcoef(["a", "a", "a"], ["a", "a", "a"]) == 0.0


def test_capraz_dogrulamada_adiyla() -> None:
    assert "matthews_corrcoef" in SCORERS
    rng = np.random.default_rng(3)
    X = rng.normal(size=(120, 3))
    y = (X[:, 0] + 0.3 * rng.normal(size=120) > 0).astype(int)
    model = LogisticRegression().fit(X, y)
    scorer = get_scorer("matthews_corrcoef")
    assert scorer(model, X, y) == pytest.approx(skm.matthews_corrcoef(y, model.predict(X)))
    result = cross_validate(LogisticRegression(), X, y, scoring="matthews_corrcoef", cv=3)
    assert len(result["test_score"]) == 3 and min(result["test_score"]) > 0.3
