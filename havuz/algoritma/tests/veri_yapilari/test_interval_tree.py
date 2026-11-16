from __future__ import annotations

import random

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.interval_tree import IntervalTree


def test_hand_checked_example() -> None:
    t = IntervalTree()
    meetings = [(9, 10), (9.5, 11), (13, 14), (10, 10), (9, 10)]  # tekrar eden ve nokta aralık
    for start, end in meetings:
        t.insert(start, end)
    assert len(t) == 5
    assert t.stabbing(10) == [(9, 10), (9, 10), (9.5, 11), (10, 10)]
    assert t.overlapping(11.5, 12.5) == []
    assert t.remove(9, 10) and t.stabbing(9) == [(9, 10)]
    assert list(t) == sorted([(9, 10), (9.5, 11), (13, 14), (10, 10)])


def test_edge_cases() -> None:
    t = IntervalTree()
    assert t.overlapping(-1e9, 1e9) == [] and not t.remove(1, 2)
    with pytest.raises(ValueError):
        t.insert(5, 4)
    t.insert(-5, -5)
    assert t.overlapping(-5, -5) == [(-5, -5)] and t.overlapping(-4.9, 0) == []


INTERVAL = st.tuples(st.integers(-20, 20), st.integers(0, 10)).map(lambda p: (p[0], p[0] + p[1]))


@given(
    st.lists(st.tuples(st.booleans(), INTERVAL), max_size=80),
    st.lists(INTERVAL, max_size=10),
    st.integers(0, 20),
)
def test_matches_brute_force(
    ops: list[tuple[bool, tuple[int, int]]], queries: list[tuple[int, int]], seed: int
) -> None:
    t = IntervalTree(rng=random.Random(seed))
    model: list[tuple[int, int]] = []
    for is_insert, (start, end) in ops:
        if is_insert:
            t.insert(start, end)
            model.append((start, end))
        else:
            assert t.remove(start, end) == ((start, end) in model)
            if (start, end) in model:
                model.remove((start, end))
    for lo, hi in queries:
        expected = sorted(iv for iv in model if iv[0] <= hi and iv[1] >= lo)
        assert t.overlapping(lo, hi) == expected
    assert list(t) == sorted(model) and len(t) == len(model)
