from __future__ import annotations

import statistics

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.cesitli.running_median import RunningMedian


def test_hand_checked_example() -> None:
    latencies = [120, 80, 95, 300, 101]  # milisaniye
    rm = RunningMedian()
    for value in latencies:
        rm.add(value)
    assert rm.median() == 101 and len(rm) == 5


def test_edge_cases() -> None:
    rm = RunningMedian()
    with pytest.raises(ValueError):
        rm.median()
    with pytest.raises(ValueError):
        rm.lower_median()
    rm.add(-5)
    assert rm.median() == -5 and rm.lower_median() == -5
    for _ in range(3):
        rm.add(7)
    assert rm.median() == 7  # yinelenenler


@given(st.lists(st.integers(-1000, 1000), min_size=1, max_size=100))
def test_matches_statistics_median(values: list[int]) -> None:
    rm = RunningMedian()
    for i, value in enumerate(values):
        rm.add(value)
        prefix = values[: i + 1]
        assert rm.median() == statistics.median(prefix)
        assert rm.lower_median() == statistics.median_low(prefix)
