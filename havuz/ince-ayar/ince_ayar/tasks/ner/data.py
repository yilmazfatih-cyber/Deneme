"""Varlık tanıma verisi: okuma, sızıntısız ayrım, etiket listesi ve sözcük→alt sözcük hizalaması.

Kim kullanır: `tasks/ner/train.py`, `predict.py`.

Hizalama kuralı: tokenizer bir sözcüğü birden çok parçaya bölebilir ("Ankara'ya" → "Ankara", "'",
"ya"). Etiket yalnız sözcüğün **ilk** parçasına verilir; diğer parçalar ve özel belirteçler -100
olur (kayba girmez). Tahminde de yalnız ilk parçanın kararı okunur.

Genişletme: başka bir hizalama (ör. her parçaya `I-`) isterseniz `align_labels` içini değiştirin ve
`tests/test_ner.py` beklentisini güncelleyin.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ince_ayar.data.records import TaggedSentence
from ince_ayar.data.split import TRAIN, VALIDATION, leak_free_split
from ince_ayar.data.validate import load_tagged
from ince_ayar.tasks.ner.config import NerDataSection

IGNORE = -100


@dataclass
class NerSplits:
    train: list[TaggedSentence]
    validation: list[TaggedSentence]
    labels: list[str]
    notes: list[str] = field(default_factory=list)


def label_list(rows: list[TaggedSentence]) -> list[str]:
    """'O' + her tür için B- ve I- (veride I- görülmese de modelde yer açılır)."""
    kinds = sorted({tag[2:] for row in rows for tag in row.tags if tag != "O"})
    return ["O", *[f"{prefix}-{kind}" for kind in kinds for prefix in ("B", "I")]]


def prepare_tagged(settings: NerDataSection) -> NerSplits:
    loaded = load_tagged(Path(settings.egitim), settings.kodlama, settings.grup_alani)
    loaded.raise_if_errors()
    notes = [issue.render() for issue in loaded.warnings]
    if settings.dogrulama:
        held = load_tagged(Path(settings.dogrulama), settings.kodlama, settings.grup_alani)
        held.raise_if_errors()
        train, validation = loaded.rows, held.rows
    else:
        rows = loaded.rows
        result = leak_free_split(
            [" ".join(row.words) for row in rows],
            {TRAIN: 1.0 - settings.dogrulama_orani, VALIDATION: settings.dogrulama_orani},
            seed=settings.tohum,
            groups=[row.group for row in rows],
            similarity=settings.benzerlik_esigi,
        )
        notes.extend(result.report.notes)
        train = [rows[i] for i in result.indices[TRAIN]]
        validation = [rows[i] for i in result.indices.get(VALIDATION, [])]
    return NerSplits(train, validation, label_list(train + validation), notes)


def align_labels(word_ids: list[int | None], tags: list[str], index: dict[str, int]) -> list[int]:
    """Sözcük etiketlerini alt sözcük konumlarına taşır (yalnız ilk parça etiketlenir)."""
    labels: list[int] = []
    previous: int | None = None
    for word in word_ids:
        labels.append(IGNORE if word is None or word == previous else index[tags[word]])
        previous = word
    return labels


def to_dataset(
    tokenizer: Any, rows: list[TaggedSentence], labels: list[str], max_length: int
) -> Any:
    from datasets import Dataset

    index = {label: position for position, label in enumerate(labels)}
    encoded = tokenizer(
        [row.words for row in rows],
        is_split_into_words=True,
        truncation=True,
        max_length=max_length,
    )
    aligned = [align_labels(encoded.word_ids(i), row.tags, index) for i, row in enumerate(rows)]
    return Dataset.from_dict(
        {
            "input_ids": encoded["input_ids"],
            "attention_mask": encoded["attention_mask"],
            "labels": aligned,
        }
    )
