from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.cesitli.bin_packing import (
    best_fit,
    first_fit,
    first_fit_decreasing,
    lower_bound_bins,
)


def _optimum(sizes: list[int], capacity: int) -> int:
    """Kaba kuvvet: her eşyayı var olan bir kutuya ya da yeni kutuya koymayı dene."""
    best = len(sizes)

    def place(i: int, rooms: list[int]) -> None:
        nonlocal best
        if len(rooms) >= best:
            return
        if i == len(sizes):
            best = len(rooms)
            return
        for b in range(len(rooms)):
            if sizes[i] <= rooms[b]:
                rooms[b] -= sizes[i]
                place(i + 1, rooms)
                rooms[b] += sizes[i]
        rooms.append(capacity - sizes[i])
        place(i + 1, rooms)
        rooms.pop()

    place(0, [])
    return best


def _valid(bins: list[list[int]], sizes: list[int], capacity: int) -> bool:
    flat = sorted(i for box in bins for i in box)
    return flat == list(range(len(sizes))) and all(
        sum(sizes[i] for i in box) <= capacity for box in bins
    )


def test_hand_checked_example() -> None:
    # kamyonlar 10 ton; sırayla gelen yükler
    loads = [5, 7, 5, 2, 4, 2, 5, 1, 6]
    assert len(first_fit(loads, 10)) == 5 and len(first_fit_decreasing(loads, 10)) == 4
    assert len(best_fit(loads, 10)) == 5 and lower_bound_bins(loads, 10) == 4


def test_edge_cases() -> None:
    assert first_fit([], 5) == [] and best_fit([], 5) == [] and first_fit_decreasing([], 5) == []
    assert lower_bound_bins([], 5) == 0
    with pytest.raises(ValueError):
        first_fit([6], 5)
    with pytest.raises(ValueError):
        best_fit([1], 0)
    with pytest.raises(ValueError):
        first_fit([0], 5)


@given(st.lists(st.integers(1, 10), max_size=8))
def test_heuristics_are_valid_and_near_optimal(sizes: list[int]) -> None:
    capacity = 10
    opt = _optimum(sizes, capacity)
    assert lower_bound_bins(sizes, capacity) <= opt
    for heuristic in (first_fit, best_fit, first_fit_decreasing):
        bins = heuristic(sizes, capacity)
        assert _valid(bins, sizes, capacity) and len(bins) >= opt
    assert len(first_fit_decreasing(sizes, capacity)) <= 11 * opt / 9 + 6 / 9  # kanıtlı sınır
    assert len(first_fit(sizes, capacity)) <= 1.7 * opt + 1  # İlk uyan sınırı (⌊1.7·OPT⌋)
