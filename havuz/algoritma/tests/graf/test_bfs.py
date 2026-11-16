from __future__ import annotations

import math

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.graf.bfs import bfs_distances, bfs_order, shortest_path_unweighted, zero_one_bfs
from tests.graf.helpers import (
    adjacency,
    all_pairs_shortest,
    edge_lists,
    is_valid_path,
    weighted_adjacency,
)


def test_hand_checked_example() -> None:
    adj = adjacency(6, [(0, 1), (0, 2), (1, 3), (2, 3), (3, 4)], directed=False)
    assert bfs_order(adj, 0) == [0, 1, 2, 3, 4]
    assert bfs_distances(adj, 0) == [0, 1, 1, 2, 3, -1]
    assert shortest_path_unweighted(adj, 4, 0) == [4, 3, 1, 0]


def test_edge_cases() -> None:
    assert bfs_distances([[]], 0) == [0] and shortest_path_unweighted([[]], 0, 0) == [0]
    assert shortest_path_unweighted([[], []], 0, 1) is None
    with pytest.raises(ValueError):
        zero_one_bfs([[(0, 2)]], 0)
    chain = [[i + 1] for i in range(9999)] + [[]]
    assert bfs_distances(chain, 0)[-1] == 9999


@given(edge_lists(), st.data())
def test_distances_and_paths_match_brute_force(
    graph: tuple[int, list[tuple[int, int]]], data: st.DataObject
) -> None:
    n, edges = graph
    source, target = data.draw(st.integers(0, n - 1)), data.draw(st.integers(0, n - 1))
    adj = adjacency(n, edges, directed=True)
    brute = all_pairs_shortest(n, [(u, v, 1) for u, v in edges], directed=True)
    expected = [int(d) if d != math.inf else -1 for d in brute[source]]
    assert bfs_distances(adj, source) == expected
    assert sorted(bfs_order(adj, source)) == [v for v in range(n) if expected[v] != -1]
    path = shortest_path_unweighted(adj, source, target)
    if expected[target] == -1:
        assert path is None
    else:
        assert path is not None and len(path) - 1 == expected[target]
        assert path[0] == source and path[-1] == target and is_valid_path(path, edges, True)


@given(edge_lists(), st.lists(st.integers(0, 1), min_size=14, max_size=14), st.data())
def test_zero_one_bfs_matches_brute_force(
    graph: tuple[int, list[tuple[int, int]]], weights: list[int], data: st.DataObject
) -> None:
    n, edges = graph
    weighted = [(u, v, w) for (u, v), w in zip(edges, weights)]
    source = data.draw(st.integers(0, n - 1))
    expected = all_pairs_shortest(n, weighted, directed=True)[source]
    assert zero_one_bfs(weighted_adjacency(n, weighted, directed=True), source) == expected
