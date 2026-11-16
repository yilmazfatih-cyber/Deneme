"""Sızıntısız ayrım: veriyi eğitim / doğrulama / test parçalarına böler.

Kim kullanır: her görevin `egit` eylemi (ayrı doğrulama dosyası verilmediyse) ve `veri ayir`.

Neden düz rastgele bölme yetmez: aynı ya da neredeyse aynı örnek hem eğitimde hem doğrulamada
bulunursa ölçüt olduğundan iyi görünür ("sızıntı"). Burada:
- tam ve yakın yinelemeler (`data/neardup.py`) **aynı tarafa** gider,
- `grup` anahtarı aynı olan örnekler (aynı müşteri, aynı belge…) **aynı tarafa** gider,
- etiket varsa sınıf oranları her parçada korunmaya çalışılır (katmanlı ayrım),
- aynı tohum aynı sonucu verir.

Genişletme: yeni bir "aynı tarafta tut" kuralı için `build_groups` içine bir birleştirme adımı
ekleyin; `tests/test_split.py` içindeki sızıntı testi onu da kapsamalıdır.
"""

from __future__ import annotations

import random
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from ince_ayar.data.neardup import find_duplicate_groups
from ince_ayar.errors import UserError
from ince_ayar.messages import t

TRAIN, VALIDATION, TEST = "egitim", "dogrulama", "test"
SPLIT_ORDER = (TRAIN, VALIDATION, TEST)


@dataclass(frozen=True)
class SplitReport:
    sizes: dict[str, int]
    label_counts: dict[str, dict[str, int]]
    group_count: int
    exact_duplicates: int
    near_duplicates: int
    largest_group: int
    notes: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class SplitResult:
    """`indices[parça]`: o parçaya düşen örneklerin sıra numaraları (artan sırada)."""

    indices: dict[str, list[int]]
    group_of: list[int]
    report: SplitReport


def build_groups(
    texts: list[str], groups: list[str | None] | None, similarity: float
) -> tuple[list[int], int, int]:
    """Her örneğe grup numarası verir: yinelemeler + açık grup anahtarı birleştirilir."""
    duplicates = find_duplicate_groups(texts, similarity)
    parent = list(range(duplicates.group_count))

    def find(item: int) -> int:
        while parent[item] != item:
            parent[item] = parent[parent[item]]
            item = parent[item]
        return item

    if groups is not None:
        first_of_key: dict[str, int] = {}
        for index, key in enumerate(groups):
            if key is None:
                continue
            root = find(duplicates.group_of[index])
            other = find(first_of_key.setdefault(key, root))
            if other != root:
                parent[max(root, other)] = min(root, other)
    numbering: dict[int, int] = {}
    group_of = [numbering.setdefault(find(g), len(numbering)) for g in duplicates.group_of]
    return group_of, duplicates.exact_duplicates, duplicates.near_duplicates


def _normalized_ratios(ratios: dict[str, float]) -> dict[str, float]:
    active = {name: ratios.get(name, 0.0) for name in SPLIT_ORDER if ratios.get(name, 0.0) > 0}
    if TRAIN not in active:
        raise UserError(t("ayrim.egitim_orani"))
    total = sum(active.values())
    return {name: value / total for name, value in active.items()}


def _assign(
    members: dict[int, list[int]], labels: list[str], ratios: dict[str, float], seed: int
) -> dict[int, str]:
    """Grupları parçalara dağıtır: büyük gruplar önce, her grup en çok açığı olan parçaya."""
    label_totals = Counter(labels)
    targets = {s: {lab: r * n for lab, n in label_totals.items()} for s, r in ratios.items()}
    current: dict[str, Counter[str]] = {s: Counter() for s in ratios}
    order = sorted(members)
    random.Random(seed).shuffle(order)
    order.sort(key=lambda group: -len(members[group]))
    assignment: dict[int, str] = {}
    for group in order:
        counts = Counter(labels[index] for index in members[group])

        def score(split: str, counts: Counter[str] = counts) -> tuple[float, float]:
            gain = sum(
                min(n, max(0.0, targets[split][lab] - current[split][lab]))
                for lab, n in counts.items()
            )
            target_total = sum(targets[split].values())
            remaining = (target_total - sum(current[split].values())) / max(target_total, 1e-9)
            return gain, remaining

        best = max(ratios, key=score)  # eşitlikte `ratios` sırası (eğitim önce) geçerlidir
        assignment[group] = best
        current[best].update(counts)
    return assignment


