from __future__ import annotations

import itertools

from hypothesis import given
from hypothesis import strategies as st

from algoritma.kaliplar.two_pointers import (
    count_close_pairs,
    pair_with_sum,
    remove_duplicates_in_place,
)

SORTED = st.lists(st.integers(-30, 30), max_size=40).map(sorted)


def test_hand_checked_examples() -> None:
    assert pair_with_sum([10, 20, 30], 100) is None
    assert pair_with_sum([5, 5], 10) == (0, 1)  # aynı fiyatlı iki farklı ürün
    ids = [7, 7, 7]
    assert remove_duplicates_in_place(ids) == 1 and ids[0] == 7
    assert count_close_pairs([1, 1, 1], 0) == 3


def test_edge_cases() -> None:
    assert pair_with_sum([], 0) is None and pair_with_sum([3], 6) is None
    assert count_close_pairs([], 4) == 0 and remove_duplicates_in_place([]) == 0


@given(SORTED, st.integers(-60, 60))
def test_pair_matches_brute_force(values: list[int], target: int) -> None:
    exists = any(
        values[i] + values[j] == target for i, j in itertools.combinations(range(len(values)), 2)
    )
    found = pair_with_sum(values, target)
    assert (found is not None) == exists
    if found is not None:
        i, j = found
        assert i < j and values[i] + values[j] == target


@given(SORTED, st.integers(0, 20))
def test_count_and_dedupe_match_brute_force(values: list[int], gap: int) -> None:
    brute = sum(1 for a, b in itertools.combinations(values, 2) if b - a <= gap)
    assert count_close_pairs(values, gap) == brute
    copy = list(values)
    k = remove_duplicates_in_place(copy)
    assert copy[:k] == sorted(set(values))
