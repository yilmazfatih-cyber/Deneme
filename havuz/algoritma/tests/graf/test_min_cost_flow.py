from __future__ import annotations

import itertools

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.graf.min_cost_flow import MinCostFlow


def brute_force(n: int, edges: list[tuple[int, int, int, int]], s: int, t: int) -> tuple[int, int]:
    """Her kenara 0 … kapasite arası tam sayı akış ata; korunumlu olanlardan (en büyük akış,
    o akıştaki en düşük maliyet) çiftini bul."""
    best = (0, 0)
    for flows in itertools.product(*[range(cap + 1) for _, _, cap, _ in edges]):
        balance = [0] * n
        for (u, v, _, _), f in zip(edges, flows):
            balance[u] -= f
            balance[v] += f
        if any(balance[v] for v in range(n) if v not in (s, t)):
            continue
        value = balance[t]
        cost = sum(f * c for (_, _, _, c), f in zip(edges, flows))
        if value > best[0] or (value == best[0] and cost < best[1]):
            best = (value, cost)
    return best


def test_assignment_matches_permutations() -> None:
    # 3 kurye, 3 teslimat; maliyet matrisi (dakika). Kaynak 0, kuryeler 1-3, işler 4-6, hedef 7
    cost = [[9, 2, 7], [6, 4, 3], [5, 8, 1]]
    net = MinCostFlow(8)
    for i in range(3):
        net.add_edge(0, 1 + i, 1, 0)
        net.add_edge(4 + i, 7, 1, 0)
        for j in range(3):
            net.add_edge(1 + i, 4 + j, 1, cost[i][j])
    best = min(sum(cost[i][p[i]] for i in range(3)) for p in itertools.permutations(range(3)))
    assert net.flow(0, 7) == (3, best) == (3, 9)


def test_edge_cases() -> None:
    net = MinCostFlow(3)
    a = net.add_edge(0, 1, 5, 2)
    net.add_edge(1, 2, 5, -1)  # negatif maliyetli kenar (döngü yok)
    assert net.flow(0, 2, limit=3) == (3, 3) and net.flow_on(a) == 3
    assert net.flow(0, 2, limit=0) == (0, 0)
    with pytest.raises(ValueError):
        net.flow(1, 1)
    with pytest.raises(ValueError):
        net.add_edge(0, 1, -2, 0)


@given(
    st.integers(2, 4),
    st.lists(
        st.tuples(st.integers(0, 3), st.integers(0, 3), st.integers(0, 2), st.integers(0, 5)),
        max_size=6,
    ),
)
def test_matches_brute_force(n: int, raw: list[tuple[int, int, int, int]]) -> None:
    edges = [(u % n, v % n, cap, cost) for u, v, cap, cost in raw if u % n != v % n]
    net = MinCostFlow(n)
    ids = [net.add_edge(u, v, cap, cost) for u, v, cap, cost in edges]
    assert net.flow(0, n - 1) == brute_force(n, edges, 0, n - 1)
    assert all(0 <= net.flow_on(i) <= edges[k][2] for k, i in enumerate(ids))
