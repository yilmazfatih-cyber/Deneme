from __future__ import annotations

from hypothesis import given
from hypothesis import strategies as st

from algoritma.kaliplar.union_find_applications import (
    first_redundant_cable,
    group_records,
    islands_after_each_drain,
)


def _components(n: int, edges: list[tuple[int, int]]) -> list[list[int]]:
    """Başvuru: etiket yayma (her kenarda etiketleri eşitle, değişmeyene dek)."""
    label = list(range(n))
    changed = True
    while changed:
        changed = False
        for a, b in edges:
            low = min(label[a], label[b])
            if label[a] != low or label[b] != low:
                label[a] = label[b] = low
                changed = True
    groups: dict[int, list[int]] = {}
    for v in range(n):
        groups.setdefault(label[v], []).append(v)
    return sorted(groups.values())


def test_hand_checked_examples() -> None:
    assert islands_after_each_drain(1, 3, [(0, 0), (0, 2), (0, 1), (0, 1)]) == [1, 2, 1, 1]
    assert first_redundant_cable(3, [(0, 1), (1, 2)]) is None
    assert group_records([["a"], ["b"], ["c", "a"], ["b", "c"]]) == [[0, 1, 2, 3]]


def test_edge_cases() -> None:
    assert islands_after_each_drain(3, 3, []) == [] and group_records([]) == []
    assert first_redundant_cable(2, [(1, 1)]) == (1, 1)  # öz döngü hemen gereksiz


@given(st.integers(1, 4), st.integers(1, 4), st.data())
def test_islands_match_component_count(rows: int, cols: int, data: st.DataObject) -> None:
    cells = st.tuples(st.integers(0, rows - 1), st.integers(0, cols - 1))
    drained = data.draw(st.lists(cells, max_size=12))
    land: set[tuple[int, int]] = set()
    expected = []
    for cell in drained:
        land.add(cell)
        ids = {c: i for i, c in enumerate(sorted(land))}
        edges = [(ids[a], ids[b]) for a in land for b in land
                 if abs(a[0] - b[0]) + abs(a[1] - b[1]) == 1]  # fmt: skip
        expected.append(len(_components(len(ids), edges)))
    assert islands_after_each_drain(rows, cols, drained) == expected


@given(st.integers(1, 7), st.lists(st.tuples(st.integers(0, 6), st.integers(0, 6)), max_size=10))
def test_redundant_cable_matches_brute_force(n: int, raw: list[tuple[int, int]]) -> None:
    cables = [(a % n, b % n) for a, b in raw]
    expected = None
    for k, (a, b) in enumerate(cables):
        if any(a in g and b in g for g in _components(n, cables[:k])):
            expected = (a, b)
            break
    assert first_redundant_cable(n, cables) == expected


@given(st.lists(st.lists(st.sampled_from("pqrstu"), max_size=3), max_size=8))
def test_groups_match_brute_force(records: list[list[str]]) -> None:
    edges = [(i, j) for i in range(len(records)) for j in range(i + 1, len(records))
             if set(records[i]) & set(records[j])]  # fmt: skip
    assert group_records(records) == _components(len(records), edges)
