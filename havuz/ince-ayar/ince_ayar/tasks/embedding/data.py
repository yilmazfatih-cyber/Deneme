"""Gömme verisi: (sorgu, olumlu[, olumsuz]) çiftlerini okur, sızıntısız ayırır, eğitim kümesi ve
değerlendirme derlemi kurar.

Kim kullanır: `tasks/embedding/train.py`, `evaluate.py`, `cli.py`.

Sızıntı kuralı: aynı **olumlu belgeye** bağlanan sorgular aynı tarafa gider (grup anahtarı verilmemiş
olsa bile). Aksi hâlde doğrulamadaki belge eğitimde görülmüş olur ve ölçüt şişer.

Eğitim kümesi biçimi: bütün satırlarda olumsuz varsa üçlü (sorgu, olumlu, olumsuz); hiçbirinde
yoksa çift; karışıksa iki ayrı küme (sentence-transformers çoklu küme eğitimi).

Genişletme: başka bir derlem kaynağı için `extra_documents` işlevine dal ekleyin.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ince_ayar.data.records import Pair
from ince_ayar.data.split import TRAIN, VALIDATION, leak_free_split
from ince_ayar.data.validate import load_pairs
from ince_ayar.errors import UserError
from ince_ayar.io_utils import read_rows, read_text
from ince_ayar.messages import t
from ince_ayar.tasks.embedding.config import EmbDataSection
from ince_ayar.text_tr import fold_for_match


@dataclass
class PairSplits:
    train: list[Pair]
    validation: list[Pair]
    notes: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class RetrievalSet:
    """Değerlendirme: her sorgunun ilgili belge sıra numaraları derlemin içindedir."""

    queries: list[str]
    documents: list[str]
    relevant: list[set[int]]


def _group_key(row: Pair) -> str:
    return row.group if row.group is not None else "olumlu:" + fold_for_match(row.positive)


def prepare_pairs(settings: EmbDataSection) -> PairSplits:
    loaded = load_pairs(Path(settings.egitim), settings.kodlama, settings.grup_alani)
    loaded.raise_if_errors()
    notes = [issue.render() for issue in loaded.warnings]
    if settings.dogrulama:
        held = load_pairs(Path(settings.dogrulama), settings.kodlama, settings.grup_alani)
        held.raise_if_errors()
        return PairSplits(loaded.rows, held.rows, notes)
    rows = loaded.rows
    result = leak_free_split(
        [row.query for row in rows],
        {TRAIN: 1.0 - settings.dogrulama_orani, VALIDATION: settings.dogrulama_orani},
        seed=settings.tohum,
        groups=[_group_key(row) for row in rows],
        similarity=settings.benzerlik_esigi,
    )
    notes.extend(result.report.notes)
    train = [rows[i] for i in result.indices[TRAIN]]
    validation = [rows[i] for i in result.indices.get(VALIDATION, [])]
    return PairSplits(train, validation, notes)


def extra_documents(path: str) -> list[str]:
    """Ek belgeler: .txt (satır başına bir belge) ya da .jsonl/.csv (`metin` alanı)."""
    if not path:
        return []
    file = Path(path)
    if file.suffix == ".txt":
        return [line.strip() for line in read_text(file).splitlines() if line.strip()]
    return [str(raw.data["metin"]) for raw in read_rows(file) if raw.data and raw.data.get("metin")]


def retrieval_set(pairs: list[Pair], extra: list[str]) -> RetrievalSet:
    """Derlem = olumlu + olumsuz + ek belgeler (yinelenmeden); ilgili = sorgunun olumlusu."""
    documents: list[str] = []
    index: dict[str, int] = {}

    def add(text: str) -> int:
        if text not in index:
            index[text] = len(documents)
            documents.append(text)
        return index[text]

    relevant = [{add(pair.positive)} for pair in pairs]
    for pair in pairs:
        for negative in pair.negatives:
            add(negative)
    for text in extra:
        add(text)
    if not pairs:
        raise UserError(t("gomme.dogrulama_yok"))
    return RetrievalSet([pair.query for pair in pairs], documents, relevant)


def training_datasets(pairs: list[Pair]) -> Any:
    """sentence-transformers eğiticisinin beklediği küme(ler)."""
    from datasets import Dataset

    with_negative = [p for p in pairs if p.negatives]
    without = [p for p in pairs if not p.negatives]
    triplets = Dataset.from_dict(
        {
            "sorgu": [p.query for p in with_negative],
            "olumlu": [p.positive for p in with_negative],
            "olumsuz": [p.negatives[0] for p in with_negative],
        }
    )
    couples = Dataset.from_dict(
        {"sorgu": [p.query for p in without], "olumlu": [p.positive for p in without]}
    )
    if not with_negative:
        return couples
    if not without:
        return triplets
    return {"uclu": triplets, "cift": couples}
