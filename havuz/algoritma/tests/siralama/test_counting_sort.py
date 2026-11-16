from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.siralama.counting_sort import counting_sort


def test_hand_checked_example() -> None:
    grades = [("Ayşe", 85), ("Bora", 70), ("Cem", 85), ("Deniz", 60)]
    assert counting_sort(grades, key=lambda g: g[1]) == [
        ("Deniz", 60),
        ("Bora", 70),
        ("Ayşe", 85),
        ("Cem", 85),
    ]  # eşit notlarda özgün sıra korunur


def test_edge_cases() -> None:
    assert counting_sort([]) == [] and counting_sort([-5]) == [-5]
    with pytest.raises(ValueError, match="radix_sort"):
        counting_sort([0, 10**12])  # aralık çok geniş: dev bellek ayırmak yerine yol göster
    assert counting_sort([0, 10**6], max_range=10**7) == [0, 10**6]


@given(st.lists(st.tuples(st.integers(-50, 50), st.integers()), max_size=100))
def test_matches_stable_sorted(pairs: list[tuple[int, int]]) -> None:
    assert counting_sort(pairs, key=lambda p: p[0]) == sorted(pairs, key=lambda p: p[0])
    assert counting_sort([p[0] for p in pairs]) == sorted(p[0] for p in pairs)
