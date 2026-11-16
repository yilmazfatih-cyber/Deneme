from __future__ import annotations

import itertools

from hypothesis import given

from algoritma.graf.topological_sort import (
    smallest_topological_order,
    topological_sort_dfs,
    topological_sort_kahn,
)
from tests.graf.helpers import adjacency, edge_lists, reachability


def _respects(order: list[int], edges: list[tuple[int, int]]) -> bool:
    position = {v: i for i, v in enumerate(order)}
    return all(position[u] < position[v] for u, v in edges)


def test_hand_checked_example() -> None:
    # ders önkoşulları: 0 matematik, 1 fizik, 2 programlama, 3 algoritma, 4 proje
    adj = [[1, 3], [4], [3], [4], []]
    assert smallest_topological_order(adj) == [0, 1, 2, 3, 4]
    for order in (topological_sort_kahn(adj), topological_sort_dfs(adj)):
        assert order is not None
        assert _respects(order, [(0, 1), (0, 3), (1, 4), (2, 3), (3, 4)])


def test_edge_cases() -> None:
    for sort in (topological_sort_kahn, topological_sort_dfs, smallest_topological_order):
        assert sort([]) == [] and sort([[]]) == [0] and sort([[0]]) is None
    long_chain = [[i + 1] for i in range(19_999)] + [[]]
    assert topological_sort_dfs(long_chain) == list(range(20_000))


@given(edge_lists(max_n=6, max_m=9))
def test_matches_brute_force(graph: tuple[int, list[tuple[int, int]]]) -> None:
    n, edges = graph
    adj = adjacency(n, edges, directed=True)
    reach = reachability(n, edges, directed=True)
    acyclic = not any(reach[v][u] for u, v in edges)
    for order in (topological_sort_kahn(adj), topological_sort_dfs(adj)):
        assert (order is not None) == acyclic
        if order is not None:
            assert sorted(order) == list(range(n)) and _respects(order, edges)
    smallest = smallest_topological_order(adj)
    valid = [list(p) for p in itertools.permutations(range(n)) if _respects(list(p), edges)]
    assert smallest == (min(valid) if valid else None)
