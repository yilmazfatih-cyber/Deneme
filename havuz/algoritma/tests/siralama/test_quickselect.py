from __future__ import annotations

import random

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.siralama.quickselect import quickselect


def test_hand_checked_example() -> None:
    ages = [34, 19, 52, 41, 27]
    assert quickselect(ages, len(ages) // 2) == 34  # ortanca


def test_edge_cases() -> None:
    with pytest.raises(IndexError):
        quickselect([], 0)
    with pytest.raises(IndexError):
        quickselect([1, 2], 2)
    assert quickselect([5], 0) == 5
    assert quickselect([3] * 5000, 4000) == 3  # tümü eşit


@given(st.lists(st.integers(-30, 30), min_size=1, max_size=150), st.data())
def test_matches_sorted(values: list[int], data: st.DataObject) -> None:
    k = data.draw(st.integers(0, len(values) - 1))
    seed = data.draw(st.integers(0, 100))
    assert quickselect(values, k, rng=random.Random(seed)) == sorted(values)[k]
