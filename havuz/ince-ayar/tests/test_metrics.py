"""Ölçütler: elle hesaplanmış örnekler + başvuru kütüphaneleriyle (scikit-learn,
sentence-transformers) karşılaştırma."""

from __future__ import annotations

import random
from pathlib import Path

import numpy as np
import pytest

from ince_ayar.data.stats import length_stats, percentile, render_stats, suggest_limit
from ince_ayar.metrics.classification import (
    best_binary_threshold,
    classification_report,
    confidence_threshold,
)
from ince_ayar.metrics.ner import entity_scores, extract_entities, token_accuracy
from ince_ayar.metrics.retrieval import cosine_rankings, retrieval_metrics
from ince_ayar.metrics.text import exact_match, lcs_length, rouge_l, score_generations


def test_tam_eslesme_turkce_harf_ve_noktalama() -> None:
    assert exact_match("İSTANBUL'DA.", "istanbul'da")
    assert not exact_match("Istanbul", "istanbul")  # I → ı: farklı sözcük


def test_rouge_l_elle_hesap() -> None:
    score = rouge_l("kargo üç günde gelir", "kargo iki günde gelir")
    assert (score.precision, score.recall) == (0.75, 0.75)
    assert score.f1 == pytest.approx(0.75)
    assert lcs_length("ABCBDAB", "BDCABA") == 4
    assert rouge_l("", "").f1 == 1.0 and rouge_l("a", "").f1 == 0.0


def test_uretim_ozeti() -> None:
    result = score_generations(["Evet.", "kargo yarın"], ["evet", "kargo bugün"])
    assert result["tam_eslesme"] == 0.5
    assert result["rouge_l"] == pytest.approx((1.0 + 0.5) / 2)


@pytest.mark.parametrize("seed", [0, 1, 2])
def test_siniflandirma_olcutleri_scikit_learn_ile_ayni(seed: int) -> None:
    from sklearn.metrics import (
        accuracy_score,
        confusion_matrix,
        f1_score,
        precision_score,
        recall_score,
    )

    rng = random.Random(seed)
    truth = [rng.randrange(4) for _ in range(80)]
    guess = [y if rng.random() < 0.6 else rng.randrange(4) for y in truth]
    report = classification_report(truth, guess, ["a", "b", "c", "d"])
    assert report.accuracy == pytest.approx(accuracy_score(truth, guess))
    assert report.macro_f1 == pytest.approx(
        f1_score(truth, guess, average="macro", zero_division=0)
    )
    assert report.confusion == confusion_matrix(truth, guess, labels=[0, 1, 2, 3]).tolist()
    precision = precision_score(truth, guess, average=None, labels=[0, 1, 2, 3], zero_division=0)
    recall = recall_score(truth, guess, average=None, labels=[0, 1, 2, 3], zero_division=0)
    for index, label in enumerate("abcd"):
        assert report.per_class[label].precision == pytest.approx(precision[index])
        assert report.per_class[label].recall == pytest.approx(recall[index])


def test_ikili_esik_kaba_kuvvetten_kotu_degil() -> None:
    rng = random.Random(5)
    truth = [1 if rng.random() < 0.2 else 0 for _ in range(200)]
    scores = [min(1.0, max(0.0, 0.3 * y + rng.random() * 0.7)) for y in truth]
    threshold, best = best_binary_threshold(scores, truth)
    grid = [i / 1000 for i in range(1001)]
    brute = max(
        classification_report(truth, [int(s >= g) for s in scores], ["0", "1"]).macro_f1
        for g in grid
    )
    assert best >= brute - 1e-12
    achieved = classification_report(
        truth, [int(s >= threshold) for s in scores], ["0", "1"]
    ).macro_f1
    assert achieved == pytest.approx(best)


def test_guven_esigi_hedef_dogrulugu_saglar() -> None:
    confidences = [0.95, 0.9, 0.8, 0.7, 0.6, 0.55]
    correct = [True, True, True, False, True, False]
    level, coverage = confidence_threshold(confidences, correct, 0.99)
    assert (level, coverage) == (0.8, 0.5)
    assert confidence_threshold(confidences, [False] * 6, 0.5) == (None, 0.0)


