from __future__ import annotations

import heapq

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.binary_heap import BinaryHeap


def test_hand_checked_example() -> None:
    h = BinaryHeap([9, 4, 7, 1])
    h.push(3)
    assert [h.pop() for _ in range(5)] == [1, 3, 4, 7, 9]


def test_edge_cases() -> None:
    h: BinaryHeap[int] = BinaryHeap()
    with pytest.raises(IndexError):
        h.pop()
    with pytest.raises(IndexError):
        h.peek()
    h = BinaryHeap([2, 2, -5, 2])  # yinelenenler ve negatif
    assert [h.pop() for _ in range(4)] == [-5, 2, 2, 2]
    biggest_first = BinaryHeap([1, 3, 2], key=lambda x: -x)
    assert [biggest_first.pop() for _ in range(3)] == [3, 2, 1]


@given(st.lists(st.one_of(st.integers(-1000, 1000), st.none()), max_size=200))
def test_matches_heapq(ops: list[int | None]) -> None:
    ours: BinaryHeap[int] = BinaryHeap()
    model: list[int] = []
    for op in ops:
        if op is None:
            if model:
                assert ours.pop() == heapq.heappop(model)
        else:
            ours.push(op)
            heapq.heappush(model, op)
        assert len(ours) == len(model)
        if model:
            assert ours.peek() == model[0]


@given(st.lists(st.text(max_size=5), max_size=60))
def test_key_order_matches_sorted(words: list[str]) -> None:
    h = BinaryHeap(words, key=len)
    popped = [h.pop() for _ in range(len(words))]
    assert [len(w) for w in popped] == sorted(len(w) for w in words)
    assert sorted(popped) == sorted(words)
