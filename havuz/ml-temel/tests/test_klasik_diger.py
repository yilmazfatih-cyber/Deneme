"""Naive Bayes, k-NN, k-means ve PCA: scikit-learn ile karşılaştırma + bilinen sonuçlar."""

from __future__ import annotations

import numpy as np
import pytest

from ml_temel.klasik import (
    PCA,
    GaussianNB,
    KMeans,
    KNeighborsClassifier,
    KNeighborsRegressor,
    MultinomialNB,
)

sklearn = pytest.importorskip("sklearn", reason="karşılaştırma için scikit-learn gerekir")


def blobs(seed: int = 0) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    centers = np.array([[0.0, 0.0, 0.0], [5.0, 5.0, 0.0], [0.0, 6.0, 6.0]])
    labels = rng.integers(0, 3, 240)
    return centers[labels] + rng.standard_normal((240, 3)), labels


def test_gaussian_nb_matches_sklearn() -> None:
    from sklearn.naive_bayes import GaussianNB as SkGaussianNB

    X, y = blobs()
    X[:, 2] *= 0.01
    weights = np.random.default_rng(1).uniform(0.5, 2.0, y.size)
    ours = GaussianNB().fit(X, y, sample_weight=weights)
    theirs = SkGaussianNB().fit(X, y, sample_weight=weights)
    np.testing.assert_allclose(ours.theta_, theirs.theta_)
    np.testing.assert_allclose(ours.var_, theirs.var_)
    np.testing.assert_allclose(ours.predict_proba(X), theirs.predict_proba(X), atol=1e-10)


def test_multinomial_nb_matches_sklearn_and_rejects_negative_input() -> None:
    from sklearn.naive_bayes import MultinomialNB as SkMultinomialNB

    rng = np.random.default_rng(2)
    X = rng.poisson(2.0, size=(150, 12)).astype(float)
    y = rng.integers(0, 3, 150)
    X[y == 1, :3] += 4
    for alpha, fit_prior in ((1.0, True), (0.3, False)):
        ours = MultinomialNB(alpha=alpha, fit_prior=fit_prior).fit(X, y)
        theirs = SkMultinomialNB(alpha=alpha, fit_prior=fit_prior).fit(X, y)
        np.testing.assert_allclose(ours.feature_log_prob_, theirs.feature_log_prob_)
        np.testing.assert_allclose(ours.predict_proba(X), theirs.predict_proba(X), atol=1e-10)
    with pytest.raises(ValueError, match="negatif"):
        MultinomialNB().fit(-X, y)


@pytest.mark.parametrize("weights", ["uniform", "distance"])
@pytest.mark.parametrize("metric", ["euclidean", "manhattan"])
def test_knn_matches_sklearn(weights: str, metric: str) -> None:
    from sklearn.neighbors import KNeighborsClassifier as SkKNC
    from sklearn.neighbors import KNeighborsRegressor as SkKNR

    X, y = blobs(3)
    query = np.random.default_rng(4).standard_normal((50, 3)) * 3 + 2
    ours = KNeighborsClassifier(7, weights=weights, metric=metric).fit(X, y)
    theirs = SkKNC(7, weights=weights, metric=metric, algorithm="brute").fit(X, y)
    np.testing.assert_allclose(ours.predict_proba(query), theirs.predict_proba(query), atol=1e-10)
    target = X.sum(axis=1)
    ours_r = KNeighborsRegressor(4, weights=weights, metric=metric).fit(X, target)
    theirs_r = SkKNR(4, weights=weights, metric=metric, algorithm="brute").fit(X, target)
    np.testing.assert_allclose(ours_r.predict(query), theirs_r.predict(query), atol=1e-9)


def test_knn_distance_weights_with_exact_matches() -> None:
    X = np.array([[0.0], [1.0], [2.0]])
    model = KNeighborsClassifier(3, weights="distance").fit(X, ["a", "b", "b"])
    np.testing.assert_allclose(model.predict_proba([[0.0]]), [[1.0, 0.0]])  # sıfır uzaklık kazanır
    with pytest.raises(ValueError, match="n_neighbors"):
        KNeighborsClassifier(10).fit(X, [0, 1, 1])


def test_kmeans_finds_well_separated_clusters_like_sklearn() -> None:
    from sklearn.cluster import KMeans as SkKMeans
    from sklearn.metrics import adjusted_rand_score

    X, y = blobs(5)
    ours = KMeans(3, random_state=0).fit(X)
    theirs = SkKMeans(3, n_init=10, random_state=0).fit(X)
    assert adjusted_rand_score(y, ours.labels_) == pytest.approx(1.0)
    assert ours.inertia_ == pytest.approx(theirs.inertia_, rel=1e-9)
    assert ours.transform(X).shape == (240, 3)
    np.testing.assert_array_equal(ours.predict(X), ours.labels_)
    assert ours.score(X) == pytest.approx(-ours.inertia_)
    again = KMeans(3, random_state=0).fit(X)
    np.testing.assert_allclose(again.cluster_centers_, ours.cluster_centers_)


def test_kmeans_known_tiny_example_and_duplicates() -> None:
    X = np.array([[0.0], [0.2], [10.0], [10.2]])
    model = KMeans(2, random_state=1).fit(X)
    np.testing.assert_allclose(np.sort(model.cluster_centers_[:, 0]), [0.1, 10.1])
    same = KMeans(2, random_state=0).fit(np.zeros((5, 2)))  # bütün noktalar aynı: çökmemeli
    assert same.inertia_ == pytest.approx(0.0)


def test_pca_matches_sklearn() -> None:
    from sklearn.decomposition import PCA as SKLEARN_PCA

    rng = np.random.default_rng(6)
    X = rng.standard_normal((100, 5)) @ rng.standard_normal((5, 5)) + 3.0
    for n_components, whiten in ((2, False), (0.9, True), (None, False)):
        ours = PCA(n_components=n_components, whiten=whiten).fit(X)
        theirs = SKLEARN_PCA(n_components=n_components, whiten=whiten, svd_solver="full").fit(X)
        np.testing.assert_allclose(ours.components_, theirs.components_, atol=1e-10)
        np.testing.assert_allclose(ours.explained_variance_, theirs.explained_variance_)
        np.testing.assert_allclose(ours.transform(X), theirs.transform(X), atol=1e-9)
        np.testing.assert_allclose(
            ours.inverse_transform(ours.transform(X)),
            theirs.inverse_transform(theirs.transform(X)),
            atol=1e-9,
        )
    full = PCA().fit(X)
    np.testing.assert_allclose(full.inverse_transform(full.transform(X)), X, atol=1e-10)
    with pytest.raises(ValueError, match="n_components"):
        PCA(n_components=9).fit(X)
