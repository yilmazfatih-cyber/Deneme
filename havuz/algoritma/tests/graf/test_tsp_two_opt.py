from __future__ import annotations

import itertools
import math
import random

from hypothesis import given
from hypothesis import strategies as st

from algoritma.graf.tsp_two_opt import nearest_neighbor_tour, tour_length, two_opt


def _euclid(points: list[tuple[float, float]]) -> list[list[float]]:
    return [[math.dist(a, b) for b in points] for a in points]


def test_convex_points_reach_optimum() -> None:
    # Çember üstündeki noktalar için en iyi tur çember sırasıdır; 2-opt kesişmeyi açar.
    rng = random.Random(3)
    angles = sorted(rng.uniform(0, 2 * math.pi) for _ in range(12))
    points = [(math.cos(a), math.sin(a)) for a in angles]
    order = list(range(12))
    rng.shuffle(order)
    shuffled = [points[i] for i in order]
    d = _euclid(shuffled)
    improved = two_opt(d, list(range(12)))
    assert math.isclose(tour_length(d, improved), tour_length(_euclid(points), list(range(12))))


def test_edge_cases() -> None:
    assert nearest_neighbor_tour([]) == [] and tour_length([], []) == 0
    assert two_opt([[0]], [0]) == [0] and tour_length([[0, 1], [1, 0]], [0, 1]) == 2
    d = [[0, 1, 2], [1, 0, 1], [2, 1, 0]]
    assert two_opt(d, [0, 1, 2]) == [0, 1, 2]  # üç şehirde her tur aynı


@given(st.lists(st.tuples(st.integers(0, 20), st.integers(0, 20)), min_size=3, max_size=7))
def test_local_optimum_properties(points: list[tuple[int, int]]) -> None:
    d = _euclid([(float(x), float(y)) for x, y in points])
    n = len(points)
    start = nearest_neighbor_tour(d)
    assert sorted(start) == list(range(n))
    improved = two_opt(d, start)
    assert sorted(improved) == list(range(n)) and improved[0] == start[0]
    assert tour_length(d, improved) <= tour_length(d, start) + 1e-9
    best = min(tour_length(d, [0, *p]) for p in itertools.permutations(range(1, n)))
    assert tour_length(d, improved) >= best - 1e-9
    for i in range(n - 1):  # yerel en iyi: hiçbir 2-opt hamlesi kısaltmaz
        for j in range(i + 2, n if i > 0 else n - 1):
            a, b, c, e = improved[i], improved[i + 1], improved[j], improved[(j + 1) % n]
            assert d[a][c] + d[b][e] - d[a][b] - d[c][e] >= -1e-9
