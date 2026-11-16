from __future__ import annotations

import math

from hypothesis import given
from hypothesis import strategies as st

from algoritma.geometri.orientation import cross, on_segment
from algoritma.geometri.point_in_polygon import (
    BOUNDARY,
    INSIDE,
    OUTSIDE,
    point_in_polygon,
    winding_number,
)

P = tuple[int, int]


def _star_reference(p: P, polygon: list[P]) -> int:
    """Başvuru: orijine göre yıldız biçimli çokgen = orijinden yelpaze üçgenlerinin birleşimi."""
    n = len(polygon)
    if any(on_segment(p, polygon[i], polygon[(i + 1) % n]) for i in range(n)):
        return BOUNDARY
    for i in range(n):
        a, b = polygon[i], polygon[(i + 1) % n]
        signs = [cross((0, 0), a, p), cross(a, b, p), cross(b, (0, 0), p)]
        if all(s >= 0 for s in signs):
            return INSIDE
    return OUTSIDE


@st.composite
def star_polygons(draw: st.DrawFn) -> list[P]:
    raw = draw(st.sets(st.tuples(st.integers(-8, 8), st.integers(-8, 8)), min_size=3, max_size=9))
    by_angle: dict[float, P] = {}
    for x, y in raw:
        if (x, y) != (0, 0):
            by_angle.setdefault(math.atan2(y, x), (x, y))  # aynı açıda tek nokta
    polygon = [by_angle[a] for a in sorted(by_angle)]
    angles = sorted(by_angle)
    gaps = [b - a for a, b in zip(angles, angles[1:])] + [2 * math.pi - angles[-1] + angles[0]]
    if len(polygon) < 3 or max(gaps) >= math.pi - 1e-9:
        polygon = [(5, 0), (0, 5), (-5, 0), (0, -5)]  # orijin içeride değilse yedek kare
    return polygon


def test_hand_checked_example() -> None:
    u_shape = [(0, 0), (6, 0), (6, 6), (4, 6), (4, 2), (2, 2), (2, 6), (0, 6)]  # U harfi
    assert point_in_polygon((3, 4), u_shape) == OUTSIDE  # U'nun boşluğu
    assert point_in_polygon((1, 4), u_shape) == INSIDE
    assert point_in_polygon((3, 2), u_shape) == BOUNDARY
    assert point_in_polygon((5, 1), u_shape) == INSIDE and winding_number((5, 1), u_shape) == 1


def test_edge_cases() -> None:
    square = [(0, 0), (2, 0), (2, 2), (0, 2)]
    assert point_in_polygon((0, 0), square) == BOUNDARY  # köşe
    assert point_in_polygon((-1, 0), square) == OUTSIDE  # ışın köşeden geçer
    assert point_in_polygon((1, 0), square[::-1]) == BOUNDARY
    assert point_in_polygon((1, 1), square[::-1]) == INSIDE  # saat yönündeki çokgen de olur
    assert winding_number((1, 1), square[::-1]) == -1


@given(star_polygons(), st.tuples(st.integers(-9, 9), st.integers(-9, 9)))
def test_matches_fan_reference(polygon: list[P], p: P) -> None:
    assert point_in_polygon(p, polygon) == _star_reference(p, polygon)
