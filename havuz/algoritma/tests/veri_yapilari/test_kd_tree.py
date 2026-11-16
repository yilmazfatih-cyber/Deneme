from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.kd_tree import KDTree


def test_hand_checked_example() -> None:
    cities = [(0, 0), (10, 0), (0, 10), (10, 10), (5, 5)]
    tree = KDTree(cities)
    assert tree.nearest((6, 6)) == (4, 2)
    assert tree.k_nearest((0, 1), 2) == [(1, 0), (41, 4)]
    assert tree.in_box((0, 0), (5, 10)) == [0, 2, 4]


def test_edge_cases() -> None:
    empty = KDTree([])
    assert len(empty) == 0 and empty.k_nearest((0,), 3) == [] and empty.in_box((0,), (1,)) == []
    with pytest.raises(ValueError):
        empty.nearest((0,))
    with pytest.raises(ValueError):
        KDTree([(1, 2), (3,)])
    same = KDTree([(1, 1)] * 4)  # yinelenen noktalar: eşitlikte küçük dizin önce gelir
    assert same.k_nearest((0, 0), 2) == [(2, 0), (2, 1)]
    with pytest.raises(ValueError):
        same.nearest((1, 2, 3))


POINTS = st.lists(
    st.tuples(st.integers(-8, 8), st.integers(-8, 8), st.integers(-8, 8)), max_size=60
)
POINT = st.tuples(st.integers(-10, 10), st.integers(-10, 10), st.integers(-10, 10))


@given(POINTS, POINT, st.integers(0, 8))
def test_k_nearest_matches_brute_force(
    points: list[tuple[int, int, int]], query: tuple[int, int, int], k: int
) -> None:
    tree = KDTree(points)
    brute = sorted((sum((a - b) ** 2 for a, b in zip(p, query)), i) for i, p in enumerate(points))
    assert tree.k_nearest(query, k) == brute[:k]


@given(POINTS, POINT, POINT)
def test_box_matches_brute_force(
    points: list[tuple[int, int, int]], a: tuple[int, int, int], b: tuple[int, int, int]
) -> None:
    low = tuple(min(x, y) for x, y in zip(a, b))
    high = tuple(max(x, y) for x, y in zip(a, b))
    inside = [
        i for i, p in enumerate(points) if all(lo <= x <= hi for lo, x, hi in zip(low, p, high))
    ]
    assert KDTree(points).in_box(low, high) == inside
