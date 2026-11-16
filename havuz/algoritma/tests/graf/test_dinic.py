from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.graf.dinic import Dinic


def brute_force_min_cut(n: int, edges: list[tuple[int, int, int]], s: int, t: int) -> int:
    """En küçük s–t kesimi: s'yi içeren ama t'yi içermeyen her köşe kümesini dene."""
    others = [v for v in range(n) if v not in (s, t)]
    best = None
    for mask in range(1 << len(others)):
        side = {s} | {v for i, v in enumerate(others) if mask >> i & 1}
        cut = sum(c for u, v, c in edges if u in side and v not in side)
        best = cut if best is None else min(best, cut)
    return best if best is not None else 0


def test_hand_checked_example() -> None:
    # CLRS'teki klasik ağ: en büyük akış 23
    edges = [(0, 1, 16), (0, 2, 13), (1, 2, 10), (2, 1, 4), (1, 3, 12), (3, 2, 9),
             (2, 4, 14), (4, 3, 7), (3, 5, 20), (4, 5, 4)]  # fmt: skip
    net = Dinic(6)
    ids = [net.add_edge(u, v, c) for u, v, c in edges]
    assert net.max_flow(0, 5) == 23
    side = net.min_cut_side(0)
    assert sum(c for u, v, c in edges if u in side and v not in side) == 23
    for v in range(1, 5):  # akış korunumu
        inflow = sum(net.flow_on(i) for i, (_, b, _) in zip(ids, edges) if b == v)
        outflow = sum(net.flow_on(i) for i, (a, _, _) in zip(ids, edges) if a == v)
        assert inflow == outflow


def test_edge_cases() -> None:
    net = Dinic(2)
    assert net.max_flow(0, 1) == 0 and net.min_cut_side(0) == [0]
    with pytest.raises(ValueError):
        net.max_flow(0, 0)
    with pytest.raises(ValueError):
        net.add_edge(0, 1, -1)
    chain = Dinic(5000)  # uzun yol: özyinelemesiz DFS
    for v in range(4999):
        chain.add_edge(v, v + 1, 3)
    assert chain.max_flow(0, 4999) == 3


@given(
    st.integers(2, 6),
    st.lists(st.tuples(st.integers(0, 5), st.integers(0, 5), st.integers(0, 7)), max_size=14),
)
def test_matches_brute_force_min_cut(n: int, raw: list[tuple[int, int, int]]) -> None:
    edges = [(u % n, v % n, c) for u, v, c in raw]
    net = Dinic(n)
    ids = [net.add_edge(u, v, c) for u, v, c in edges]
    flow = net.max_flow(0, n - 1)
    assert flow == brute_force_min_cut(n, edges, 0, n - 1)
    for edge_id, (_, _, c) in zip(ids, edges):
        assert 0 <= net.flow_on(edge_id) <= c
    side = set(net.min_cut_side(0))
    assert n - 1 not in side
    assert sum(c for u, v, c in edges if u in side and v not in side) == flow
