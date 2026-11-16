from __future__ import annotations

import itertools

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.eniyileme.subset_sum import all_subsets_with_sum, find_subset_with_sum


def test_hand_checked_example() -> None:
    prices = [120, 45, 80, 35, 60]  # 200 TL'lik hediye çeki tam harcanacak
    found = find_subset_with_sum(prices, 200)
    assert found is not None and sum(prices[i] for i in found) == 200
    assert all_subsets_with_sum(prices, 200) == [[0, 1, 3], [0, 2]]  # 120+45+35 ve 120+80


def test_edge_cases() -> None:
    assert find_subset_with_sum([], 0) == [] and find_subset_with_sum([], 5) is None
    assert find_subset_with_sum([5, 3], 0) == []  # boş küme
    assert all_subsets_with_sum([2, 2, 2], 4) == [[0, 1]]  # değer olarak tek çözüm
    with pytest.raises(ValueError):
        find_subset_with_sum([3, -1], 2)


@given(st.lists(st.integers(0, 15), max_size=10), st.integers(0, 40))
def test_matches_brute_force(numbers: list[int], target: int) -> None:
    value_sets = {
        tuple(sorted(numbers[i] for i in combo))
        for size in range(len(numbers) + 1)
        for combo in itertools.combinations(range(len(numbers)), size)
        if sum(numbers[i] for i in combo) == target
    }
    found = find_subset_with_sum(numbers, target)
    assert (found is not None) == bool(value_sets)
    if found is not None:
        assert sum(numbers[i] for i in found) == target and len(set(found)) == len(found)
    every = all_subsets_with_sum(numbers, target)
    assert {tuple(sorted(numbers[i] for i in s)) for s in every} == value_sets
    assert len(every) == len(value_sets)  # değer olarak yinelenen çözüm yok
