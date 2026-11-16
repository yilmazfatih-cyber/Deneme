from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.hash_table_open import OpenAddressingHashTable


class SameHash:
    """Hep aynı hash'i veren anahtar: her ekleme çakışır, sondalama sınanır."""

    def __init__(self, label: int) -> None:
        self.label = label

    def __hash__(self) -> int:
        return 7

    def __eq__(self, other: object) -> bool:
        return isinstance(other, SameHash) and other.label == self.label


def test_hand_checked_example() -> None:
    t = OpenAddressingHashTable[str, int]()
    t["a"] = 1
    t["b"] = 2
    t["a"] = 3  # üzerine yaz
    assert t["a"] == 3 and len(t) == 2
    del t["a"]
    assert "a" not in t and t.get("a", -1) == -1
    assert sorted(t.items()) == [("b", 2)]


def test_edge_cases() -> None:
    t = OpenAddressingHashTable[int, int]()
    with pytest.raises(KeyError):
        t[1]
    with pytest.raises(KeyError):
        del t[1]
    keys = [SameHash(i) for i in range(30)]
    table = OpenAddressingHashTable[SameHash, int]()
    for i, key in enumerate(keys):
        table[key] = i
    del table[keys[0]]  # zincirin başı silinince arkadakiler hâlâ bulunmalı (mezar taşı)
    assert all(table[key] == i for i, key in enumerate(keys) if i > 0)


def test_tombstones_do_not_grow_table_forever() -> None:
    t = OpenAddressingHashTable[int, int]()
    for i in range(10_000):  # ekle-sil döngüsü: canlı öğe hep 1
        t[i] = i
        del t[i]
    assert len(t) == 0
    assert t.capacity <= 16


OPS = st.lists(st.tuples(st.booleans(), st.integers(-20, 20), st.integers()), max_size=200)


@given(OPS)
def test_matches_dict(ops: list[tuple[bool, int, int]]) -> None:
    ours = OpenAddressingHashTable[int, int]()
    model: dict[int, int] = {}
    for is_insert, key, value in ops:
        if is_insert:
            ours[key] = value
            model[key] = value
        elif key in model:
            del ours[key]
            del model[key]
        assert len(ours) == len(model)
        assert (key in ours) == (key in model)
    assert dict(ours.items()) == model
