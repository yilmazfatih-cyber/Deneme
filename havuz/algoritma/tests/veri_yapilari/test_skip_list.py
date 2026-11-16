from __future__ import annotations

import random

from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.skip_list import SkipList


def test_hand_checked_example() -> None:
    s = SkipList(["nar", "elma", "ayva"], rng=random.Random(1))
    assert list(s) == ["ayva", "elma", "nar"]
    assert not s.insert("elma") and s.remove("elma") and not s.remove("elma")
    assert len(s) == 2 and "elma" not in s


def test_edge_cases() -> None:
    s: SkipList[int] = SkipList()
    assert list(s) == [] and 0 not in s and not s.remove(0)
    s.insert(0)
    assert s.remove(0) and len(s) == 0 and list(s) == []


def test_many_keys() -> None:
    keys = list(range(5000))
    random.Random(4).shuffle(keys)
    s = SkipList(keys, rng=random.Random(2))
    assert list(s) == sorted(keys) and 4321 in s and 5000 not in s


@given(st.lists(st.tuples(st.booleans(), st.integers(-30, 30)), max_size=150), st.integers(0, 50))
def test_matches_python_set(ops: list[tuple[bool, int]], seed: int) -> None:
    s: SkipList[int] = SkipList(rng=random.Random(seed))
    model: set[int] = set()
    for is_insert, key in ops:
        if is_insert:
            assert s.insert(key) == (key not in model)
            model.add(key)
        else:
            assert s.remove(key) == (key in model)
            model.discard(key)
        assert (key in s) == (key in model)
    assert list(s) == sorted(model) and len(s) == len(model)
