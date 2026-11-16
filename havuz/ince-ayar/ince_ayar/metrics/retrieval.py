"""Arama (retrieval) ölçütleri: recall@k, MRR@k, nDCG@k, isabet@k (yalnız numpy).

Kim kullanır: gömme görevinin değerlendirmesi (`tasks/embedding/evaluate.py`). Testlerde
sentence-transformers'ın `InformationRetrievalEvaluator` sonucuyla karşılaştırılır.

Tanımlar (her sorgu için hesaplanır, sonra sorgu ortalaması alınır):
- isabet@k : ilk k sonuçta en az bir ilgili belge var mı (0/1).
- recall@k : ilgili belgelerin kaçta kaçı ilk k sonuçta.
- MRR@k    : ilk ilgili belgenin sırası r ise 1/r; ilk k içinde yoksa 0.
- nDCG@k   : ikili ilgililikle DCG / ideal DCG.

Genişletme: yeni ölçütü `retrieval_metrics` içindeki döngüye ekleyin.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np

DEFAULT_KS = (1, 5, 10)


def cosine_rankings(queries: np.ndarray, documents: np.ndarray, top_k: int) -> list[list[int]]:
    """Her sorgu için kosinüs benzerliğine göre en iyi `top_k` belge sıra numarası.

    Eşit skorda küçük sıra numaralı belge öne gelir (kararlı sıralama) ki sonuç belirlenimci olsun.
    """
    query_norm = queries / np.maximum(np.linalg.norm(queries, axis=1, keepdims=True), 1e-12)
    document_norm = documents / np.maximum(np.linalg.norm(documents, axis=1, keepdims=True), 1e-12)
    scores = query_norm @ document_norm.T
    order = np.argsort(-scores, axis=1, kind="stable")[:, :top_k]
    return [[int(index) for index in row] for row in order]


def retrieval_metrics(
    rankings: Sequence[Sequence[int]],
    relevant: Sequence[set[int]],
    ks: Sequence[int] = DEFAULT_KS,
) -> dict[str, float]:
    """Sıralamalardan ölçütleri hesaplar. `relevant[i]`: i. sorgunun ilgili belge numaraları."""
    if len(rankings) != len(relevant):
        raise ValueError("rankings ve relevant aynı uzunlukta olmalı")
    totals = {f"{name}@{k}": 0.0 for k in ks for name in ("isabet", "recall", "mrr", "ndcg")}
    for ranking, wanted in zip(rankings, relevant, strict=True):
        for k in ks:
            top = list(ranking[:k])
            hits = [1 if document in wanted else 0 for document in top]
            totals[f"isabet@{k}"] += 1.0 if any(hits) else 0.0
            totals[f"recall@{k}"] += sum(hits) / len(wanted) if wanted else 0.0
            first = next((rank for rank, hit in enumerate(hits, start=1) if hit), None)
            totals[f"mrr@{k}"] += 1.0 / first if first else 0.0
            dcg = sum(hit / math.log2(rank + 1) for rank, hit in enumerate(hits, start=1))
            ideal = sum(1.0 / math.log2(rank + 1) for rank in range(1, min(len(wanted), k) + 1))
            totals[f"ndcg@{k}"] += dcg / ideal if ideal else 0.0
    count = max(len(rankings), 1)
    return {name: value / count for name, value in totals.items()}
