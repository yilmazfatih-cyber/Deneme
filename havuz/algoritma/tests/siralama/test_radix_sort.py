from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.siralama.radix_sort import radix_sort


def test_hand_checked_example() -> None:
    assert radix_sort([329, 457, 657, 839, 436, 720, 355], base=10) == [
        329,
        355,
        436,
        457,
        657,
        720,
        839,
    ]


def test_edge_cases() -> None:
    assert radix_sort([]) == [] and radix_sort([0]) == [0] and radix_sort([-1, -1]) == [-1, -1]
    assert radix_sort([2**64, -(2**64), 0]) == [-(2**64), 0, 2**64]
    with pytest.raises(ValueError):
        radix_sort([1], base=1)


@given(st.lists(st.integers(-(10**15), 10**15), max_size=150), st.sampled_from([2, 10, 256]))
def test_matches_sorted(values: list[int], base: int) -> None:
    assert radix_sort(values, base=base) == sorted(values)
