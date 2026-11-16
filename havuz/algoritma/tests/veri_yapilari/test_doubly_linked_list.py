from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.doubly_linked_list import DoublyLinkedList, ListNode


def test_hand_checked_example() -> None:
    lst = DoublyLinkedList(["b"])
    a = lst.push_front("a")
    c = lst.push_back("c")
    lst.insert_after(a, "a2")
    assert list(lst) == ["a", "a2", "b", "c"]
    assert lst.unlink(c) == "c"
    assert lst.pop_back() == "b"
    assert list(lst.reversed()) == ["a2", "a"]


def test_edge_cases() -> None:
    lst: DoublyLinkedList[int] = DoublyLinkedList()
    with pytest.raises(IndexError):
        lst.pop_front()
    with pytest.raises(IndexError):
        lst.pop_back()
    node = lst.push_back(1)
    assert lst.unlink(node) == 1
    with pytest.raises(ValueError, match="listede değil"):
        lst.unlink(node)  # aynı tutamağı iki kez çıkarmak yakalanır
    assert len(lst) == 0 and list(lst) == []


OPS = st.lists(
    st.tuples(
        st.sampled_from(["push_front", "push_back", "pop_front", "pop_back", "unlink"]),
        st.integers(0, 50),
    ),
    max_size=120,
)


@given(OPS)
def test_matches_handle_model(ops: list[tuple[str, int]]) -> None:
    ours: DoublyLinkedList[int] = DoublyLinkedList()
    model: list[ListNode[int]] = []
    for op, value in ops:
        if op == "push_front":
            model.insert(0, ours.push_front(value))
        elif op == "push_back":
            model.append(ours.push_back(value))
        elif not model:
            continue
        elif op == "pop_front":
            assert ours.pop_front() == model.pop(0).value
        elif op == "pop_back":
            assert ours.pop_back() == model.pop().value
        else:
            node = model.pop(value % len(model))
            assert ours.unlink(node) == node.value
        assert list(ours) == [node.value for node in model]
        assert list(ours.reversed()) == [node.value for node in reversed(model)]
