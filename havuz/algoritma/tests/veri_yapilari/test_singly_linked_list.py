from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.singly_linked_list import SinglyLinkedList


def test_hand_checked_example() -> None:
    lst = SinglyLinkedList([1, 2, 3])
    assert lst.remove(2)
    assert not lst.remove(42)
    lst.push_back(4)
    assert list(lst) == [1, 3, 4]
    assert 3 in lst and 2 not in lst
    lst.reverse()
    assert list(lst) == [4, 3, 1]
    lst.push_back(0)  # ters çevirmeden sonra kuyruk işaretçisi doğru mu?
    assert list(lst) == [4, 3, 1, 0]


def test_edge_cases() -> None:
    lst: SinglyLinkedList[int] = SinglyLinkedList()
    lst.reverse()
    assert list(lst) == [] and len(lst) == 0
    with pytest.raises(IndexError):
        lst.pop_front()
    lst.push_back(5)
    assert lst.remove(5)
    lst.push_back(6)  # son öğe silinince kuyruk sıfırlanmış olmalı
    assert list(lst) == [6]


OPS = st.lists(
    st.tuples(
        st.sampled_from(["push_front", "push_back", "pop_front", "remove", "reverse"]),
        st.integers(0, 5),
    ),
    max_size=120,
)


@given(OPS)
def test_matches_python_list(ops: list[tuple[str, int]]) -> None:
    ours: SinglyLinkedList[int] = SinglyLinkedList()
    model: list[int] = []
    for op, value in ops:
        if op == "push_front":
            ours.push_front(value)
            model.insert(0, value)
        elif op == "push_back":
            ours.push_back(value)
            model.append(value)
        elif op == "pop_front" and model:
            assert ours.pop_front() == model.pop(0)
        elif op == "remove":
            expected = value in model
            if expected:
                model.remove(value)
            assert ours.remove(value) == expected
        elif op == "reverse":
            ours.reverse()
            model.reverse()
        assert list(ours) == model
        assert len(ours) == len(model)
