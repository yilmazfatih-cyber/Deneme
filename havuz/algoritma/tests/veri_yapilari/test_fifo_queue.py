from __future__ import annotations

from collections import deque

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.fifo_queue import Queue


def test_hand_checked_example() -> None:
    q = Queue(["a", "b"])
    q.enqueue("c")
    assert [q.dequeue(), q.dequeue(), q.peek()] == ["a", "b", "c"]
    assert not q.is_empty()


def test_edge_cases_and_wraparound() -> None:
    q: Queue[int] = Queue()
    assert q.is_empty()
    with pytest.raises(IndexError):
        q.dequeue()
    with pytest.raises(IndexError):
        q.peek()
    for round_ in range(5):  # baş dizini tamponun sonundan başa sarsın
        for i in range(6):
            q.enqueue(round_ * 10 + i)
        for i in range(6):
            assert q.dequeue() == round_ * 10 + i
    assert len(q) == 0


@given(st.lists(st.one_of(st.integers(), st.none()), max_size=200))
def test_matches_collections_deque(ops: list[int | None]) -> None:
    ours: Queue[int] = Queue()
    model: deque[int] = deque()
    for op in ops:
        if op is None:
            if model:
                assert ours.dequeue() == model.popleft()
        else:
            ours.enqueue(op)
            model.append(op)
        assert list(ours) == list(model)
