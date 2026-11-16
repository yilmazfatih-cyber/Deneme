from __future__ import annotations

from fractions import Fraction

from hypothesis import given
from hypothesis import strategies as st

from algoritma.geometri.convex_hull import convex_hull
from algoritma.geometri.orientation import cross
from algoritma.geometri.polygon_area import (
    boundary_lattice_points,
    interior_lattice_points,
    is_counterclockwise,
    polygon_area,
    signed_area2,
)

P = tuple[int, int]


def test_hand_checked_example() -> None:
    triangle = [(0, 0), (4, 0), (0, 3)]
    assert polygon_area(triangle) == 6 and signed_area2(triangle) == 12
    l_shape = [(0, 0), (4, 0), (4, 1), (1, 1), (1, 3), (0, 3)]  # L biçimli (dışbükey değil) arsa
    assert polygon_area(l_shape) == 6 and is_counterclockwise(l_shape)
    assert not is_counterclockwise(l_shape[::-1])
    assert polygon_area([(0, 0), (1, 0), (0, 1)]) == Fraction(1, 2)  # yarım birim kesin


def test_edge_cases() -> None:
    assert signed_area2([]) == 0 and polygon_area([(1, 1)]) == 0
    assert polygon_area([(0, 0), (5, 5), (10, 10)]) == 0  # dejenere (doğrusal)
    assert boundary_lattice_points([(0, 0), (3, 0), (0, 3)]) == 9
    assert interior_lattice_points([(0, 0), (3, 0), (0, 3)]) == 1


@given(st.sets(st.tuples(st.integers(-6, 6), st.integers(-6, 6)), min_size=3, max_size=10))
def test_pick_matches_brute_force_counts(points: set[P]) -> None:
    polygon = convex_hull(list(points))
    if len(polygon) < 3:
        return
    inside = boundary = 0
    for x in range(-6, 7):
        for y in range(-6, 7):
            signs = [cross(polygon[i - 1], polygon[i], (x, y)) for i in range(len(polygon))]
            if all(s > 0 for s in signs):
                inside += 1
            elif all(s >= 0 for s in signs):
                boundary += 1
    assert interior_lattice_points(polygon) == inside
    assert boundary_lattice_points(polygon) == boundary
    assert polygon_area(polygon) == inside + Fraction(boundary, 2) - 1  # Pick, kaba kuvvet sayımla
