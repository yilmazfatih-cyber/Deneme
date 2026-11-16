from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.b_tree import BTree


def test_hand_checked_example() -> None:
    t = BTree(min_degree=2, keys=range(1, 11))
    assert list(t) == list(range(1, 11)) and t.is_valid()
    for key in (4, 1, 10, 6, 5):  # iç düğüm, yaprak, ödünç ve birleştirme durumları
        assert t.remove(key)
        assert t.is_valid()
    assert list(t) == [2, 3, 7, 8, 9]


def test_edge_cases() -> None:
    with pytest.raises(ValueError):
        BTree(min_degree=1)
    t: BTree[int] = BTree()
    assert list(t) == [] and t.height() == 0 and t.is_valid() and not t.remove(1)
    assert t.insert(1) and not t.insert(1) and len(t) == 1
    assert t.remove(1) and len(t) == 0 and t.is_valid()


def test_many_keys_shallow_tree() -> None:
    t = BTree(min_degree=16, keys=range(10_000))
    assert t.height() <= 3 and t.is_valid()  # log_16(10^4) ≈ 3.3
    for key in range(0, 10_000, 2):
        t.remove(key)
    assert list(t) == list(range(1, 10_000, 2)) and t.is_valid()


@given(
    st.integers(2, 4),
    st.lists(st.tuples(st.booleans(), st.integers(-40, 40)), max_size=200),
)
def test_matches_python_set(degree: int, ops: list[tuple[bool, int]]) -> None:
    t: BTree[int] = BTree(min_degree=degree)
    model: set[int] = set()
    for is_insert, key in ops:
        if is_insert:
            assert t.insert(key) == (key not in model)
            model.add(key)
        else:
            assert t.remove(key) == (key in model)
            model.discard(key)
        assert (key in t) == (key in model)
    assert t.is_valid()
    assert list(t) == sorted(model) and len(t) == len(model)