def _repair(
    assignment: dict[int, str],
    members: dict[int, list[int]],
    labels: list[str],
    ratios: dict[str, float],
) -> list[str]:
    """Boş kalan parçayı ve eğitimde hiç bulunmayan etiketi düzeltir; notları döndürür."""
    notes: list[str] = []
    by_split: dict[str, list[int]] = defaultdict(list)
    for group, split in assignment.items():
        by_split[split].append(group)
    for split in ratios:
        if split == TRAIN or by_split[split] or len(by_split[TRAIN]) < 2:
            continue
        moved = min(by_split[TRAIN], key=lambda group: (len(members[group]), group))
        by_split[TRAIN].remove(moved)
        by_split[split].append(moved)
        assignment[moved] = split
    train_labels = {labels[i] for group in by_split[TRAIN] for i in members[group]}
    for label in sorted(set(labels) - train_labels):
        holders = [g for g in assignment if any(labels[i] == label for i in members[g])]
        moved = min(holders, key=lambda group: (len(members[group]), group))
        by_split[assignment[moved]].remove(moved)
        by_split[TRAIN].append(moved)
        assignment[moved] = TRAIN
        notes.append(t("ayrim.etiket_egitime", etiket=label))
    return notes


def leak_free_split(
    texts: list[str],
    ratios: dict[str, float],
    seed: int,
    labels: list[str] | None = None,
    groups: list[str | None] | None = None,
    similarity: float = 0.85,
) -> SplitResult:
    """Örnekleri sızıntısız böler. `ratios` örn. {"egitim": 0.8, "dogrulama": 0.1, "test": 0.1}."""
    if not texts:
        raise UserError(t("ayrim.bos"))
    normalized = _normalized_ratios(ratios)
    group_of, exact, near = build_groups(texts, groups, similarity)
    members: dict[int, list[int]] = defaultdict(list)
    for index, group in enumerate(group_of):
        members[group].append(index)
    if len(members) < len(normalized):
        raise UserError(t("ayrim.az_grup", grup=len(members), parca=len(normalized)))
    strata = labels if labels is not None else [""] * len(texts)
    assignment = _assign(members, strata, normalized, seed)
    notes = _repair(assignment, members, strata, normalized)
    indices: dict[str, list[int]] = {name: [] for name in normalized}
    for group, split in assignment.items():
        indices[split].extend(members[group])
    for rows in indices.values():
        rows.sort()
    label_counts = {
        name: dict(sorted(Counter(strata[i] for i in rows).items()))
        for name, rows in indices.items()
    }
    report = SplitReport(
        sizes={name: len(rows) for name, rows in indices.items()},
        label_counts=label_counts if labels is not None else {},
        group_count=len(members),
        exact_duplicates=exact,
        near_duplicates=near,
        largest_group=max(len(rows) for rows in members.values()),
        notes=notes,
    )
    return SplitResult(indices, group_of, report)


def count_leaks(train_texts: list[str], other_texts: list[str], similarity: float = 0.85) -> int:
    """Ayrı verilmiş iki dosya arasında sızıntı sayar: eğitimdekine benzeyen `other` örnekleri."""
    if not train_texts or not other_texts:
        return 0
    grouping = find_duplicate_groups([*train_texts, *other_texts], similarity)
    train_groups = set(grouping.group_of[: len(train_texts)])
    return sum(1 for group in grouping.group_of[len(train_texts) :] if group in train_groups)
