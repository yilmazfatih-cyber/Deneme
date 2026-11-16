from __future__ import annotations

import itertools

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.kaliplar.binary_search_answer import (
    first_true,
    longest_equal_piece,
    max_min_tower_gap,
    min_largest_workload,
)


def test_hand_checked_examples() -> None:
    assert first_true(0, 10, lambda x: x >= 7) == 7 and first_true(0, 10, lambda x: False) == 11
    assert (
        min_largest_workload([10, 20, 30], 3) == 30 and min_largest_workload([10, 20, 30], 1) == 60
    )
    assert max_min_tower_gap([0, 100], 2) == 100 and longest_equal_piece([5], 6) == 0


def test_edge_cases() -> None:
    with pytest.raises(ValueError):
        min_largest_workload([], 2)
    with pytest.raises(ValueError):
        max_min_tower_gap([1], 2)
    with pytest.raises(ValueError):
        longest_equal_piece([3], 0)
    assert longest_equal_piece([], 1) == 0


@given(st.lists(st.integers(1, 20), min_size=1, max_size=7), st.integers(1, 7))
def test_workload_matches_all_splits(chapters: list[int], translators: int) -> None:
    n = len(chapters)
    best = None
    for cuts in range(min(translators, n)):
        for positions in itertools.combinations(range(1, n), cuts):
            bounds = [0, *positions, n]
            load = max(sum(chapters[a:b]) for a, b in itertools.pairwise(bounds))
            best = load if best is None else min(best, load)
    assert min_largest_workload(chapters, translators) == best


@given(st.lists(st.integers(0, 30), min_size=2, max_size=7, unique=True), st.data())
def test_tower_gap_matches_all_choices(positions: list[int], data: st.DataObject) -> None:
    towers = data.draw(st.integers(2, len(positions)))
    best = max(
        min(b - a for a, b in itertools.pairwise(sorted(choice)))
        for choice in itertools.combinations(positions, towers)
    )
    assert max_min_tower_gap(positions, towers) == best


@given(st.lists(st.integers(1, 60), max_size=6), st.integers(1, 20))
def test_piece_matches_linear_scan(boards: list[int], pieces: int) -> None:
    best = max(
        (size for size in range(1, 61) if sum(b // size for b in boards) >= pieces), default=0
    )
    assert longest_equal_piece(boards, pieces) == best
