from __future__ import annotations

import math

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.sparse_table import SparseTable


def test_hand_checked_example() -> None:
    st_ = SparseTable([4, 6, 1, 5, 7, 3], max)
    assert st_.query(0, 2) == 6 and st_.query(2, 6) == 7 and st_.query(5, 6) == 3
    assert len(st_) == 6


def test_edge_cases() -> None:
    one = SparseTable([42], min)
    assert one.query(0, 1) == 42
    with pytest.raises(IndexError):
        one.query(0, 0)
    with pytest.raises(IndexError):
        SparseTable([], min).query(0, 1)


@given(st.lists(st.integers(-1000, 1000), min_size=1, max_size=60), st.data())
def test_matches_builtin_min_and_gcd(values: list[int], data: st.DataObject) -> None:
    lo = data.draw(st.integers(0, len(values) - 1))
    hi = data.draw(st.integers(lo + 1, len(values)))
    assert SparseTable(values, min).query(lo, hi) == min(values[lo:hi])
    assert SparseTable(values, math.gcd).query(lo, hi) == math.gcd(*values[lo:hi])
