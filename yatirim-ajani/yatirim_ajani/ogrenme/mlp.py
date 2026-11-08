"""Bağımlılıksız küçük MLP (numpy): tek gizli katman, geri yayılım (backprop), Adam, erken durdurma.

Finans verisi gürültülüdür; bu yüzden küçük ağ, güçlü düzenlileştirme ve ZAMAN SIRALI erken
durdurma (doğrulama = eğitim penceresinin son %20'si) kullanılır. Rastgele karıştırılmış doğrulama
geleceği sızdırır.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class MLP:
    W1: np.ndarray
    b1: np.ndarray
    W2: np.ndarray
    b2: float
    ort: np.ndarray
    std: np.ndarray
    y_ort: float
    y_std: float

    def _ileri(self, X: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        Z = (X - self.ort) / self.std
        H = np.tanh(Z @ self.W1 + self.b1)
        return H, H @ self.W2 + self.b2

    def tahmin(self, X: np.ndarray) -> np.ndarray:
        return self._ileri(np.asarray(X, dtype=float))[1] * self.y_std + self.y_ort


def egit_mlp(
    X: np.ndarray,
    y: np.ndarray,
    gizli: int = 16,
    ogrenme_hizi: float = 1e-3,
    l2: float = 1e-3,
    donem: int = 300,
    parti: int = 512,
    sabir: int = 20,
    tohum: int = 0,
) -> tuple[MLP, dict[str, float]]:
    """Zaman sıralı: ilk %80 eğitim, son %20 doğrulama (erken durdurma). Geri yayılım elle yazılmıştır."""
    X = np.asarray(X, dtype=float)
    y = np.asarray(y, dtype=float)
    n, d = X.shape
    kes = int(n * 0.8)
    ort, std = X[:kes].mean(0), X[:kes].std(0)
    std[std == 0] = 1.0
    y_ort, y_std = float(y[:kes].mean()), float(y[:kes].std() or 1.0)
    Z = (X - ort) / std
    yz = (y - y_ort) / y_std
    rng = np.random.default_rng(tohum)
    W1 = rng.normal(0, 1 / np.sqrt(d), (d, gizli))
    b1 = np.zeros(gizli)
    W2 = rng.normal(0, 1 / np.sqrt(gizli), gizli)
    b2 = 0.0
    params = [W1, b1, W2, np.array([b2])]
    m = [np.zeros_like(p) for p in params]
    v = [np.zeros_like(p) for p in params]
    beta1, beta2, eps = 0.9, 0.999, 1e-8
    en_iyi, en_iyi_kayip, bekleme, adim = None, np.inf, 0, 0

    def kayip(idx: slice | np.ndarray) -> float:
        H = np.tanh(Z[idx] @ params[0] + params[1])
        p = H @ params[2] + params[3][0]
        return float(np.mean((p - yz[idx]) ** 2))

    for _ in range(donem):
        sira = rng.permutation(kes)  # parti sırası karışık olabilir; eğitim/doğrulama ayrımı zamana göredir
        for i in range(0, kes, parti):
            idx = sira[i : i + parti]
            Zi, yi = Z[idx], yz[idx]
            # ileri
            A = Zi @ params[0] + params[1]
            H = np.tanh(A)
            p = H @ params[2] + params[3][0]
            # geri yayılım (MSE)
            dp = 2 * (p - yi) / len(idx)
            gW2 = H.T @ dp + l2 * params[2]
            gb2 = np.array([dp.sum()])
            dH = np.outer(dp, params[2]) * (1 - H**2)
            gW1 = Zi.T @ dH + l2 * params[0]
            gb1 = dH.sum(0)
            adim += 1
            for k, g in enumerate((gW1, gb1, gW2, gb2)):
                m[k] = beta1 * m[k] + (1 - beta1) * g
                v[k] = beta2 * v[k] + (1 - beta2) * g**2
                mh = m[k] / (1 - beta1**adim)
                vh = v[k] / (1 - beta2**adim)
                params[k] -= ogrenme_hizi * mh / (np.sqrt(vh) + eps)
        dogrulama = kayip(slice(kes, n)) if kes < n else kayip(slice(0, kes))
        if dogrulama < en_iyi_kayip - 1e-6:
            en_iyi_kayip, bekleme = dogrulama, 0
            en_iyi = [p.copy() for p in params]
        else:
            bekleme += 1
            if bekleme >= sabir:
                break
    assert en_iyi is not None
    model = MLP(en_iyi[0], en_iyi[1], en_iyi[2], float(en_iyi[3][0]), ort, std, y_ort, y_std)
    return model, {"dogrulama_mse": en_iyi_kayip, "egitim_mse": kayip(slice(0, kes)), "donem": _ + 1}
