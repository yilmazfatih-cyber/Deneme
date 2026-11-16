from __future__ import annotations

import itertools

from hypothesis import given

from algoritma.graf.connected_components import (
    bipartite_coloring,
    component_labels,
    connected_components,
)
from tests.graf.helpers import edge_lists, reachability


def test_hand_checked_example() -> None:
    # 0-1-2 üçgen değil zincir; 3-4; 5 yalnız
    assert connected_components(6, [(1, 0), (2, 1), (4, 3)]) == [[0, 1, 2], [3, 4], [5]]
    assert component_labels(3, [(0, 2)]) == [0, 1, 0]
    assert bipartite_coloring(4, [(0, 1), (2, 3)]) == [0, 1, 0, 1]


def test_edge_cases() -> None:
    assert connected_components(0, []) == [] and connected_components(1, [(0, 0)]) == [[0]]
    assert bipartite_coloring(1, [(0, 0)]) is None  # öz döngü tek uzunlukta döngüdür
    assert bipartite_coloring(0, []) == []


@given(edge_lists(max_n=8))
def test_matches_brute_force(graph: tuple[int, list[tuple[int, int]]]) -> None:
    n, edges = graph
    reach = reachability(n, edges, directed=False)
    labels = component_labels(n, edges)
    for u in range(n):
        for v in range(n):
            assert (labels[u] == labels[v]) == reach[u][v]
    groups = connected_components(n, edges)
    assert sorted(v for g in groups for v in g) == list(range(n))
    colors = [list(c) for c in itertools.product((0, 1), repeat=n)]
    proper = [c for c in colors if all(c[u] != c[v] for u, v in edges)]
    coloring = bipartite_coloring(n, edges)
    assert (coloring is not None) == bool(proper)
    if coloring is not None:
        assert all(coloring[u] != coloring[v] for u, v in edges)
