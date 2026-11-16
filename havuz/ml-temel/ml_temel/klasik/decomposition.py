"""PCA (temel bileşen analizi), tekil değer ayrışımı (SVD) ile.

Fikir: veriyi ortalamasına çektikten sonra, varyansın en çok olduğu yönleri (temel bileşenler)
sırayla bulur. Merkezlenmiş X = U·S·Vᵀ ise Vᵀ'nin satırları bileşenler, Sᵢ²/(n-1) ise her
bileşenin açıkladığı varyanstır. İlk birkaç bileşene izdüşüm, bilginin çoğunu koruyarak boyutu
düşürür (görselleştirme, gürültü azaltma, sonraki modeli hızlandırma).

İşaret kuralı (scikit-learn ile aynı): her bileşende mutlak değeri en büyük eleman pozitif yapılır;
böylece sonuç çalıştırmadan çalıştırmaya değişmez.
`n_components`: tam sayı (bileşen sayısı), 0–1 arası oran (o kadar varyansı açıklayan en az
bileşen) ya da None (hepsi). Ölçekleri farklı sütunlarda önce `StandardScaler` kullanın.
Genişletme: büyük veride rastgele (randomized) SVD gerekirse `fit` içindeki `np.linalg.svd`'yi
değiştirin.
"""

from __future__ import annotations

from typing import Any, Self

import numpy as np

from ml_temel.ortak.base import BaseEstimator, TransformerMixin
from ml_temel.ortak.types import Array, ArrayLike
from ml_temel.ortak.validation import check_array, check_is_fitted, check_n_features


def flip_signs(components: Array) -> Array:
    """Her satırın mutlak değerce en büyük elemanı pozitif olacak biçimde işaretleri çevirir."""
    largest = np.argmax(np.abs(components), axis=1)
    signs = np.sign(components[np.arange(components.shape[0]), largest])
    signs[signs == 0] = 1.0
    return components * signs[:, None]


class PCA(BaseEstimator, TransformerMixin):
    """Temel bileşen analizi. `whiten=True` çıktı sütunlarını birim varyansa getirir."""

    def __init__(self, n_components: float | None = None, whiten: bool = False) -> None:
        self.n_components = n_components
        self.whiten = whiten

    def _choose_k(self, ratio: Array, limit: int) -> int:
        wanted = self.n_components
        if wanted is None:
            return limit
        if isinstance(wanted, float) and 0.0 < wanted < 1.0:
            return int(np.searchsorted(np.cumsum(ratio), wanted, side="right")) + 1
        if isinstance(wanted, (int, np.integer)) and 1 <= wanted <= limit:
            return int(wanted)
        raise ValueError(
            f"n_components 1..{limit} arası bir tam sayı, (0, 1) arası bir oran ya da None olmalı; "
            f"verilen: {wanted!r}."
        )

    def fit(self, X: ArrayLike, y: Any = None) -> Self:
        data = check_array(X, min_samples=2)
        self.mean_ = data.mean(axis=0)
        _, singular, vt = np.linalg.svd(data - self.mean_, full_matrices=False)
        vt = flip_signs(vt)
        variance = singular**2 / (data.shape[0] - 1)
        total = float(variance.sum())
        ratio = variance / total if total > 0 else np.zeros_like(variance)
        k = min(self._choose_k(ratio, min(data.shape)), len(singular))
        self.components_ = vt[:k]
        self.explained_variance_ = variance[:k]
        self.explained_variance_ratio_ = ratio[:k]
        self.singular_values_ = singular[:k]
        self.noise_variance_ = float(variance[k:].mean()) if k < min(data.shape) else 0.0
        self.n_components_ = k
        self.n_features_in_ = data.shape[1]
        return self

    def transform(self, X: ArrayLike) -> Array:
        check_is_fitted(self, "components_")
        data = check_array(X)
        check_n_features(self, data)
        projected: Array = (data - self.mean_) @ self.components_.T
        if self.whiten:
            projected = projected / np.sqrt(np.maximum(self.explained_variance_, 1e-300))
        return projected

    def inverse_transform(self, X: ArrayLike) -> Array:
        """Bileşen uzayından özgün uzaya geri dönüş (atılan bileşenlerin bilgisi kaybolmuştur)."""
        check_is_fitted(self, "components_")
        projected = check_array(X)
        if self.whiten:
            projected = projected * np.sqrt(self.explained_variance_)
        restored: Array = projected @ self.components_ + self.mean_
        return restored
