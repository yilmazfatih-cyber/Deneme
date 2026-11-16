from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.siralama.median_of_medians import median_of_medians_select


def test_hand_checked_example() -> None:
    values = [12, 3, 5, 7, 4, 19, 26]
    assert median_of_medians_select(values, 3) == 7
    assert median_of_medians_select(values, 6) == 26


def test_edge_cases() -> None:
    with pytest.raises(IndexError):
        median_of_medians_select([], 0)
    assert median_of_medians_select([1], 0) == 1
    assert median_of_medians_select([2] * 1000, 999) == 2
    many = list(range(200_000, 0, -1))
    assert median_of_medians_select(many, 99_999) == 100_000  # büyük girdi, yığın taşmaz


@given(st.lists(st.integers(-50, 50), min_size=1, max_size=300), st.data())
def test_matches_sorted(values: list[int], data: st.DataObject) -> None:
    k = data.draw(st.integers(0, len(values) - 1))
    assert median_of_medians_select(values, k) == sorted(values)[k]
