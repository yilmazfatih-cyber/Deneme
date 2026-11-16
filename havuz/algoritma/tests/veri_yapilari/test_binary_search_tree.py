from __future__ import annotations

import bisect

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.binary_search_tree import BinarySearchTree


def test_hand_checked_example() -> None:
    t = BinarySearchTree([8, 3, 10, 1, 6, 14, 4, 7, 13])
    assert list(t) == [1, 3, 4, 6, 7, 8, 10, 13, 14]
    assert t.height() == 3
    assert t.remove(3)  # iki çocuklu düğüm
    assert t.remove(14)  # tek çocuklu düğüm
    assert t.remove(13)  # yaprak
    assert list(t) == [1, 4, 6, 7, 8, 10]
    assert (t.minimum(), t.maximum(), t.floor(5), t.ceiling(5)) == (1, 10, 4, 6)
    assert t.floor(0) is None and t.ceiling(11) is None


def test_edge_cases() -> None:
    t: BinarySearchTree[int] = BinarySearchTree()
    assert t.height() == -1 and list(t) == [] and not t.remove(1)
    with pytest.raises(ValueError):
        t.minimum()
    with pytest.raises(ValueError):
        t.maximum()
    assert t.insert(5) and not t.insert(5) and len(t) == 1
    assert t.remove(5) and len(t) == 0


def test_sorted_input_does_not_overflow_stack() -> None:
    t = BinarySearchTree(range(5000))  # zincire döner; özyinelemesiz kod taşmamalı
    assert t.height() == 4999
    assert 4999 in t and list(t) == list(range(5000))


@given(st.lists(st.tuples(st.booleans(), st.integers(-30, 30)), max_size=150))
def test_matches_sorted_list(ops: list[tuple[bool, int]]) -> None:
    t: BinarySearchTree[int] = BinarySearchTree()
    model: list[int] = []
    for is_insert, key in ops:
        if is_insert:
            assert t.insert(key) == (key not in model)
            if key not in model:
                bisect.insort(model, key)
        else:
            assert t.remove(key) == (key in model)
            if key in model:
                model.remove(key)
        assert list(t) == model and len(t) == len(model)
        position = bisect.bisect_right(model, key)
        assert t.floor(key) == (model[position - 1] if position else None)
        position = bisect.bisect_left(model, key)
        assert t.ceiling(key) == (model[position] if position < len(model) else None)
