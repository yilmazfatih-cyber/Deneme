from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.lfu_cache import LFUCache


def test_hand_checked_example() -> None:
    cache = LFUCache[str, int](2)
    cache.put("x", 1)
    cache.put("y", 2)
    cache.get("x")
    cache.get("y")  # ikisi de sıklık 2; eşitlikte en eski kullanılan ("x") gider
    assert cache.put("z", 3) == ("x", 1)
    assert "x" not in cache and cache.frequency("y") == 2 and len(cache) == 2


def test_edge_cases() -> None:
    with pytest.raises(ValueError):
        LFUCache[int, int](-1)
    zero = LFUCache[int, int](0)
    assert zero.put(1, 1) == (1, 1) and zero.get(1) is None
    one = LFUCache[int, int](1)
    one.put(1, 10)
    one.put(1, 11)  # yazma da kullanımdır
    assert one.frequency(1) == 2 and one.put(2, 20) == (1, 11) and one.frequency(1) == 0


@given(st.integers(1, 4), st.lists(st.tuples(st.booleans(), st.integers(0, 7)), max_size=150))
def test_matches_brute_force(capacity: int, ops: list[tuple[bool, int]]) -> None:
    cache = LFUCache[int, int](capacity)
    model: dict[int, list[int]] = {}  # anahtar → [değer, sıklık, son kullanım zamanı]
    for step, (is_put, key) in enumerate(ops):
        if is_put:
            evicted = None
            if key in model:
                model[key] = [step, model[key][1] + 1, step]
            else:
                if len(model) == capacity:
                    victim = min(model, key=lambda k: (model[k][1], model[k][2]))
                    evicted = (victim, model.pop(victim)[0])
                model[key] = [step, 1, step]
            assert cache.put(key, step) == evicted
        else:
            expected = None
            if key in model:
                model[key][1] += 1
                model[key][2] = step
                expected = model[key][0]
            assert cache.get(key) == expected
        assert all(cache.frequency(k) == v[1] for k, v in model.items())
