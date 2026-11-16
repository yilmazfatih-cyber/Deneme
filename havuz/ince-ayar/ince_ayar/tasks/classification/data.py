"""Sınıflandırma verisi: okuma, sızıntısız katmanlı ayrım, etiket sözlüğü, aşırı örnekleme, sınıf
ağırlıkları ve belirteçleme.

Kim kullanır: `tasks/classification/train.py`, `evaluate.py`, `cli.py` (`dogrula`).

Ayrım: `dogrulama` dosyası verilmişse o kullanılır (test de ayrı dosyadan); verilmemişse eğitim
dosyası `egitim / dogrulama / test` olarak sızıntısız ve sınıf oranları korunarak bölünür.
Aynı tohum aynı ayrımı verir; `degerlendir` aynı test kümesini bu sayede yeniden kurar.

Genişletme: metne ön işlem (ör. küçük harfe çevirme) gerekiyorsa `text_tr` yardımcılarıyla
`prepare_splits` içinde yapın; Python'un `lower()` çağrısı Türkçe'de yanlıştır.
"""

from __future__ import annotations

import random
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ince_ayar.data.records import LabeledText
from ince_ayar.data.split import TEST, TRAIN, VALIDATION, leak_free_split
from ince_ayar.data.validate import load_classification
from ince_ayar.errors import UserError
from ince_ayar.messages import t
from ince_ayar.tasks.classification.config import ClsDataSection


@dataclass
class Splits:
    train: list[LabeledText]
    validation: list[LabeledText]
    test: list[LabeledText]
    labels: list[str]
    notes: list[str] = field(default_factory=list)


def _load(path: str, settings: ClsDataSection, notes: list[str]) -> list[LabeledText]:
    loaded = load_classification(Path(path), settings.kodlama, settings.grup_alani)
    loaded.raise_if_errors()
    notes.extend(issue.render() for issue in loaded.warnings)
    return loaded.rows


def prepare_splits(settings: ClsDataSection) -> Splits:
    """Eğitim / doğrulama / test kümelerini ve etiket listesini kurar."""
    notes: list[str] = []
    rows = _load(settings.egitim, settings, notes)
    if settings.dogrulama:
        train = rows
        validation = _load(settings.dogrulama, settings, notes)
        test = _load(settings.test, settings, notes) if settings.test else []
    else:
        ratios = {
            TRAIN: 1.0 - settings.dogrulama_orani - settings.test_orani,
            VALIDATION: settings.dogrulama_orani,
            TEST: settings.test_orani,
        }
        result = leak_free_split(
            [row.text for row in rows],
            ratios,
            seed=settings.tohum,
            labels=[row.label for row in rows],
            groups=[row.group for row in rows],
            similarity=settings.benzerlik_esigi,
        )
        notes.extend(result.report.notes)
        train = [rows[i] for i in result.indices[TRAIN]]
        validation = [rows[i] for i in result.indices.get(VALIDATION, [])]
        test = [rows[i] for i in result.indices.get(TEST, [])]
    labels = sorted({row.label for row in train})
    if len(labels) < 2:
        raise UserError(t("siniflandirma.tek_sinif"))
    unknown = {row.label for row in validation + test} - set(labels)
    if unknown:
        raise UserError(t("siniflandirma.bilinmeyen_etiket", etiketler=", ".join(sorted(unknown))))
    return Splits(train, validation, test, labels, notes)


def oversample(rows: list[LabeledText], seed: int) -> list[LabeledText]:
    """Her sınıfı en kalabalık sınıfın sayısına kadar tohumlu rastgele çoğaltır."""
    by_label: dict[str, list[LabeledText]] = {}
    for row in rows:
        by_label.setdefault(row.label, []).append(row)
    target = max(len(group) for group in by_label.values())
    rng = random.Random(seed)
    result = list(rows)
    for label in sorted(by_label):
        group = by_label[label]
        result.extend(rng.choice(group) for _ in range(target - len(group)))
    rng.shuffle(result)
    return result


def class_weights(rows: list[LabeledText], labels: list[str]) -> list[float]:
    """Dengeli ağırlıklar: N / (K · nₖ) (scikit-learn'ün "balanced" tanımı)."""
    counts = Counter(row.label for row in rows)
    total, size = len(rows), len(labels)
    return [total / (size * counts[label]) if counts[label] else 0.0 for label in labels]


def token_lengths(tokenizer: Any, rows: list[LabeledText]) -> list[int]:
    """Kırpılmamış belirteç sayıları (özel belirteçler dahil)."""
    return [len(ids) for ids in tokenizer([row.text for row in rows])["input_ids"]]


def to_dataset(tokenizer: Any, rows: list[LabeledText], labels: list[str], max_length: int) -> Any:
    """Eğiticiye verilecek `datasets.Dataset`: input_ids, attention_mask, labels."""
    from datasets import Dataset

    index = {label: position for position, label in enumerate(labels)}
    encoded = tokenizer([row.text for row in rows], truncation=True, max_length=max_length)
    return Dataset.from_dict(
        {
            "input_ids": encoded["input_ids"],
            "attention_mask": encoded["attention_mask"],
            "labels": [index[row.label] for row in rows],
        }
    )
