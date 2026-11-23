"""Sızıntısız ayrım: eğitim / doğrulama / test — katmanlı, kopya-farkında ve grup-farkında.

Kim kullanır: `train.py`, `plan.py`.

Neden düz rastgele bölme yetmez: aynı fotoğrafın küçültülmüş ya da hafif kırpılmış kopyası hem
eğitimde hem testte olursa model onu "ezberden" bilir; test başarısı olduğundan yüksek görünür.
Burada:
- algısal özet uzaklığı ≤ `kopya_esigi` olan görüntüler (zincirleme) AYNI gruba,
- `grup_deseni` anahtarı aynı olan görüntüler (aynı ürünün fotoğrafları) AYNI gruba,
- gruplar parçalara dağıtılır; sınıf oranları her parçada korunmaya çalışılır (katmanlı),
- aynı tohum aynı sonucu verir.
Grup atama algoritması: `havuz/ince-ayar/ince_ayar/data/split.py` (kopyalanıp uyarlandı): büyük
gruplar önce, her grup hedefe en çok açığı olan parçaya.
Yakın kopya olup etiketi FARKLI çiftler (aynı fotoğraf iki sınıfta) `conflicts` listesine düşer.

Genişletme: yeni bir "aynı tarafta tut" kuralı için `plan_split` içinde `finder.union` çağıran bir
adım ekleyin; `tests/test_split.py` içindeki sızıntı testi onu da kapsamalıdır.
"""

from __future__ import annotations

import random
from collections import Counter, defaultdict
from dataclasses import dataclass, field

import numpy as np

from goruntu.errors import UserError
from goruntu.kopya.groups import UnionFind, cross_pairs, near_pairs
from goruntu.messages import t

TRAIN, VALIDATION, TEST = "egitim", "dogrulama", "test"
SPLIT_ORDER = (TRAIN, VALIDATION, TEST)


@dataclass
class SplitPlan:
    """`indices[parça]`: o parçaya düşen örneklerin sıra numaraları (artan)."""

    indices: dict[str, list[int]]
    group_of: list[int]
    duplicate_pairs: int = 0
    largest_group: int = 1
    conflicts: list[tuple[int, int]] = field(default_factory=list)
    moved_labels: list[int] = field(
        default_factory=list
    )  # eğitimde hiç olmadığı için taşınan sınıflar


def _ratios(validation: float, test: float) -> dict[str, float]:
    ratios = {TRAIN: 1.0 - validation - test, VALIDATION: validation, TEST: test}
    return {name: value for name, value in ratios.items() if value > 0}


def _assign(
    members: dict[int, list[int]], labels: list[int], ratios: dict[str, float], seed: int
) -> dict[int, str]:
    totals = Counter(labels)
    targets = {s: {lab: r * n for lab, n in totals.items()} for s, r in ratios.items()}
    current: dict[str, Counter[int]] = {s: Counter() for s in ratios}
    order = sorted(members)
    random.Random(seed).shuffle(order)
    order.sort(key=lambda group: -len(members[group]))
    assignment: dict[int, str] = {}
    for group in order:
        counts = Counter(labels[index] for index in members[group])

        def score(split: str, counts: Counter[int] = counts) -> tuple[float, float]:
            gain = sum(
                min(n, max(0.0, targets[split][lab] - current[split][lab]))
                for lab, n in counts.items()
            )
            target_total = sum(targets[split].values())
            remaining = (target_total - sum(current[split].values())) / max(target_total, 1e-9)
            return gain, remaining

        best = max(ratios, key=score)  # eşitlikte `ratios` sırası (eğitim önce)
        assignment[group] = best
        current[best].update(counts)
    return assignment


def _repair(
    assignment: dict[int, str],
    members: dict[int, list[int]],
    labels: list[int],
    ratios: dict[str, float],
) -> list[int]:
    """Boş kalan parçayı doldurur; eğitimde hiç bulunmayan sınıfı eğitime taşır (taşınanlar döner)."""
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
    moved_labels = []
    for label in sorted(set(labels) - train_labels):
        holders = [g for g in assignment if any(labels[i] == label for i in members[g])]
        moved = min(holders, key=lambda group: (len(members[group]), group))
        by_split[assignment[moved]].remove(moved)
        by_split[TRAIN].append(moved)
        assignment[moved] = TRAIN
        moved_labels.append(label)
    return moved_labels


def plan_split(
    labels: list[int],
    hashes: np.ndarray,
    groups: list[str | None],
    validation: float,
    test: float,
    threshold: int,
    seed: int,
) -> SplitPlan:
    """Örnekleri (etiket numarası, özet matrisi, grup anahtarı) sızıntısız parçalara böler."""
    count = len(labels)
    finder = UnionFind(count)
    pairs = near_pairs(hashes, threshold) if threshold >= 0 else []
    for pair in pairs:
        finder.union(pair.left, pair.right)
    first_of: dict[str, int] = {}
    for index, key in enumerate(groups):
        if key is not None:
            finder.union(index, first_of.setdefault(key, index))
    group_of = finder.labels()
    members: dict[int, list[int]] = defaultdict(list)
    for index, group in enumerate(group_of):
        members[group].append(index)
    ratios = _ratios(validation, test)
    if len(members) < len(ratios):
        raise UserError(t("ayrim.az_grup", grup=len(members), parca=len(ratios)))
    assignment = _assign(members, labels, ratios, seed)
    moved = _repair(assignment, members, labels, ratios)
    indices: dict[str, list[int]] = {name: [] for name in ratios}
    for group, split in assignment.items():
        indices[split].extend(members[group])
    for rows in indices.values():
        rows.sort()
    conflicts = [(p.left, p.right) for p in pairs if labels[p.left] != labels[p.right]]
    largest = max(len(rows) for rows in members.values())
    return SplitPlan(indices, group_of, len(pairs), largest, conflicts, moved)


def leaks_between(
    left: np.ndarray, right: np.ndarray, threshold: int
) -> list[tuple[int, int, int]]:
    """Hazır verilmiş iki parça arasında yakın kopya çiftleri: (sol sıra, sağ sıra, uzaklık)."""
    if threshold < 0:
        return []
    return [(p.left, p.right, p.distance) for p in cross_pairs(left, right, threshold)]
