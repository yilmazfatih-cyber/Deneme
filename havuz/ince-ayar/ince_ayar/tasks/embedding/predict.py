"""Gömme modeliyle arama: sorgu(lar) için belge listesinde en benzer `k` belgeyi bulur.

Kim kullanır: `python -m ince_ayar gomme tahmin --model … --sorgu "…" --belgeler belgeler.txt`.
Belgeler: .txt (satır başına bir belge) ya da .jsonl/.csv (`metin` alanı).

Genişletme: büyük derlemde her seferinde belgeleri yeniden kodlamamak için vektörleri bir dosyaya
yazıp yeniden kullanın (`havuz/yz` temelindeki vektör deposuna bakın).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ince_ayar import console
from ince_ayar.errors import UserError
from ince_ayar.messages import t
from ince_ayar.metrics.retrieval import cosine_rankings
from ince_ayar.tasks.embedding.data import extra_documents


def search(
    model_path: str,
    queries: list[str],
    documents_path: str,
    k: int,
    use_onnx: bool,
    query_prefix: str,
    document_prefix: str,
) -> list[dict[str, Any]]:
    documents = extra_documents(documents_path)
    if not queries or not documents:
        raise UserError(t("gomme.arama_girdi_yok"))
    if use_onnx:
        from ince_ayar.export.onnx_runtime import OnnxEmbedder

        embedder = OnnxEmbedder(Path(model_path))
        query_vectors = embedder.encode_queries(queries)
        document_vectors = embedder.encode_documents(documents)
    else:
        from sentence_transformers import SentenceTransformer

        from ince_ayar.tasks.embedding.evaluate import st_encoders
        from ince_ayar.tasks.encoder_base import find_trained_dir

        model = SentenceTransformer(str(find_trained_dir(Path(model_path))), device="cpu")
        encode_query, encode_document = st_encoders(model, query_prefix, document_prefix)
        query_vectors, document_vectors = encode_query(queries), encode_document(documents)
    rankings = cosine_rankings(query_vectors, document_vectors, min(k, len(documents)))
    results = []
    for query, ranking in zip(queries, rankings, strict=True):
        console.result(f"\n{t('gomme.sorgu_basligi', sorgu=query)}")
        for rank, index in enumerate(ranking, start=1):
            console.result(f"  {rank}. {documents[index]}")
        results.append({"sorgu": query, "belgeler": [documents[i] for i in ranking]})
    return results
