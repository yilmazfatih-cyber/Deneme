from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.graf.lca_binary_lifting import LowestCommonAncestor


@st.composite
def trees(draw: st.DrawFn) -> tuple[int, list[tuple[int, int]], int]:
    n = draw(st.integers(1, 30))
    edges = [(draw(st.integers(0, v - 1)), v) for v in range(1, n)]  # her köşe öncekine bağlı
    return n, edges, draw(st.integers(0, n - 1))


def _parents(n: int, edges: list[tuple[int, int]], root: int) -> list[int]:
    adj: list[list[int]] = [[] for _ in range(n)]
    for u, v in edges:
        adj[u].append(v)
        adj[v].append(u)
    parent = [-1] * n
    seen = {root}
    order = [root]
    for u in order:
        for v in adj[u]:
            if v not in seen:
                seen.add(v)
                parent[v] = u
                order.append(v)
    return parent


def _ancestors(parent: list[int], v: int) -> list[int]:
    chain = [v]
    while parent[chain[-1]] != -1:
        chain.append(parent[chain[-1]])
    return chain


def test_hand_checked_example() -> None:
    # aile ağacı: 0 dede; 1, 2 çocuklar; 3, 4 torunlar (1'in); 5 torun (2'nin)
    tree = LowestCommonAncestor(6, [(0, 1), (0, 2), (1, 3), (1, 4), (2, 5)])
    assert tree.lca(3, 4) == 1 and tree.lca(4, 5) == 0 and tree.lca(3, 1) == 1
    assert (
        tree.distance(3, 5) == 4 and tree.kth_ancestor(5, 2) == 0 and tree.kth_ancestor(5, 3) == -1
    )


def test_edge_cases() -> None:
    single = LowestCommonAncestor(1, [])
    assert single.lca(0, 0) == 0 and single.distance(0, 0) == 0
    with pytest.raises(ValueError):
        LowestCommonAncestor(3, [(0, 1)])
    with pytest.raises(ValueError):
        LowestCommonAncestor(4, [(0, 1), (1, 0), (2, 3)])  # bağlı değil
    n = 50_000
    path = LowestCommonAncestor(n, [(i, i + 1) for i in range(n - 1)])  # derin ağaç
    assert path.lca(n - 1, 12_345) == 12_345 and path.kth_ancestor(n - 1, n - 1) == 0


@given(trees(), st.data())
def test_matches_brute_force(
    tree: tuple[int, list[tuple[int, int]], int], data: st.DataObject
) -> None:
    n, edges, root = tree
    lca = LowestCommonAncestor(n, edges, root)
    parent = _parents(n, edges, root)
    for _ in range(10):
        u, v = data.draw(st.integers(0, n - 1)), data.draw(st.integers(0, n - 1))
        up_u, up_v = _ancestors(parent, u), _ancestors(parent, v)
        common = next(a for a in up_u if a in up_v)
        assert lca.lca(u, v) == common
        assert lca.distance(u, v) == up_u.index(common) + up_v.index(common)
        k = data.draw(st.integers(0, n))
        assert lca.kth_ancestor(u, k) == (up_u[k] if k < len(up_u) else -1)
