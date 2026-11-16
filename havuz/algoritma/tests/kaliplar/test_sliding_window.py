from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.kaliplar.sliding_window import (
    best_fixed_window,
    longest_with_at_most_k_distinct,
    shortest_window_with_sum,
)


def test_hand_checked_examples() -> None:
    sales = ["süt", "süt", "ekmek", "peynir", "ekmek", "süt"]
    assert longest_with_at_most_k_distinct(sales, 2) == 3  # "süt süt ekmek" (3)
    assert shortest_window_with_sum([1, 1, 1, 1], 10) == 0  # hiç yetmiyor
    assert best_fixed_window([-3, -1, -2], 2) == -3


def test_edge_cases() -> None:
    assert longest_with_at_most_k_distinct([], 3) == 0
    assert longest_with_at_most_k_distinct("abc", 0) == 0
    with pytest.raises(ValueError):
        longest_with_at_most_k_distinct("a", -1)
    with pytest.raises(ValueError):
        shortest_window_with_sum([1, 0, 2], 2)
    with pytest.raises(ValueError):
        best_fixed_window([1, 2], 3)


@given(st.text(alphabet="abcd", max_size=40), st.integers(0, 4))
def test_longest_matches_brute_force(text: str, k: int) -> None:
    brute = max(
        (j - i for i in range(len(text)) for j in range(i + 1, len(text) + 1)
         if len(set(text[i:j])) <= k),
        default=0,
    )  # fmt: skip
    assert longest_with_at_most_k_distinct(text, k) == brute


@given(st.lists(st.integers(1, 9), max_size=30), st.integers(1, 60), st.integers(1, 6))
def test_sum_windows_match_brute_force(values: list[int], target: int, k: int) -> None:
    lengths = [j - i for i in range(len(values)) for j in range(i + 1, len(values) + 1)
               if sum(values[i:j]) >= target]  # fmt: skip
    assert shortest_window_with_sum(values, target) == min(lengths, default=0)
    if k <= len(values):
        assert best_fixed_window(values, k) == max(
            sum(values[i : i + k]) for i in range(len(values) - k + 1)
        )
