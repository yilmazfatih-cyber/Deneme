from __future__ import annotations

from hypothesis import given
from hypothesis import strategies as st

from algoritma.kaliplar.monotonic_stack import (
    largest_poster_area,
    next_greater_index,
    sum_of_window_minimums,
    visible_to_the_right,
)

VALUES = st.lists(st.integers(0, 9), max_size=40)


def test_hand_checked_examples() -> None:
    assert next_greater_index([2, 2, 2]) == [-1, -1, -1]  # eşit, büyük değil
    assert visible_to_the_right([3, 3]) == [0, 0]  # eşit boy görüşü keser
    assert largest_poster_area([4, 4, 4]) == 12 and sum_of_window_minimums([2, 2]) == 6


def test_edge_cases() -> None:
    assert next_greater_index([]) == [] and visible_to_the_right([]) == []
    assert largest_poster_area([]) == 0 and sum_of_window_minimums([]) == 0


@given(VALUES)
def test_matches_brute_force(values: list[int]) -> None:
    n = len(values)
    expected_next = [
        next((j for j in range(i + 1, n) if values[j] > values[i]), -1) for i in range(n)
    ]
    assert next_greater_index(values) == expected_next
    blockers = [next((j for j in range(i + 1, n) if values[j] >= values[i]), n) for i in range(n)]
    assert visible_to_the_right(values) == [blockers[i] - i - 1 for i in range(n)]
    assert largest_poster_area(values) == max(
        (min(values[i:j]) * (j - i) for i in range(n) for j in range(i + 1, n + 1)), default=0
    )
    assert sum_of_window_minimums(values) == sum(
        min(values[i:j]) for i in range(n) for j in range(i + 1, n + 1)
    )
