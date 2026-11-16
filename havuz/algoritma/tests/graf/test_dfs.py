from __future__ import annotations

import sys

from hypothesis import given
from hypothesis import strategies as st

from algoritma.graf.dfs import dfs_postorder, dfs_preorder, find_directed_cycle
from tests.graf.helpers import adjacency, edge_lists, reachability


def _recursive_orders(adj: list[list[int]], source: int) -> tuple[list[int], list[int]]:
    """Başvuru: ders kitabındaki özyinelemeli DFS (yalnız küçük graflarda)."""
    seen = [False] * len(adj)
    pre: list[int] = []
    post: list[int] = []

    def visit(u: int) -> None:
        seen[u] = True
        pre.append(u)
        for v in adj[u]:
            if not seen[v]:
                visit(v)
        post.append(u)

    visit(source)
    return pre, post


def test_hand_checked_example() -> None:
    adj = [[1, 3], [2], [], [2]]
    assert dfs_preorder(adj, 0) == [0, 1, 2, 3] and dfs_postorder(adj, 0) == [2, 1, 3, 0]
    assert find_directed_cycle([[1], [2], [1]]) == [1, 2]


def test_edge_cases() -> None:
    assert dfs_preorder([[]], 0) == [0] and dfs_postorder([[]], 0) == [0]
    assert find_directed_cycle([]) is None and find_directed_cycle([[0]]) == [0]  # öz döngü
    n = sys.getrecursionlimit() * 3  # özyinelemeli sürüm burada çökerdi
    chain = [[i + 1] for i in range(n - 1)] + [[]]
    assert dfs_postorder(chain, 0)[0] == n - 1


@given(edge_lists(), st.data())
def test_orders_match_recursive_reference(
    graph: tuple[int, list[tuple[int, int]]], data: st.DataObject
) -> None:
    n, edges = graph
    adj = adjacency(n, edges, directed=True)
    source = data.draw(st.integers(0, n - 1))
    assert (dfs_preorder(adj, source), dfs_postorder(adj, source)) == _recursive_orders(adj, source)


@given(edge_lists())
def test_cycle_detection_matches_brute_force(graph: tuple[int, list[tuple[int, int]]]) -> None:
    n, edges = graph
    reach = reachability(n, edges, directed=True)
    has_cycle = any(reach[v][u] for u, v in edges)  # u→v kenarı ve v'den u'ya dönüş
    cycle = find_directed_cycle(adjacency(n, edges, directed=True))
    assert (cycle is not None) == has_cycle
    if cycle is not None:
        edge_set = set(edges)
        assert all((cycle[i - 1], cycle[i]) in edge_set for i in range(len(cycle)))
        assert len(set(cycle)) == len(cycle)
