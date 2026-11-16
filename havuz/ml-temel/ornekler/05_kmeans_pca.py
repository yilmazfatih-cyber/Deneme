"""Örnek (e): k-means kümeleme + PCA ile boyut indirme.

Altı boyutlu, dört gerçek kümeli tohumlu veri. Adımlar: ölçekleme → PCA ile varyansın ne kadarının
ilk iki bileşende olduğu → farklı k değerleri için inertia ("dirsek" yöntemi) → k = 4 kümelerin
gerçek gruplarla ne kadar örtüştüğü (saflık) → PCA uzayında ASCII dağılım çizimi.
Not: gerçek veride "doğru" küme sayısı yoktur; dirsek ve alan bilgisi birlikte kullanılır.
Çalıştırma: python ornekler/05_kmeans_pca.py   (birkaç saniye)
"""

from __future__ import annotations

import _setup_path  # noqa: F401
import numpy as np

from ml_temel.klasik import PCA, KMeans
from ml_temel.onisleme import StandardScaler
from ml_temel.veri import make_blobs


def purity(truth: np.ndarray, clusters: np.ndarray) -> float:
    """Her kümede en kalabalık gerçek grubun payı (1 = kümeler grupları birebir ayırıyor)."""
    total = sum(int(np.max(np.bincount(truth[clusters == c]))) for c in np.unique(clusters))
    return float(total / truth.size)


def main() -> None:
    X, truth = make_blobs(600, centers=4, n_features=6, cluster_std=2.0, random_state=3)
    scaled = StandardScaler().fit_transform(X)
    pca = PCA(n_components=2).fit(scaled)
    ratio = pca.explained_variance_ratio_
    parts = f"{ratio[0]:.2f} + {ratio[1]:.2f}"
    print(f"İlk iki bileşenin açıkladığı varyans payı: {ratio.sum():.3f} ({parts})")

    print("\nk    inertia")
    for k in range(1, 8):
        model = KMeans(k, random_state=0).fit(scaled)
        print(f"{k}  {model.inertia_:9.1f}")

    model = KMeans(4, random_state=0).fit(scaled)
    sizes = np.bincount(model.labels_)
    print(f"\nk = 4: küme boyları {sizes.tolist()}, saflık {purity(truth, model.labels_):.3f}")

    projected = pca.transform(scaled)
    print("\nPCA uzayında kümeler (rakam = küme no):")
    columns, rows = 50, 14
    low, high = projected.min(axis=0), projected.max(axis=0)
    cells = ((projected - low) / (high - low + 1e-12) * [columns - 1, rows - 1]).astype(int)
    canvas = [[" "] * columns for _ in range(rows)]
    for (cx, cy), label in zip(cells.tolist(), model.labels_.tolist(), strict=True):
        canvas[rows - 1 - cy][cx] = str(label)
    for line in canvas:
        print("|" + "".join(line) + "|")


if __name__ == "__main__":
    main()
