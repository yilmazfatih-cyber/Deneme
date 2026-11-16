from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.geometri.sweep_line_intersections import count_orthogonal_intersections

Segment = tuple[tuple[int, int], tuple[int, int]]


def _brute(horizontals: list[Segment], verticals: list[Segment]) -> int:
    count = 0
    for (hx1, hy), (hx2, _) in horizontals:
        for (vx, vy1), (_, vy2) in verticals:
            if min(hx1, hx2) <= vx <= max(hx1, hx2) and min(vy1, vy2) <= hy <= max(vy1, vy2):
                count += 1
    return count


def test_hand_checked_example() -> None:
    # 3×3 ızgara: 3 yatay × 3 dikey çizgi, hepsi kesişir
    horizontals = [((0, y), (10, y)) for y in (2, 5, 8)]
    verticals = [((x, 0), (x, 10)) for x in (1, 4, 9)]
    assert count_orthogonal_intersections(horizontals, verticals) == 9


def test_edge_cases() -> None:
    assert count_orthogonal_intersections([], []) == 0
    assert count_orthogonal_intersections([((0, 0), (2, 0))], [((2, 0), (2, 5))]) == 1  # uçta
    assert count_orthogonal_intersections([((5, 1), (1, 1))], [((3, 4), (3, 0))]) == 1  # ters uçlar
    with pytest.raises(ValueError):
        count_orthogonal_intersections([((0, 0), (1, 1))], [])
    with pytest.raises(ValueError):
        count_orthogonal_intersections([], [((0, 0), (1, 1))])


H = st.tuples(st.integers(-10, 10), st.integers(-10, 10), st.integers(-10, 10)).map(
    lambda t: ((t[0], t[2]), (t[1], t[2]))
)
V = st.tuples(st.integers(-10, 10), st.integers(-10, 10), st.integers(-10, 10)).map(
    lambda t: ((t[2], t[0]), (t[2], t[1]))
)


@given(st.lists(H, max_size=25), st.lists(V, max_size=25))
def test_matches_brute_force(horizontals: list[Segment], verticals: list[Segment]) -> None:
    assert count_orthogonal_intersections(horizontals, verticals) == _brute(horizontals, verticals)
