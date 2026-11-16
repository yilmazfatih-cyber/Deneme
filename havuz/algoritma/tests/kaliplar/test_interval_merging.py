from __future__ import annotations

import itertools
from collections.abc import Sequence

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.kaliplar.interval_merging import common_free_slots, covered_length, merge_intervals

INTERVAL = st.tuples(st.integers(0, 30), st.integers(0, 8)).map(lambda t: (t[0], t[0] + t[1]))


def _covered_points(intervals: Sequence[tuple[float, float]]) -> set[float]:
    """Başvuru: yarım birimlik ızgarada kapsanan noktalar (kapalı aralıklar, tam sayı uçlar)."""
    return {x / 2 for a, b in intervals for x in range(int(2 * a), int(2 * b) + 1)}


def test_hand_checked_examples() -> None:
    assert merge_intervals([(1, 3), (3, 5)]) == [(1, 5)]  # dokunanlar birleşir
    assert merge_intervals([(1, 10), (2, 3)]) == [(1, 10)]  # içerilen
    assert common_free_slots([], 9, 17) == [(9, 17)]
    assert common_free_slots([[(8, 18)]], 9, 17) == []


def test_edge_cases() -> None:
    assert merge_intervals([]) == [] and covered_length([]) == 0
    assert merge_intervals([(4, 4)]) == [(4, 4)] and covered_length([(4, 4)]) == 0
    with pytest.raises(ValueError):
        merge_intervals([(3, 1)])


@given(st.lists(INTERVAL, max_size=12))
def test_merge_matches_point_coverage(intervals: list[tuple[int, int]]) -> None:
    merged = merge_intervals(intervals)
    assert _covered_points(merged) == _covered_points(intervals)  # kapsanan noktalar aynı
    assert all(
        a[1] < b[0] for a, b in itertools.pairwise(merged)
    )  # sıralı ve aralarında boşluk var
    unit_cover = {x for a, b in intervals for x in range(a, b)}  # [x, x+1) birim parçalar
    assert covered_length(intervals) == len(unit_cover)


@given(st.lists(st.lists(INTERVAL, max_size=4), max_size=3), st.integers(0, 20), st.integers(0, 20))
def test_free_slots_match_brute_force(
    busy: list[list[tuple[int, int]]], start: int, length: int
) -> None:
    end = start + length
    slots = common_free_slots(busy, start, end)
    all_busy = [interval for person in busy for interval in person]
    assert all(start <= a < b <= end for a, b in slots)
    # uçlar tam sayı: (x, x+1) birim parçasının ortası boşsa parçanın tamamı boştur
    free_units = {x for x in range(start, end) if not any(s <= x + 0.5 <= e for s, e in all_busy)}
    slot_units = {x for x in range(start, end) if any(a < x + 0.5 < b for a, b in slots)}
    assert slot_units == free_units
