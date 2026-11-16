from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.indexed_priority_queue import IndexedPriorityQueue


def test_hand_checked_example() -> None:
    pq = IndexedPriorityQueue[str]()
    for name, priority in [("x", 5), ("y", 2), ("z", 8)]:
        pq.push(name, priority)
    pq.update("z", 1)  # anahtar azaltma
    pq.update("y", 9)  # anahtar artırma
    assert pq.priority_of("y") == 9
    assert pq.remove("x") == 5
    assert [pq.pop(), pq.pop()] == [("z", 1), ("y", 9)]
    assert len(pq) == 0


def test_edge_cases() -> None:
    pq = IndexedPriorityQueue[int]()
    with pytest.raises(IndexError):
        pq.pop()
    with pytest.raises(IndexError):
        pq.peek()
    pq.push(1, 0.5)
    with pytest.raises(ValueError, match="zaten"):
        pq.push(1, 0.1)
    with pytest.raises(KeyError):
        pq.update(2, 0.0)


OPS = st.lists(
    st.tuples(
        st.sampled_from(["push", "update", "pop", "remove"]),
        st.integers(0, 15),
        st.integers(-50, 50),
    ),
    max_size=200,
)


@given(OPS)
def test_matches_dict_model(ops: list[tuple[str, int, int]]) -> None:
    pq = IndexedPriorityQueue[int]()
    model: dict[int, int] = {}
    for op, item, priority in ops:
        if op == "push" and item not in model:
            pq.push(item, priority)
            model[item] = priority
        elif op == "update" and item in model:
            pq.update(item, priority)
            model[item] = priority
        elif op == "remove" and item in model:
            assert pq.remove(item) == model.pop(item)
        elif op == "pop" and model:
            popped, value = pq.pop()
            assert value == min(model.values()) == model.pop(popped)
        assert len(pq) == len(model)
        assert all((key in pq) == (key in model) for key in range(16))
        if model:
            assert pq.peek()[1] == min(model.values())
