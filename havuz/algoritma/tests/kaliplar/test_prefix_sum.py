from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.kaliplar.prefix_sum import (
    count_subarrays_with_sum,
    occupancy_per_day,
    prefix_2d,
    prefix_sums,
    rect_sum,
)


def test_hand_checked_examples() -> None:
    assert prefix_sums([3, 1, 4]) == [0, 3, 4, 8]
    assert count_subarrays_with_sum([0, 0, 0], 0) == 6  # her parça
    assert occupancy_per_day(3, []) == [0, 0, 0]


def test_edge_cases() -> None:
    assert prefix_sums([]) == [0] and count_subarrays_with_sum([], 0) == 0
    assert prefix_2d([]) == [[0]]
    with pytest.raises(ValueError):
        occupancy_per_day(3, [(2, 5)])


@given(st.lists(st.integers(-5, 5), max_size=40), st.integers(-8, 8))
def test_subarray_count_matches_brute_force(values: list[int], target: int) -> None:
    brute = sum(1 for i in range(len(values)) for j in range(i + 1, len(values) + 1)
                if sum(values[i:j]) == target)  # fmt: skip
    assert count_subarrays_with_sum(values, target) == brute


@given(st.integers(1, 15), st.lists(st.tuples(st.integers(0, 15), st.integers(0, 15)), max_size=12))
def test_occupancy_matches_brute_force(days: int, raw: list[tuple[int, int]]) -> None:
    stays = [(min(a, b) % (days + 1), max(a, b) % (days + 1)) for a, b in raw]
    stays = [(a, b) if a <= b else (b, a) for a, b in stays]
    expected = [sum(a <= d < b for a, b in stays) for d in range(days)]
    assert occupancy_per_day(days, stays) == expected


@given(st.integers(1, 6), st.integers(1, 6), st.data())
def test_rect_sum_matches_brute_force(rows: int, cols: int, data: st.DataObject) -> None:
    grid = [[data.draw(st.integers(-9, 9)) for _ in range(cols)] for _ in range(rows)]
    table = prefix_2d(grid)
    r1, r2 = sorted((data.draw(st.integers(0, rows)), data.draw(st.integers(0, rows))))
    c1, c2 = sorted((data.draw(st.integers(0, cols)), data.draw(st.integers(0, cols))))
    expected = sum(grid[r][c] for r in range(r1, r2) for c in range(c1, c2))
    assert rect_sum(table, r1, c1, r2, c2) == expected
