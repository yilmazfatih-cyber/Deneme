"""Kalibrasyon ve "emin değilim" kararı (yalnız numpy; ONNX çalışma zamanı da kullanır).

Kim kullanır: `train.py` (eğitim sonunda doğrulamada ayar), `evaluate.py`, `disa_aktar/runtime.py`.

- Sıcaklık ölçekleme: olasılık = softmax(logit / T). T doğrulama kümesinde negatif log-olabilirliği
  (NLL) en küçükleyen değerdir. NLL, β = 1/T'ye göre dışbükeydir; altın oran aramasıyla bulunur
  (testte ızgara aramasıyla karşılaştırılır). Doğruluk değişmez (sıralama aynı kalır); yalnız
  "%90 eminim" dediğinde gerçekten ~%90 doğru olması sağlanır. Derin ağlar genelde aşırı emindir (T > 1).
- ECE (beklenen kalibrasyon hatası): güven 15 eşit aralığa bölünür; her aralıkta |doğruluk − ortalama
  güven| örnek oranıyla ağırlıklanıp toplanır.
- Güven eşiği: en yüksek olasılık eşiğin altındaysa karar "emin değilim" (None) olur; karar insana
  bırakılır. `hedef_dogruluk` verilirse doğrulamada o doğruluğu sağlayan EN DÜŞÜK eşik seçilir.

Genişletme: sınıfa özgü eşik gerekiyorsa `Decision` içine sınıf → eşik sözlüğü ekleyin ve paket
biçimini (`disa_aktar/bundle.py`) birlikte güncelleyin.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

_GOLDEN = (math.sqrt(5.0) - 1.0) / 2.0
BETA_RANGE = (0.02, 20.0)  # T aralığı: 0,05 … 50


def softmax(logits: np.ndarray, temperature: float = 1.0) -> np.ndarray:
    scaled = np.asarray(logits, dtype=np.float64) / temperature
    shifted = scaled - scaled.max(axis=-1, keepdims=True)
    exp = np.exp(shifted)
    return np.asarray(exp / exp.sum(axis=-1, keepdims=True))


def nll(logits: np.ndarray, labels: Sequence[int], temperature: float = 1.0) -> float:
    """Ortalama negatif log-olabilirlik (çapraz entropi), sayısal olarak kararlı."""
    scaled = np.asarray(logits, dtype=np.float64) / temperature
    peak = scaled.max(axis=1, keepdims=True)
    log_norm = peak[:, 0] + np.log(np.exp(scaled - peak).sum(axis=1))
    picked = scaled[np.arange(len(labels)), np.asarray(labels, dtype=np.int64)]
    return float(np.mean(log_norm - picked))


def fit_temperature(logits: np.ndarray, labels: Sequence[int], iterations: int = 80) -> float:
    """NLL'yi en küçükleyen T (altın oran araması β = 1/T üzerinde). Boş girdide 1.0."""
    if len(labels) == 0:
        return 1.0
    low, high = BETA_RANGE

    def loss(beta: float) -> float:
        return nll(logits, labels, 1.0 / beta)

    left = high - _GOLDEN * (high - low)
    right = low + _GOLDEN * (high - low)
    loss_left, loss_right = loss(left), loss(right)
    for _ in range(iterations):
        if loss_left <= loss_right:
            high, right, loss_right = right, left, loss_left
            left = high - _GOLDEN * (high - low)
            loss_left = loss(left)
        else:
            low, left, loss_left = left, right, loss_right
            right = low + _GOLDEN * (high - low)
            loss_right = loss(right)
    return float(1.0 / ((low + high) / 2.0))


def expected_calibration_error(
    probabilities: np.ndarray, labels: Sequence[int], bins: int = 15
) -> float:
    """ECE: eşit genişlikli güven aralıklarında |doğruluk − güven| ağırlıklı ortalaması."""
    if len(labels) == 0:
        return 0.0
    confidence = probabilities.max(axis=1)
    correct = probabilities.argmax(axis=1) == np.asarray(labels)
    edges = np.linspace(0.0, 1.0, bins + 1)
    total = 0.0
    for index in range(bins):
        low, high = edges[index], edges[index + 1]
        mask = (confidence > low) & (confidence <= high) if index else confidence <= high
        if mask.any():
            total += mask.mean() * abs(float(correct[mask].mean()) - float(confidence[mask].mean()))
    return float(total)


def threshold_for_accuracy(
    confidences: Sequence[float], correct: Sequence[bool], target: float
) -> tuple[float | None, float]:
    """Hedef doğruluğu sağlayan en düşük güven eşiği: (eşik ya da None, kapsama).

    Örnekler güvene göre azalan sırada kabul edilir; kabul edilenlerin doğruluğu hedefin altına
    düşmeyen en geniş küme seçilir (eşit güvenler bölünmez). Hiçbiri tutmuyorsa (None, 0.0).
    Kaynak: `havuz/ince-ayar/ince_ayar/metrics/classification.py`.
    """
    order = sorted(range(len(confidences)), key=lambda index: -confidences[index])
    best: tuple[float | None, float] = (None, 0.0)
    hits = 0
    for position, index in enumerate(order, start=1):
        hits += 1 if correct[index] else 0
        boundary = position == len(order) or confidences[order[position]] < confidences[index]
        if boundary and hits / position >= target:
            best = (float(confidences[index]), position / len(order))
    return best


@dataclass(frozen=True)
class Decision:
    """Karar kuralı: olasılık = softmax(logit / sicaklik); en yüksek olasılık < esik → None."""

    labels: list[str]
    temperature: float = 1.0
    threshold: float = 0.0

    def probabilities(self, logits: np.ndarray) -> np.ndarray:
        return softmax(logits, self.temperature)

    def decide(self, probabilities: np.ndarray) -> list[str | None]:
        decisions: list[str | None] = []
        for row in probabilities:
            index = int(np.argmax(row))
            decisions.append(self.labels[index] if row[index] >= self.threshold else None)
        return decisions
