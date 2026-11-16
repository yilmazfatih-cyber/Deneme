from __future__ import annotations

from hypothesis import given
from hypothesis import strategies as st

from algoritma.siralama.insertion_sort import insertion_sort


def test_hand_checked_example() -> None:
    assert insertion_sort([3, -1, 3, 0]) == [-1, 0, 3, 3]
    assert insertion_sort("dcba") == ["a", "b", "c", "d"]


def test_edge_cases() -> None:
    assert insertion_sort([]) == [] and insertion_sort([1]) == [1]
    data = [2, 1]
    insertion_sort(data)
    assert data == [2, 1]  # girdi değişmez
    assert insertion_sort([10**30, -(10**30), 0]) == [-(10**30), 0, 10**30]


@given(st.lists(st.tuples(st.integers(0, 5), st.integers()), max_size=80))
def test_matches_sorted_and_is_stable(pairs: list[tuple[int, int]]) -> None:
    assert insertion_sort(pairs) == sorted(pairs)
    by_first = insertion_sort(pairs, key=lambda p: p[0])
    assert by_first == sorted(pairs, key=lambda p: p[0])  # sorted() da kararlıdır
