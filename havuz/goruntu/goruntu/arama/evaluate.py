"""Arama değerlendirmesi: görüntü→görüntü recall@k (birini dışarıda bırak) ve metin→görüntü isabet.

Kim kullanır: `arama-olc` komutu, ağlı duman testi (docs/DENEME_KAYDI.md).

Tanımlar (etiketli küçük bir küme üzerinde):
- Görüntü→görüntü recall@k: her görüntü sorgu olur, kendisi hariç en benzer k görüntüden EN AZ BİRİ
  aynı sınıftansa isabet. Sorgular üzerinden ortalama. (Metrik öğrenme yazınındaki "Recall@K".)
- Metin→görüntü isabet@k: her sınıfın istemi sorgu olur; ilk k sonuçtan en az biri o sınıftansa isabet.
- Metin→görüntü kesinlik@k: ilk k sonucun ne kadarı o sınıftan (sınıflar üzerinden ortalama).

Genişletme: yeni ölçüt (ör. mAP) için aynı sözlüğe anahtar ekleyin ve `tests/test_search.py` içinde
elle hesaplanmış küçük bir örnekle doğrulayın.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np


def image_recall_at_k(
    vectors: np.ndarray, labels: Sequence[int], ks: Sequence[int] = (1, 5, 10)
) -> dict[str, float]:
    """Birini dışarıda bırakarak görüntü→görüntü recall@k (vektörler normlu olmalı)."""
    count = len(labels)
    if count < 2:
        return {f"recall@{k}": 0.0 for k in ks}
    truth = np.asarray(labels)
    scores = vectors @ vectors.T
    np.fill_diagonal(scores, -np.inf)
    order = np.argsort(-scores, axis=1, kind="stable")
    same = truth[order] == truth[:, None]
    return {f"recall@{k}": float(same[:, : min(k, count - 1)].any(axis=1).mean()) for k in ks}


def text_hits_at_k(
    image_vectors: np.ndarray,
    labels: Sequence[int],
    query_vectors: np.ndarray,
    query_labels: Sequence[int],
    ks: Sequence[int] = (1, 5, 10),
) -> dict[str, float]:
    """Metin sorguları: isabet@k ve kesinlik@k (sorgu başına, ortalama)."""
    truth = np.asarray(labels)
    scores = query_vectors @ image_vectors.T
    order = np.argsort(-scores, axis=1, kind="stable")
    relevant = truth[order] == np.asarray(query_labels)[:, None]
    result: dict[str, float] = {}
    for k in ks:
        top = relevant[:, : min(k, len(truth))]
        result[f"isabet@{k}"] = float(top.any(axis=1).mean()) if len(top) else 0.0
        result[f"kesinlik@{k}"] = float(top.mean()) if top.size else 0.0
    return result
