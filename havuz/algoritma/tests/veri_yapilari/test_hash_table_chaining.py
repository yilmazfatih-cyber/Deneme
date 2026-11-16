from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.hash_table_chaining import ChainingHashTable


def test_hand_checked_example() -> None:
    t = ChainingHashTable[str, int]()
    t["bir"] = 1
    t["iki"] = 2
    t["bir"] = 11
    del t["iki"]
    assert t["bir"] == 11 and len(t) == 1
    assert t.get("iki", 0) == 0 and "iki" not in t


def test_edge_cases_and_resizing() -> None:
    t = ChainingHashTable[int, int]()
    with pytest.raises(KeyError):
        t[0]
    with pytest.raises(KeyError):
        del t[0]
    for i in range(1000):
        t[i] = -i
    assert t.bucket_count >= 1000 // 1  # yük oranı <= 1
    assert all(t[i] == -i for i in range(1000))
    for i in range(1000):
        del t[i]
    assert len(t) == 0 and t.bucket_count == 8  # boşalınca küçülür


OPS = st.lists(st.tuples(st.booleans(), st.integers(-20, 20), st.integers()), max_size=200)


@given(OPS)
def test_matches_dict(ops: list[tuple[bool, int, int]]) -> None:
    ours = ChainingHashTable[int, int]()
    model: dict[int, int] = {}
    for is_insert, key, value in ops:
        if is_insert:
            ours[key] = value
            model[key] = value
        elif key in model:
            del ours[key]
            del model[key]
        assert ours.get(key, -1) == model.get(key, -1)
    assert dict(ours.items()) == model and len(ours) == len(model)
