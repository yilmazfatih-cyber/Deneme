from __future__ import annotations

from hypothesis import given

from algoritma.graf.bridges_articulation import bridges_and_articulation_points
from tests.graf.helpers import component_count, edge_lists


def test_hand_checked_example() -> None:
    # iki üçgen bir köprüyle bağlı; 1-2 arasında paralel kenar köprü sayılmaz
    edges = [(0, 1), (1, 2), (2, 0), (2, 3), (3, 4), (4, 5), (5, 3), (5, 6), (6, 7), (6, 7)]
    assert bridges_and_articulation_points(8, edges) == ([(2, 3), (5, 6)], [2, 3, 5, 6])


def test_edge_cases() -> None:
    assert bridges_and_articulation_points(0, []) == ([], [])
    assert bridges_and_articulation_points(2, [(0, 1)]) == ([(0, 1)], [])
    assert bridges_and_articulation_points(2, [(0, 1), (1, 0)]) == ([], [])
    assert bridges_and_articulation_points(1, [(0, 0)]) == ([], [])
    n = 20_000
    path = [(i, i + 1) for i in range(n - 1)]  # uzun yol: özyinelemesiz kod taşmamalı
    bridges, cuts = bridges_and_articulation_points(n, path)
    assert len(bridges) == n - 1 and cuts == list(range(1, n - 1))


@given(edge_lists(max_n=7, max_m=10))
def test_matches_removal_brute_force(graph: tuple[int, list[tuple[int, int]]]) -> None:
    n, edges = graph
    base = component_count(n, edges)
    expected_bridges = sorted(
        (min(u, v), max(u, v))
        for i, (u, v) in enumerate(edges)
        if component_count(n, edges[:i] + edges[i + 1 :]) > base
    )
    expected_cuts = [v for v in range(n) if component_count(n, edges, removed=v) > base]
    assert bridges_and_articulation_points(n, edges) == (expected_bridges, expected_cuts)
