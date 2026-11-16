from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.cesitli.sliding_window_max import sliding_window_max, sliding_window_min


def test_hand_checked_example() -> None:
    temperatures = [12, 15, 9, 18, 18, 7, 21]  # 3 günlük en sıcak / en soğuk
    assert sliding_window_max(temperatures, 3) == [15, 18, 18, 18, 21]
    assert sliding_window_min(temperatures, 3) == [9, 9, 9, 7, 7]


def test_edge_cases() -> None:
    assert sliding_window_max([], 2) == [] and sliding_window_max([4, 1], 3) == []
    assert sliding_window_max([4, 1], 1) == [4, 1] and sliding_window_min([2, 2, 2], 2) == [2, 2]
    with pytest.raises(ValueError):
        sliding_window_max([1], 0)


@given(st.lists(st.integers(-50, 50), max_size=80), st.integers(1, 10))
def test_matches_brute_force(values: list[int], k: int) -> None:
    windows = [values[i : i + k] for i in range(len(values) - k + 1)]
    assert sliding_window_max(values, k) == [max(w) for w in windows]
    assert sliding_window_min(values, k) == [min(w) for w in windows]
