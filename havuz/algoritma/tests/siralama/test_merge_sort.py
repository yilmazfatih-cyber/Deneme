from __future__ import annotations

from hypothesis import given
from hypothesis import strategies as st

from algoritma.siralama.merge_sort import count_inversions, merge_sort


def test_hand_checked_example() -> None:
    assert merge_sort([5, 1, 4, 2, 3]) == [1, 2, 3, 4, 5]
    assert count_inversions([5, 4, 3, 2, 1]) == 10  # tam ters: n(n−1)/2
    assert count_inversions([1, 1, 1]) == 0  # eşitler ters çevrim değildir


def test_edge_cases() -> None:
    assert merge_sort([]) == [] and merge_sort([7]) == [7] and count_inversions([]) == 0
    big = list(range(100_000, 0, -1))
    assert merge_sort(big) == sorted(big)  # özyinelemesiz: büyük girdide yığın taşmaz
    assert count_inversions(big) == 100_000 * 99_999 // 2


@given(st.lists(st.tuples(st.integers(-3, 3), st.text(max_size=2)), max_size=80))
def test_matches_sorted_and_is_stable(pairs: list[tuple[int, str]]) -> None:
    assert merge_sort(pairs) == sorted(pairs)
    assert merge_sort(pairs, key=lambda p: p[0]) == sorted(pairs, key=lambda p: p[0])


@given(st.lists(st.integers(-5, 5), max_size=60))
def test_inversions_match_brute_force(values: list[int]) -> None:
    n = len(values)
    brute = sum(values[i] > values[j] for i in range(n) for j in range(i + 1, n))
    assert count_inversions(values) == brute
