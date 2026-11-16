from __future__ import annotations

import bisect
import random

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.treap import Treap


def test_hand_checked_example() -> None:
    t = Treap(["kiraz", "elma", "armut"], rng=random.Random(7))
    assert list(t) == ["armut", "elma", "kiraz"]
    assert t.rank("dut") == 1 and t.kth(2) == "kiraz"
    assert not t.insert("elma") and t.remove("elma") and not t.remove("elma")
    assert "elma" not in t and len(t) == 2


def test_edge_cases() -> None:
    t: Treap[int] = Treap()
    assert len(t) == 0 and t.rank(5) == 0 and list(t) == []
    with pytest.raises(IndexError):
        t.kth(0)
    t.insert(-3)
    with pytest.raises(IndexError):
        t.kth(1)
    with pytest.raises(IndexError):
        t.kth(-1)


def test_large_sorted_input_is_balanced_enough() -> None:
    t = Treap(range(20_000), rng=random.Random(1))
    assert t.kth(12_345) == 12_345 and t.rank(500) == 500  # özyineleme taşmadan çalışmalı


@given(st.lists(st.tuples(st.booleans(), st.integers(-30, 30)), max_size=150), st.integers(0, 99))
def test_matches_sorted_list(ops: list[tuple[bool, int]], seed: int) -> None:
    t: Treap[int] = Treap(rng=random.Random(seed))
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
        assert t.rank(key) == bisect.bisect_left(model, key)
    assert list(t) == model
    assert [t.kth(i) for i in range(len(model))] == model
