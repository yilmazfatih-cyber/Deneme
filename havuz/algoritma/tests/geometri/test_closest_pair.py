from __future__ import annotations

import itertools
import random

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.geometri.closest_pair import closest_pair


def _brute(points: list[tuple[int, int]]) -> int:
    return min(
        (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 for a, b in itertools.combinations(points, 2)
    )


def test_hand_checked_example() -> None:
    sensors = [(0, 0), (10, 10), (3, 4), (11, 11), (20, 0)]
    assert closest_pair(sensors) == (2, 1, 3)


def test_edge_cases() -> None:
    with pytest.raises(ValueError):
        closest_pair([(0, 0)])
    assert closest_pair([(1, 1), (1, 1)]) == (0, 0, 1)  # çakışan noktalar
    assert closest_pair([(0, 0), (0, 5), (0, 9)])[0] == 16  # hepsi aynı dikey çizgide
    rng = random.Random(3)
    many = [(rng.randint(0, 10**6), rng.randint(0, 10**6)) for _ in range(20_000)]
    d2, i, j = closest_pair(many)
    assert d2 == (many[i][0] - many[j][0]) ** 2 + (many[i][1] - many[j][1]) ** 2


@given(st.lists(st.tuples(st.integers(-30, 30), st.integers(-30, 30)), min_size=2, max_size=60))
def test_matches_brute_force(points: list[tuple[int, int]]) -> None:
    d2, i, j = closest_pair(points)
    assert d2 == _brute(points) and i < j
    assert (points[i][0] - points[j][0]) ** 2 + (points[i][1] - points[j][1]) ** 2 == d2
