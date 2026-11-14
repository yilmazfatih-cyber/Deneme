"""Değerlendirme ölçüleri (saf numpy): gizlenen çekimi aday çekimler arasında bulma — R@1, R@5, ortalama sıra, MRR."""

from __future__ import annotations

import numpy as np


def _unit(x: np.ndarray) -> np.ndarray:
    return x / np.maximum(np.linalg.norm(x, axis=-1, keepdims=True), 1e-12)


def modal_scores(pred: np.ndarray, pred_ok: np.ndarray, cand: np.ndarray, cand_ok: np.ndarray) -> np.ndarray:
    """(q, c) benzerlik: iki tarafta da var olan kiplerin kosinüslerinin ortalaması (ortak kip yoksa −1).

    pred (q, 3, D) · pred_ok (q, 3) · cand (c, 3, D) · cand_ok (c, 3).
    """
    cos = np.einsum("qmd,cmd->qcm", _unit(pred), _unit(cand))
    both = pred_ok[:, None, :] & cand_ok[None, :, :]
    k = both.sum(-1)
    s = np.where(both, cos, 0.0).sum(-1)
    return np.where(k > 0, s / np.maximum(k, 1), -1.0)


def ranks(scores: np.ndarray, true_idx: np.ndarray) -> np.ndarray:
    """Doğru adayın 1'den başlayan sırası. Eşitlikte kötümser: eşit puanlı başka aday doğru adayın önüne yazılır."""
    q = np.arange(scores.shape[0])
    t = scores[q, true_idx][:, None]
    ahead = (scores >= t).sum(1) - 1  # kendisi hariç, puanı ≥ olanlar
    return ahead + 1


def summarize(r: np.ndarray, n_cand: np.ndarray) -> dict[str, float]:
    r = np.asarray(r, dtype=np.float64)
    n = np.asarray(n_cand, dtype=np.float64)
    if r.size == 0:
        return {"queries": 0}
    return {
        "queries": int(r.size),
        "candidates_mean": float(n.mean()),
        "R@1": float((r <= 1).mean()),
        "R@5": float((r <= 5).mean()),
        "mean_rank": float(r.mean()),
        "median_rank": float(np.median(r)),
        "MRR": float((1.0 / r).mean()),
        # sıra / aday sayısı: 0'a yakın iyi, rastgele ≈ 0.5
        "norm_rank": float(((r - 1) / np.maximum(n - 1, 1)).mean()),
        "random_R@1": float((1.0 / n).mean()),
        "random_R@5": float(np.minimum(5.0 / n, 1.0).mean()),
    }


def nearest_visible(i: int, hidden: np.ndarray) -> int | None:
    """Gizli i'ye en yakın görünür çekim (eşitlikte soldaki)."""
    n = len(hidden)
    for dist in range(1, n):
        for j in (i - dist, i + dist):
            if 0 <= j < n and not hidden[j]:
                return j
    return None


def neighbour_sides(i: int, hidden: np.ndarray) -> tuple[int | None, int | None]:
    """Gizli i'nin solundaki ve sağındaki en yakın görünür çekimler."""
    left = next((j for j in range(i - 1, -1, -1) if not hidden[j]), None)
    right = next((j for j in range(i + 1, len(hidden)) if not hidden[j]), None)
    return left, right
