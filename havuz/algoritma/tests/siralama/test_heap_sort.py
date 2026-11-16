from __future__ import annotations

from hypothesis import given
from hypothesis import strategies as st

from algoritma.siralama.heap_sort import heap_sort


def test_hand_checked_example() -> None:
    assert heap_sort([4, 10, 3, 5, 1]) == [1, 3, 4, 5, 10]
    assert heap_sort(["ş", "s", "ç", "c"]) == ["c", "s", "ç", "ş"]  # kod noktası sırası!


def test_edge_cases() -> None:
    assert heap_sort([]) == [] and heap_sort([0]) == [0] and heap_sort([2, 2]) == [2, 2]
    assert heap_sort([1.5, -0.0, float("-inf")]) == [float("-inf"), -0.0, 1.5]


@given(st.lists(st.integers(), max_size=200))
def test_matches_sorted(values: list[int]) -> None:
    assert heap_sort(values) == sorted(values)
