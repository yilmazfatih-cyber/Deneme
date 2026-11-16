from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.lru_cache import LRUCache


def test_hand_checked_example() -> None:
    cache = LRUCache[int, str](3)
    for key in (1, 2, 3):
        cache.put(key, str(key))
    cache.get(1)  # sıra (yeniden eskiye): 1, 3, 2
    assert cache.put(2, "iki") is None  # güncelleme yer açtırmaz; 2 en yeni olur
    assert cache.put(4, "4") == (3, "3")
    assert list(cache.keys()) == [4, 2, 1] and 3 not in cache and len(cache) == 3


def test_edge_cases() -> None:
    with pytest.raises(ValueError):
        LRUCache[int, int](-1)
    zero = LRUCache[int, int](0)
    assert zero.put(1, 1) == (1, 1) and zero.get(1) is None and len(zero) == 0
    one = LRUCache[str, int](1)
    one.put("a", 1)
    assert one.put("b", 2) == ("a", 1) and one.get("b") == 2


@given(st.integers(1, 5), st.lists(st.tuples(st.booleans(), st.integers(0, 8)), max_size=150))
def test_matches_list_model(capacity: int, ops: list[tuple[bool, int]]) -> None:
    cache = LRUCache[int, int](capacity)
    model: list[tuple[int, int]] = []  # en yeni başta
    for step, (is_put, key) in enumerate(ops):
        index = next((i for i, (k, _) in enumerate(model) if k == key), None)
        if is_put:
            evicted = None
            if index is not None:
                model.pop(index)
            elif len(model) == capacity:
                evicted = model.pop()
            model.insert(0, (key, step))
            assert cache.put(key, step) == evicted
        else:
            expected = None
            if index is not None:
                entry = model.pop(index)
                model.insert(0, entry)
                expected = entry[1]
            assert cache.get(key) == expected
        assert list(cache.keys()) == [k for k, _ in model]
