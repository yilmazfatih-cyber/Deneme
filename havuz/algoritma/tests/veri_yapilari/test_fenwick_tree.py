from __future__ import annotations

import bisect
import itertools

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.fenwick_tree import FenwickTree


def test_hand_checked_example() -> None:
    fw = FenwickTree(6)
    for index, delta in [(0, 5), (3, 2), (5, -1), (3, 4)]:
        fw.add(index, delta)
    assert [fw.prefix_sum(i) for i in range(7)] == [0, 5, 5, 5, 11, 11, 10]
    assert fw.range_sum(1, 4) == 6 and len(fw) == 6


def test_edge_cases() -> None:
    fw = FenwickTree([])
    assert fw.prefix_sum(0) == 0 and fw.lower_bound(1) == 0
    fw = FenwickTree([1, 2])
    with pytest.raises(IndexError):
        fw.add(2, 1)
    with pytest.raises(IndexError):
        fw.prefix_sum(3)
    with pytest.raises(IndexError):
        fw.range_sum(2, 1)
    assert fw.lower_bound(0) == 0 and fw.lower_bound(4) == 2  # hedefe ulaşılamıyor → len


@given(
    st.lists(st.integers(-(10**9), 10**9), max_size=40),
    st.lists(st.tuples(st.integers(0, 39), st.integers(-100, 100)), max_size=40),
)
def test_matches_prefix_sums(values: list[int], updates: list[tuple[int, int]]) -> None:
    fw = FenwickTree(values)
    model = list(values)
    for index, delta in updates:
        if model:
            fw.add(index % len(model), delta)
            model[index % len(model)] += delta
    prefix = [0, *itertools.accumulate(model)]
    assert [fw.prefix_sum(i) for i in range(len(model) + 1)] == prefix


@given(st.lists(st.integers(0, 20), max_size=30), st.integers(-5, 400))
def test_lower_bound_matches_bisect(values: list[int], target: int) -> None:
    fw = FenwickTree(values)
    prefix = list(itertools.accumulate(values))  # negatif olmayan değerler → artan önek
    expected = bisect.bisect_left(prefix, target) if target > 0 else 0
    assert fw.lower_bound(target) == expected
