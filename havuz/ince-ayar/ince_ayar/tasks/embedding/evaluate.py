"""Gömme modelinin arama başarısı: recall@k, MRR@k, nDCG@k, isabet@k.

Kim kullanır: `tasks/embedding/train.py` (eğitimden önce ve sonra; fark rapora yazılır) ve
`python -m ince_ayar gomme degerlendir` (PyTorch ya da `--onnx`).

Her sorgu derlemin tamamında aranır; derlem = doğrulama çiftlerinin olumluları + olumsuzları +
`ek_belgeler`. Derlem küçükse ölçütler iyimserdir (az rakip belge); gerçekçi sonuç için ek belge verin.

Genişletme: yeni bir ölçüt için `ince_ayar/metrics/retrieval.py` dosyasına bakın.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np

from ince_ayar import console
from ince_ayar.console import format_table
from ince_ayar.io_utils import write_json
from ince_ayar.messages import t
from ince_ayar.metrics.retrieval import cosine_rankings, retrieval_metrics
from ince_ayar.runs import EVALUATION_FILE
from ince_ayar.tasks.embedding.config import EmbeddingConfig
from ince_ayar.tasks.embedding.data import (
    RetrievalSet,
    extra_documents,
    prepare_pairs,
    retrieval_set,
)

Encoder = Callable[[list[str]], np.ndarray]


def st_encoders(model: Any, query_prefix: str, document_prefix: str) -> tuple[Encoder, Encoder]:
    """sentence-transformers modeli için (sorgu, belge) kodlayıcıları."""

    def encode(prefix: str) -> Encoder:
        def run(texts: list[str]) -> np.ndarray:
            return np.asarray(
                model.encode(
                    [prefix + text for text in texts],
                    batch_size=32,
                    convert_to_numpy=True,
                    show_progress_bar=False,
                )
            )

        return run

    return encode(query_prefix), encode(document_prefix)


def score(
    encode_query: Encoder, encode_document: Encoder, data: RetrievalSet, ks: list[int]
) -> dict[str, float]:
    rankings = cosine_rankings(encode_query(data.queries), encode_document(data.documents), max(ks))
    return retrieval_metrics(rankings, data.relevant, ks)


def comparison_table(results: dict[str, dict[str, float]], ks: list[int]) -> str:
    keys = [f"{name}@{k}" for k in ks for name in ("recall", "mrr")] + [f"ndcg@{max(ks)}"]
    return format_table(
        ["model", *keys], [[name, *[res[k] for k in keys]] for name, res in results.items()]
    )


def evaluation_set(config: EmbeddingConfig, data_path: str | None) -> RetrievalSet:
    if data_path:
        from ince_ayar.data.validate import load_pairs

        loaded = load_pairs(Path(data_path), config.veri.kodlama)
        loaded.raise_if_errors()
        pairs = loaded.rows
    else:
        pairs = prepare_pairs(config.veri).validation
    return retrieval_set(pairs, extra_documents(config.veri.ek_belgeler))


def evaluate_embedder(
    config: EmbeddingConfig, model_path: str | None, data_path: str | None, use_onnx: bool
) -> dict[str, float]:
    data = evaluation_set(config, data_path)
    target = Path(model_path or config.egitim.cikti)
    ks = config.degerlendirme.k_degerleri
    if use_onnx:
        from ince_ayar.export.onnx_runtime import OnnxEmbedder

        embedder = OnnxEmbedder(target)
        result = score(embedder.encode_queries, embedder.encode_documents, data, ks)
    else:
        from sentence_transformers import SentenceTransformer

        from ince_ayar.tasks.encoder_base import find_trained_dir

        model = SentenceTransformer(str(find_trained_dir(target)), device="cpu")
        query, document = st_encoders(model, config.model.sorgu_oneki, config.model.belge_oneki)
        result = score(query, document, data, ks)
    console.result(t("gomme.derlem", sorgu=len(data.queries), belge=len(data.documents)))
    console.result(comparison_table({"model": result}, ks))
    if target.is_dir():
        write_json(
            target / EVALUATION_FILE,
            {"onnx": use_onnx, "sorgu": len(data.queries), "belge": len(data.documents), **result},
        )
    return result
