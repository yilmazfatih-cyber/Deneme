from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.stack import MinStack, Stack


def test_hand_checked_example() -> None:
    s = Stack("ab")
    s.push("c")
    assert [s.pop(), s.pop(), s.peek()] == ["c", "b", "a"]
    assert not s.is_empty() and len(s) == 1


def test_edge_cases() -> None:
    s: Stack[int] = Stack()
    assert s.is_empty()
    with pytest.raises(IndexError):
        s.pop()
    with pytest.raises(IndexError):
        s.peek()
    m = MinStack()
    with pytest.raises(IndexError):
        m.minimum()
    with pytest.raises(IndexError):
        m.pop()
    for x in (3, 3, 1, 1):  # yinelenen en küçükler
        m.push(x)
    assert [m.minimum(), m.pop(), m.minimum(), m.pop(), m.minimum()] == [1, 1, 1, 1, 3]
    assert len(m) == 2


@given(st.lists(st.one_of(st.integers(-100, 100), st.none()), max_size=150))
def test_min_stack_matches_brute_force(ops: list[int | None]) -> None:
    m = MinStack()
    model: list[int] = []
    for op in ops:
        if op is None:
            if model:
                assert m.pop() == model.pop()
        else:
            m.push(op)
            model.append(op)
        if model:
            assert m.minimum() == min(model)
