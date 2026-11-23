"""Ölçüt ve kalibrasyon testleri: scikit-learn ve torch başvurularıyla, elle hesaplanmış ECE ile,
ızgara aramasıyla karşılaştırma."""

from __future__ import annotations

import numpy as np
import pytest
import torch
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_recall_fscore_support

from goruntu.siniflandirma.calibration import (
    Decision,
    expected_calibration_error,
    fit_temperature,
    nll,
    softmax,
    threshold_for_accuracy,
)
from goruntu.siniflandirma.config import ThresholdSection
from goruntu.siniflandirma.evaluate import evaluate_logits, render_text, tune_decision
from goruntu.siniflandirma.metrics import classification_report, confident_mistakes, confused_pairs

LABELS = ["ayakkabı", "çanta", "saat", "şapka"]


def _random_case(seed: int, size: int = 200) -> tuple[list[int], list[int]]:
    rng = np.random.default_rng(seed)
    truth = rng.integers(0, 4, size).tolist()
    predicted = [t if rng.random() < 0.6 else int(rng.integers(0, 4)) for t in truth]
    return truth, predicted


@pytest.mark.parametrize("seed", range(5))
def test_scikit_learn_ile_ayni(seed: int) -> None:
    truth, predicted = _random_case(seed)
    report = classification_report(truth, predicted, LABELS)
    assert report.accuracy == pytest.approx(accuracy_score(truth, predicted))
    assert report.macro_f1 == pytest.approx(f1_score(truth, predicted, average="macro"))
    precision, recall, f1, support = precision_recall_fscore_support(
        truth, predicted, labels=range(4), zero_division=0
    )
    for index, label in enumerate(LABELS):
        score = report.per_class[label]
        assert (score.precision, score.recall, score.f1, score.support) == pytest.approx(
            (precision[index], recall[index], f1[index], support[index])
        )
    assert report.confusion == confusion_matrix(truth, predicted, labels=range(4)).tolist()


def test_hic_gorulmeyen_sinif_makro_f1_disinda() -> None:
    report = classification_report([0, 0, 1], [0, 1, 1], LABELS)
    assert report.macro_f1 == pytest.approx(f1_score([0, 0, 1], [0, 1, 1], average="macro"))


def test_karistirilan_ciftler_ve_emin_yanlislar() -> None:
    report = classification_report([0, 0, 0, 1, 1], [1, 1, 0, 1, 0], LABELS)
    pairs = confused_pairs(report)
    assert pairs[0] == {"gercek": "ayakkabı", "tahmin": "çanta", "sayi": 2, "oran": pytest.approx(2 / 3)}
    probabilities = np.asarray([[0.1, 0.9, 0, 0], [0.6, 0.4, 0, 0], [0.3, 0.7, 0, 0]])
    mistakes = confident_mistakes(probabilities, [0, 0, 0], ["a", "b", "c"], LABELS)
    assert [m["dosya"] for m in mistakes] == ["a", "c"]


def test_nll_torch_ile_ayni() -> None:
    logits = np.random.default_rng(0).normal(size=(50, 4)) * 3
    labels = np.random.default_rng(1).integers(0, 4, 50)
    expected = torch.nn.functional.cross_entropy(torch.tensor(logits / 1.7), torch.tensor(labels))
    assert nll(logits, labels.tolist(), 1.7) == pytest.approx(float(expected), rel=1e-9)


def test_sicaklik_izgara_aramasiyla_ayni() -> None:
    rng = np.random.default_rng(3)
    labels = rng.integers(0, 4, 300)
    logits = rng.normal(size=(300, 4))
    logits[np.arange(300), labels] += 2.0
    logits *= 4.0  # aşırı emin model → T > 1 beklenir
    fitted = fit_temperature(logits, labels.tolist())
    grid = np.exp(np.linspace(np.log(0.05), np.log(50), 4000))
    best = grid[np.argmin([nll(logits, labels.tolist(), t) for t in grid])]
    assert fitted == pytest.approx(best, rel=2e-3)
    assert fitted > 1.0
    assert nll(logits, labels.tolist(), fitted) <= nll(logits, labels.tolist(), 1.0)


def test_ece_elle_hesap() -> None:
    probabilities = np.asarray([[0.9, 0.1], [0.8, 0.2], [0.6, 0.4], [0.3, 0.7]])
    labels = [0, 1, 0, 1]
    # aralıklar (15 eşit): 0.9 → [0.8667, 0.9333], 0.8 → (0.7333, 0.8], 0.6 → (0.5333, 0.6], 0.7 → (0.6667, 0.7333]
    expected = 0.25 * (abs(1 - 0.9) + abs(0 - 0.8) + abs(1 - 0.6) + abs(1 - 0.7))
    assert expected_calibration_error(probabilities, labels) == pytest.approx(expected)


def test_hedef_dogruluk_esigi() -> None:
    confidences = [0.95, 0.9, 0.8, 0.7, 0.6, 0.5]
    correct = [True, True, True, False, True, False]
    threshold, coverage = threshold_for_accuracy(confidences, correct, 0.75)
    assert threshold == 0.6 and coverage == pytest.approx(5 / 6)
    assert threshold_for_accuracy([0.9], [False], 0.5) == (None, 0.0)


def test_karar_kurali_emin_degilim() -> None:
    decision = Decision(["a", "b"], temperature=1.0, threshold=0.7)
    assert decision.decide(np.asarray([[0.8, 0.2], [0.55, 0.45]])) == ["a", None]
    assert np.allclose(decision.probabilities(np.asarray([[0.0, 0.0]])), [[0.5, 0.5]])
    assert np.allclose(softmax(np.asarray([[1000.0, 0.0]])), [[1.0, 0.0]])  # taşma yok


def test_rapor_uctan_uca() -> None:
    rng = np.random.default_rng(4)
    labels = rng.integers(0, 4, 120)
    logits = rng.normal(size=(120, 4)) * 2
    logits[np.arange(120), labels] += 3
    settings = ThresholdSection(kalibrasyon=True, hedef_dogruluk=0.95)
    decision, notes = tune_decision(logits, labels.tolist(), LABELS, settings)
    result = evaluate_logits(logits, labels.tolist(), [f"{i}.jpg" for i in range(120)], decision)
    assert result["kalibrasyon"]["nll_sonra"] <= result["kalibrasyon"]["nll_once"] + 1e-12
    assert 0 < result["emin_degilim"]["kapsama"] <= 1 and notes
    text = render_text(result)
    assert "Karışıklık matrisi" in text and "şapka" in text