def test_arama_olcutleri_sentence_transformers_ile_ayni(tmp_path: Path) -> None:
    from sentence_transformers import SentenceTransformer
    from sentence_transformers.sentence_transformer.evaluation import InformationRetrievalEvaluator

    from ince_ayar.data.validate import load_pairs
    from ince_ayar.tiny import create_tiny_encoder
    from tests.conftest import EXAMPLES

    pairs = load_pairs(EXAMPLES / "gomme.jsonl").rows
    docs = sorted({p.positive for p in pairs} | {n for p in pairs for n in p.negatives})
    create_tiny_encoder([p.query for p in pairs] + docs, tmp_path / "m", seed=3)
    model = SentenceTransformer(str(tmp_path / "m"), device="cpu")
    queries = [p.query for p in pairs]
    relevant = [{docs.index(p.positive)} for p in pairs]
    rankings = cosine_rankings(model.encode(queries), model.encode(docs), 10)
    ours = retrieval_metrics(rankings, relevant, (1, 3, 5, 10))
    evaluator = InformationRetrievalEvaluator(
        {str(i): q for i, q in enumerate(queries)},
        {str(i): d for i, d in enumerate(docs)},
        {str(i): {str(j) for j in rel} for i, rel in enumerate(relevant)},
        mrr_at_k=[10],
        ndcg_at_k=[10],
        accuracy_at_k=[1, 3, 5, 10],
        precision_recall_at_k=[1, 3, 5, 10],
        map_at_k=[10],
        name="t",
        write_csv=False,
    )
    theirs = evaluator(model)
    assert ours["mrr@10"] == pytest.approx(theirs["t_cosine_mrr@10"])
    assert ours["ndcg@10"] == pytest.approx(theirs["t_cosine_ndcg@10"])
    for k in (1, 3, 5, 10):
        assert ours[f"recall@{k}"] == pytest.approx(theirs[f"t_cosine_recall@{k}"])
        assert ours[f"isabet@{k}"] == pytest.approx(theirs[f"t_cosine_accuracy@{k}"])


def test_arama_elle_hesap() -> None:
    result = retrieval_metrics([[2, 0, 1], [1, 2, 0]], [{0}, {0, 2}], ks=(1, 3))
    assert result["mrr@3"] == pytest.approx((1 / 2 + 1 / 2) / 2)
    assert result["recall@1"] == 0.0 and result["recall@3"] == 1.0
    assert cosine_rankings(
        np.array([[1.0, 0.0]]), np.array([[0.0, 1.0], [1.0, 0.0], [1.0, 0.0]]), 2
    ) == [[1, 2]]


def test_varlik_cikarma_ve_olcutler() -> None:
    assert extract_entities(["B-KISI", "I-KISI", "O", "B-YER"]) == {("KISI", 0, 2), ("YER", 3, 4)}
    assert extract_entities(["O", "I-YER", "I-YER"]) == {("YER", 1, 3)}
    assert extract_entities(["B-KISI", "I-YER"]) == {("KISI", 0, 1), ("YER", 1, 2)}
    gold = [["B-KISI", "I-KISI", "O", "B-YER"], ["B-YER", "O"]]
    pred = [["B-KISI", "O", "O", "B-YER"], ["B-YER", "O"]]
    scores = entity_scores(gold, pred)
    assert scores["kesinlik"] == pytest.approx(2 / 3) and scores["duyarlilik"] == pytest.approx(
        2 / 3
    )
    assert token_accuracy(gold, pred) == pytest.approx(5 / 6)


def test_uzunluk_istatistigi_ve_kirpma_uyarisi() -> None:
    assert percentile([1, 2, 3, 4], 50) == 2 and percentile([1, 2, 3, 4], 99) == 4
    assert suggest_limit(100) == 128 and suggest_limit(1) == 32
    stats = length_stats([10, 20, 300, 40], limit=256)
    assert (stats.over_limit, stats.maximum, stats.p50) == (1, 300, 20)
    assert "azami uzunluğu (256 belirteç) aşıyor" in render_stats(stats, "başlık")
    assert "uzunluğu 320 yapın" in render_stats(stats, "başlık")
