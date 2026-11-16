"""Varlık tanıma ölçütleri: BIO etiketlerinden varlık çıkarma, varlık düzeyi kesinlik/duyarlılık/F1.

Kim kullanır: `tasks/ner/*`.

Tanımlar:
- Varlık = (tür, başlangıç, bitiş) üçlüsü; tam eşleşme gerekir (sınır ya da tür farklıysa yanlış).
- Ardından aynı türden `I-` gelmeyen `B-` tek sözcüklük varlıktır. Önünde `B-`/`I-` olmayan bir `I-`
  (modelin ürettiği bozuk dizi) yeni bir varlık başlatır (seqeval'in varsayılan davranışı gibi).
- F1 mikro ortalamadır (bütün varlıklar birlikte sayılır); tür başına sonuçlar ayrıca verilir.

Genişletme: kısmi eşleşme ölçütü gerekiyorsa ayrı bir işlev yazın; bu işlevler katı tanımdır.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence

Entity = tuple[str, int, int]


def extract_entities(tags: Sequence[str]) -> set[Entity]:
    """BIO dizisinden (tür, başlangıç, bitiş_hariç) varlıkları çıkarır."""
    entities: set[Entity] = set()
    kind: str | None = None
    start = 0
    for position, tag in enumerate([*tags, "O"]):
        continues = tag.startswith("I-") and kind == tag[2:]
        if kind is not None and not continues:
            entities.add((kind, start, position))
            kind = None
        if tag.startswith("B-") or (tag.startswith("I-") and not continues):
            kind, start = tag[2:], position
    return entities


def _prf(correct: int, predicted: int, actual: int) -> dict[str, float]:
    precision = correct / predicted if predicted else 0.0
    recall = correct / actual if actual else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"kesinlik": precision, "duyarlilik": recall, "f1": f1}


def entity_scores(
    gold: Sequence[Sequence[str]], predicted: Sequence[Sequence[str]]
) -> dict[str, object]:
    """Cümle listeleri üzerinden mikro varlık ölçütleri ve tür başına ölçütler."""
    correct: Counter[str] = Counter()
    found: Counter[str] = Counter()
    actual: Counter[str] = Counter()
    for truth, guess in zip(gold, predicted, strict=True):
        true_entities, guessed = extract_entities(truth), extract_entities(guess)
        actual.update(entity[0] for entity in true_entities)
        found.update(entity[0] for entity in guessed)
        correct.update(entity[0] for entity in true_entities & guessed)
    kinds = sorted(set(actual) | set(found))
    return {
        **_prf(sum(correct.values()), sum(found.values()), sum(actual.values())),
        "tur": {kind: _prf(correct[kind], found[kind], actual[kind]) for kind in kinds},
    }


def token_accuracy(gold: Sequence[Sequence[str]], predicted: Sequence[Sequence[str]]) -> float:
    pairs = [
        (g, p)
        for truth, guess in zip(gold, predicted, strict=True)
        for g, p in zip(truth, guess, strict=True)
    ]
    return sum(1 for g, p in pairs if g == p) / len(pairs) if pairs else 0.0
