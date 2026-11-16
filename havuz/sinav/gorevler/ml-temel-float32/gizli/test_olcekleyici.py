"""Gizli sınav testi (ml-temel-float32): StandardScaler scikit-learn ile float64 duyarlığında aynı.

Büyük kaydırmalı ve küçük ölçekli sütunlar float32 hatasını büyütür; doğru kod burada scikit-learn'le birebir
aynı sonucu verir (ölçüm: bu makinede en büyük fark 0).
"""

import numpy as np
import pytest
import sklearn.preprocessing as skp
from ml_temel.onisleme import StandardScaler


@pytest.mark.parametrize(
    ("offset", "scale"), [(0.0, 1.0), (1e4, 1.0), (1e6, 0.5), (-3e5, 1e3), (5.0, 1e-3)]
)
def test_scikit_learn_ile_ayni(offset: float, scale: float) -> None:
    rng = np.random.default_rng(0)
    X = rng.normal(offset, scale, size=(500, 4))
    ours = StandardScaler().fit(X)
    theirs = skp.StandardScaler().fit(X)
    np.testing.assert_allclose(ours.mean_, theirs.mean_, rtol=1e-12)
    np.testing.assert_allclose(ours.scale_, theirs.scale_, rtol=1e-9)
    out = ours.transform(X)
    assert out.dtype == np.float64
    np.testing.assert_allclose(out, theirs.transform(X), rtol=1e-9, atol=1e-9)
    np.testing.assert_allclose(ours.inverse_transform(out), X, rtol=1e-12)


def test_eksik_degerler_hala_atlanir() -> None:
    X = np.array([[1.0, 10.0], [np.nan, 20.0], [3.0, 30.0]])
    out = StandardScaler().fit_transform(X)
    assert np.isnan(out[1, 0])
    np.testing.assert_allclose(out[[0, 2], 0], [-1.0, 1.0])
