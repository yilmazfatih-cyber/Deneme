from __future__ import annotations

from hypothesis import given

from algoritma.graf.prim import prim
from tests.graf.helpers import brute_force_msf, component_count, weighted_edge_lists


def test_hand_checked_example() -> None:
    edges = [(0, 1, 7), (0, 3, 5), (1, 2, 8), (1, 3, 9), (1, 4, 7), (2, 4, 5), (3, 4, 15)]
    total, chosen = prim(5, edges)
    assert total == 24 and [v for _, v, _ in chosen] == [3, 1, 4, 2]


def test_edge_cases() -> None:
    assert prim(0, []) == (0, []) and prim(1, [(0, 0, 1)]) == (0, [])
    assert prim(3, [(1, 2, 4)]) == (4, [(1, 2, 4)])  # 0 yalnız: orman


@given(weighted_edge_lists(max_n=6, max_m=9, low=-3, high=9))
def test_matches_brute_force(graph: tuple[int, list[tuple[int, int, int]]]) -> None:
    n, edges = graph
    total, chosen = prim(n, edges)
    assert total == brute_force_msf(n, edges)
    plain = [(u, v) for u, v, _ in edges]
    assert component_count(n, [(u, v) for u, v, _ in chosen]) == component_count(n, plain)
