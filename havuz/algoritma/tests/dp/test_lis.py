from __future__ import annotations

import itertools

from hypothesis import given
from hypothesis import strategies as st

from algoritma.dp.lis import lis_indices, longest_increasing_subsequence


def _quadratic_length(seq: list[int], strict: bool) -> int:
    """Başvuru: O(n²) DP."""
    best = [1] * len(seq)
    for i in range(len(seq)):
        for j in range(i):
            if seq[j] < seq[i] or (not strict and seq[j] == seq[i]):
                best[i] = max(best[i], best[j] + 1)
    return max(best, default=0)


def test_hand_checked_example() -> None:
    # aylık satışlar: hep büyüyen en uzun dönem (alt dizi; aylar ardışık olmak zorunda değil)
    sales = [10, 9, 2, 5, 3, 7, 101, 18]
    assert len(longest_increasing_subsequence(sales)) == 4
    assert longest_increasing_subsequence(sales) == [2, 3, 7, 18]
    assert longest_increasing_subsequence("bilgisayar") == ["b", "g", "i", "s", "y"]


def test_edge_cases() -> None:
    assert longest_increasing_subsequence([]) == [] and lis_indices([]) == []
    assert longest_increasing_subsequence([5]) == [5]
    assert longest_increasing_subsequence([3, 3, 3]) == [3]
    assert longest_increasing_subsequence([3, 2, 1], strict=False) == [1]
    big = list(range(100_000))
    assert len(lis_indices(big)) == 100_000


@given(st.lists(st.integers(-10, 10), max_size=60), st.booleans())
def test_matches_quadratic_dp(seq: list[int], strict: bool) -> None:
    indices = lis_indices(seq, strict)
    assert len(indices) == _quadratic_length(seq, strict)
    assert all(a < b for a, b in itertools.pairwise(indices))  # gerçekten bir alt dizi
    values = [seq[i] for i in indices]
    if strict:
        assert all(a < b for a, b in itertools.pairwise(values))
    else:
        assert all(a <= b for a, b in itertools.pairwise(values))
