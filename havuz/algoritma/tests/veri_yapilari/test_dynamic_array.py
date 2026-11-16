from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.dynamic_array import DynamicArray


def test_hand_checked_example() -> None:
    a = DynamicArray([1, 2, 3])
    a.insert(1, 9)
    assert list(a) == [1, 9, 2, 3]
    assert a.remove_at(-1) == 3
    a[0] = 7
    assert list(a) == [7, 9, 2]
    assert a[-1] == 2


def test_edge_cases() -> None:
    a: DynamicArray[int] = DynamicArray()
    assert len(a) == 0
    assert list(a) == []
    with pytest.raises(IndexError):
        a.pop()
    with pytest.raises(IndexError):
        a[0]
    a.insert(-5, 1)  # sınır dışı ekleme `list.insert` gibi başa/sona kenetlenir
    a.insert(99, 2)
    assert list(a) == [1, 2]


def test_capacity_grows_and_shrinks() -> None:
    a = DynamicArray(range(1000))
    assert a.capacity >= 1000
    for _ in range(1000):
        a.pop()
    assert a.capacity == 4  # boşalınca bellek geri verilir


OPS = st.lists(
    st.tuples(st.sampled_from(["append", "pop", "insert", "remove_at", "set"]), st.integers(-9, 9)),
    max_size=150,
)


@given(OPS)
def test_matches_python_list(ops: list[tuple[str, int]]) -> None:
    ours: DynamicArray[int] = DynamicArray()
    model: list[int] = []
    for op, value in ops:
        if op == "append":
            ours.append(value)
            model.append(value)
        elif op == "insert":
            ours.insert(value, value)
            model.insert(value, value)
        elif not model:
            continue
        elif op == "pop":
            assert ours.pop() == model.pop()
        elif op == "remove_at":
            index = value % len(model)
            assert ours.remove_at(index) == model.pop(index)
        else:
            index = value % len(model)
            ours[index] = value
            model[index] = value
        assert list(ours) == model
        assert len(ours) <= ours.capacity
