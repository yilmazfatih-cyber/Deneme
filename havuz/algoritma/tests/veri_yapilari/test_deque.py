from __future__ import annotations

from collections import deque

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.deque import Deque


def test_hand_checked_example() -> None:
    d = Deque([3])
    d.push_front(2)
    d.push_front(1)
    d.push_back(4)
    assert list(d) == [1, 2, 3, 4]
    assert d[-1] == 4 and d[1] == 2
    assert d.pop_back() == 4 and d.pop_front() == 1


def test_edge_cases() -> None:
    d: Deque[int] = Deque()
    for pop in (d.pop_front, d.pop_back):
        with pytest.raises(IndexError):
            pop()
    with pytest.raises(IndexError):
        d[0]
    for i in range(20):  # yalnız başa ekleyerek büyüme
        d.push_front(i)
    assert list(d) == list(range(19, -1, -1))


OPS = st.lists(
    st.tuples(st.sampled_from(["pf", "pb", "of", "ob"]), st.integers(-99, 99)), max_size=200
)


@given(OPS)
def test_matches_collections_deque(ops: list[tuple[str, int]]) -> None:
    ours: Deque[int] = Deque()
    model: deque[int] = deque()
    for op, value in ops:
        if op == "pf":
            ours.push_front(value)
            model.appendleft(value)
        elif op == "pb":
            ours.push_back(value)
            model.append(value)
        elif model and op == "of":
            assert ours.pop_front() == model.popleft()
        elif model:
            assert ours.pop_back() == model.pop()
        assert list(ours) == list(model)
        if model:
            index = value % len(model)
            assert ours[index] == model[index]
