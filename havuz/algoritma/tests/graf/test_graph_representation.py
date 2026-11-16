from __future__ import annotations

import math

from hypothesis import given

from algoritma.graf.graph_representation import (
    adjacency_list,
    adjacency_matrix,
    edges_from_matrix,
    index_vertices,
    transpose,
    weighted_adjacency_list,
)
from tests.graf.helpers import edge_lists, weighted_edge_lists


def test_hand_checked_example() -> None:
    edges = [(0, 1, 7), (0, 1, 3), (2, 2, 5)]  # paralel kenar ve öz döngü
    assert weighted_adjacency_list(3, edges, directed=True) == [[(1, 7), (1, 3)], [], [(2, 5)]]
    matrix = adjacency_matrix(3, edges, directed=False)
    assert matrix[0][1] == matrix[1][0] == 3 and matrix[2][2] == 0  # en hafif; köşegen 0 kalır
    assert transpose([[1, 2], [2], []]) == [[], [0], [0, 1]]


def test_edge_cases() -> None:
    assert adjacency_list(0, [], directed=True) == [] and adjacency_matrix(0, [], True) == []
    assert edges_from_matrix([[0.0]]) == [] and index_vertices([]) == ([], [])
    assert adjacency_matrix(2, [], directed=True)[0][1] == math.inf


@given(edge_lists())
def test_list_and_transpose_round_trip(graph: tuple[int, list[tuple[int, int]]]) -> None:
    n, edges = graph
    adj = adjacency_list(n, edges, directed=True)
    assert sorted((u, v) for u in range(n) for v in adj[u]) == sorted(edges)
    assert [sorted(row) for row in transpose(transpose(adj))] == [sorted(row) for row in adj]
    undirected = adjacency_list(n, edges, directed=False)
    assert sum(len(row) for row in undirected) == 2 * len(edges)


@given(weighted_edge_lists())
def test_matrix_keeps_lightest_edge(graph: tuple[int, list[tuple[int, int, int]]]) -> None:
    n, edges = graph
    matrix = adjacency_matrix(n, edges, directed=True)
    for u, v, w in edges_from_matrix(matrix):
        assert w == min(x for a, b, x in edges if (a, b) == (u, v))
    names, numbered = index_vertices([(f"k{u}", f"k{v}") for u, v, _ in edges])
    assert [(names[a], names[b]) for a, b in numbered] == [(f"k{u}", f"k{v}") for u, v, _ in edges]
