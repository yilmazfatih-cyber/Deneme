from __future__ import annotations

import math

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.avl_tree import AVLTree


def test_hand_checked_rotations() -> None:
    t = AVLTree[int, str]()
    for key in (30, 20, 10):  # sol-sol → tek sağa döndürme
        t[key] = str(key)
    assert t.height() == 2 and t.is_valid()
    t2 = AVLTree[int, int]()
    for key in (30, 10, 20):  # sol-sağ → çift döndürme
        t2[key] = key
    assert t2.height() == 2 and t2.is_valid()
    assert [k for k, _ in t2.items()] == [10, 20, 30]


def test_edge_cases() -> None:
    t = AVLTree[str, int]()
    assert t.height() == 0 and len(t) == 0 and t.is_valid()
    with pytest.raises(KeyError):
        t["yok"]
    with pytest.raises(KeyError):
        del t["yok"]
    assert len(t) == 0  # başarısız silme boyutu bozmamalı
    t["a"] = 1
    t["a"] = 2
    assert len(t) == 1 and t["a"] == 2 and t.get("b", 0) == 0


def test_sorted_input_stays_logarithmic() -> None:
    t = AVLTree[int, int]()
    n = 10_000
    for key in range(n):
        t[key] = key
    assert t.height() <= 1.45 * math.log2(n + 2)
    assert t.is_valid()


@given(st.lists(st.tuples(st.booleans(), st.integers(-25, 25), st.integers()), max_size=150))
def test_matches_dict(ops: list[tuple[bool, int, int]]) -> None:
    t = AVLTree[int, int]()
    model: dict[int, int] = {}
    for is_insert, key, value in ops:
        if is_insert:
            t[key] = value
            model[key] = value
        elif key in model:
            del t[key]
            del model[key]
        assert (key in t) == (key in model)
    assert list(t.items()) == sorted(model.items())
    assert t.is_valid() and len(t) == len(model)
