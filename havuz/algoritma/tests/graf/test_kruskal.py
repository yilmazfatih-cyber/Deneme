from __future__ import annotations

from hypothesis import given

from algoritma.graf.kruskal import kruskal
from tests.graf.helpers import brute_force_msf, component_count, weighted_edge_lists


def test_hand_checked_example() -> None:
    # köyler arası su borusu: en ucuz bağlantı ağı
    edges = [(0, 1, 7), (0, 3, 5), (1, 2, 8), (1, 3, 9), (1, 4, 7), (2, 4, 5), (3, 4, 15)]
    total, chosen = kruskal(5, edges)
    assert total == 24 and len(chosen) == 4


def test_edge_cases() -> None:
    assert kruskal(0, []) == (0, []) and kruskal(1, [(0, 0, -5)]) == (0, [])  # öz döngü alınmaz
    assert kruskal(4, [(0, 1, 2), (2, 3, -1)]) == (1, [(2, 3, -1), (0, 1, 2)])  # orman
    assert kruskal(2, [(0, 1, 3), (0, 1, 1)]) == (1, [(0, 1, 1)])  # paralel kenar


@given(weighted_edge_lists(max_n=6, max_m=9, low=-3, high=9))
def test_matches_brute_force(graph: tuple[int, list[tuple[int, int, int]]]) -> None:
    n, edges = graph
    total, chosen = kruskal(n, edges)
    assert total == brute_force_msf(n, edges)
    plain = [(u, v) for u, v, _ in edges]
    assert component_count(n, [(u, v) for u, v, _ in chosen]) == component_count(n, plain)
    assert len(chosen) == n - component_count(n, plain)  # döngüsüz
