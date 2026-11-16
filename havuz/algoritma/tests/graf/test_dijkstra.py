from __future__ import annotations

import math

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.graf.dijkstra import dijkstra, path_from_parents, shortest_path
from tests.graf.helpers import all_pairs_shortest, weighted_adjacency, weighted_edge_lists


def test_hand_checked_example() -> None:
    # Ankara(0) – Eskişehir(1) – İstanbul(2), doğrudan yol daha uzun
    adj = weighted_adjacency(3, [(0, 1, 233), (1, 2, 330), (0, 2, 600)], directed=False)
    assert shortest_path(adj, 0, 2) == (563, [0, 1, 2])
    dist, parent = dijkstra(adj, 2)
    assert dist == [563, 330, 0] and path_from_parents(parent, 0) == [2, 1, 0]


def test_edge_cases() -> None:
    assert dijkstra([[]], 0) == ([0], [-1])
    assert shortest_path([[], []], 0, 1) is None
    assert path_from_parents([-1, -1], 1) == [1]
    with pytest.raises(ValueError, match="bellman_ford"):
        dijkstra([[(1, -1)], []], 0)
    zero = [[(1, 0)], [(0, 0)]]  # sıfır ağırlıklı döngü sonsuz döngüye sokmamalı
    assert dijkstra(zero, 0)[0] == [0, 0]
    floats = [[(1, 0.1)], [(2, 0.2)], []]
    assert math.isclose(dijkstra(floats, 0)[0][2], 0.3)


@given(weighted_edge_lists(max_n=7, max_m=15), st.data())
def test_matches_brute_force(
    graph: tuple[int, list[tuple[int, int, int]]], data: st.DataObject
) -> None:
    n, edges = graph
    source = data.draw(st.integers(0, n - 1))
    adj = weighted_adjacency(n, edges, directed=True)
    dist, parent = dijkstra(adj, source)
    assert dist == all_pairs_shortest(n, edges, directed=True)[source]
    weight: dict[tuple[int, int], float] = {}
    for u, v, w in edges:
        weight[(u, v)] = min(w, weight.get((u, v), math.inf))
    for target in range(n):
        if dist[target] != math.inf:
            path = path_from_parents(parent, target)
            assert path[0] == source
            assert sum(weight[(path[i], path[i + 1])] for i in range(len(path) - 1)) == dist[target]
