from __future__ import annotations

import itertools

from hypothesis import given
from hypothesis import strategies as st

from algoritma.geometri.convex_hull import convex_hull
from algoritma.geometri.orientation import cross

P = tuple[int, int]


def _in_triangle(p: P, a: P, b: P, c: P) -> bool:
    if cross(a, b, c) == 0:
        return False  # dejenere (doğrusal) üçgen; o durum `_between` ile ele alınır
    signs = [cross(a, b, p), cross(b, c, p), cross(c, a, p)]
    return all(s >= 0 for s in signs) or all(s <= 0 for s in signs)


def _between(p: P, a: P, b: P) -> bool:
    return (
        cross(a, b, p) == 0
        and min(a[0], b[0]) <= p[0] <= max(a[0], b[0])
        and min(a[1], b[1]) <= p[1] <= max(a[1], b[1])
    )


def _extreme_points(points: set[P]) -> set[P]:
    """Başvuru: başka noktaların bir üçgeninde ya da parçasında kalmayan noktalar köşedir."""
    extreme = set()
    for p in points:
        others = sorted(points - {p})
        covered = any(_between(p, a, b) for a, b in itertools.combinations(others, 2)) or any(
            _in_triangle(p, a, b, c) for a, b, c in itertools.combinations(others, 3)
        )
        if not covered:
            extreme.add(p)
    return extreme


def test_hand_checked_example() -> None:
    hull = convex_hull([(0, 0), (1, 1), (2, 2), (2, 0), (0, 2), (1, 3), (1, 1)])
    assert hull == [(0, 0), (2, 0), (2, 2), (1, 3), (0, 2)]


def test_edge_cases() -> None:
    assert convex_hull([]) == [] and convex_hull([(1, 1)]) == [(1, 1)]
    assert convex_hull([(1, 1), (1, 1)]) == [(1, 1)]
    assert convex_hull([(0, 0), (1, 1), (2, 2), (3, 3)]) == [(0, 0), (3, 3)]  # hepsi doğrusal


@given(st.sets(st.tuples(st.integers(-5, 5), st.integers(-5, 5)), max_size=11))
def test_matches_brute_force(points: set[P]) -> None:
    hull = convex_hull(list(points))
    if len(points) >= 3 and len(hull) >= 3:
        assert set(hull) == _extreme_points(points)
        n = len(hull)
        assert all(cross(hull[i - 2], hull[i - 1], hull[i]) > 0 for i in range(n))  # sıkı CCW
        assert hull[0] == min(points)
    else:
        assert set(hull) <= points and len(hull) <= 2
