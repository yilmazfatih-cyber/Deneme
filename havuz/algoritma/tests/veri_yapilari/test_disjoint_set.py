from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.disjoint_set import DisjointSet


def test_hand_checked_example() -> None:
    ds = DisjointSet(6)
    for a, b in [(0, 1), (1, 2), (4, 5)]:
        ds.union(a, b)
    assert ds.groups() == [[0, 1, 2], [3], [4, 5]]
    assert ds.set_count == 3 and ds.size_of(2) == 3 and len(ds) == 6
    assert ds.find(2) == ds.find(0)


def test_edge_cases() -> None:
    assert DisjointSet(0).groups() == []
    with pytest.raises(ValueError):
        DisjointSet(-1)
    ds = DisjointSet(1)
    assert not ds.union(0, 0) and ds.connected(0, 0)


def test_long_chain_without_recursion() -> None:
    n = 100_000
    ds = DisjointSet(n)
    for i in range(n - 1):
        ds.union(i, i + 1)
    assert ds.set_count == 1 and ds.size_of(0) == n and ds.connected(0, n - 1)


@given(st.lists(st.tuples(st.integers(0, 14), st.integers(0, 14)), max_size=40))
def test_matches_label_propagation(pairs: list[tuple[int, int]]) -> None:
    n = 15
    ds = DisjointSet(n)
    label = list(range(n))  # kaba kuvvet: birleşince tüm etiketleri yeniden yaz
    for a, b in pairs:
        merged = label[a] != label[b]
        assert ds.union(a, b) == merged
        if merged:
            old, new = label[b], label[a]
            label = [new if x == old else x for x in label]
    for a in range(n):
        for b in range(n):
            assert ds.connected(a, b) == (label[a] == label[b])
        assert ds.size_of(a) == label.count(label[a])
    assert ds.set_count == len(set(label))
