from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.segment_tree import LazySegmentTree


def test_hand_checked_example() -> None:
    st_ = LazySegmentTree([2, -1, 4, 0, 3])
    st_.add(0, 5, 1)  # [3, 0, 5, 1, 4]
    st_.add(2, 4, -6)  # [3, 0, -1, -5, 4]
    assert st_.range_sum(0, 5) == 1
    assert st_.range_min(0, 3) == -1 and st_.range_min(3, 5) == -5
    st_.set(3, 10)
    assert [st_.get(i) for i in range(5)] == [3, 0, -1, 10, 4]


def test_edge_cases() -> None:
    empty = LazySegmentTree([])
    assert len(empty) == 0 and empty.range_sum(0, 0) == 0
    one = LazySegmentTree([7])
    one.add(0, 0, 100)  # boş aralığa ekleme hiçbir şey yapmaz
    assert one.range_min(0, 1) == 7
    with pytest.raises(IndexError):
        one.range_min(0, 0)  # boş aralığın en küçüğü yok
    with pytest.raises(IndexError):
        one.add(0, 2, 1)
    with pytest.raises(IndexError):
        one.get(1)


OPS = st.lists(
    st.tuples(
        st.sampled_from(["add", "sum", "min", "set"]),
        st.integers(0, 30),
        st.integers(0, 30),
        st.integers(-(10**12), 10**12),
    ),
    max_size=80,
)


@given(st.lists(st.integers(-1000, 1000), min_size=1, max_size=30), OPS)
def test_matches_brute_force(values: list[int], ops: list[tuple[str, int, int, int]]) -> None:
    tree = LazySegmentTree(values)
    model = list(values)
    n = len(model)
    for op, a, b, x in ops:
        lo, hi = sorted((a % (n + 1), b % (n + 1)))
        if op == "add":
            tree.add(lo, hi, x)
            for i in range(lo, hi):
                model[i] += x
        elif op == "sum":
            assert tree.range_sum(lo, hi) == sum(model[lo:hi])  # büyük tam sayılarda da kesin
        elif op == "min" and lo < hi:
            assert tree.range_min(lo, hi) == min(model[lo:hi])
        elif op == "set":
            tree.set(a % n, x)
            model[a % n] = x
