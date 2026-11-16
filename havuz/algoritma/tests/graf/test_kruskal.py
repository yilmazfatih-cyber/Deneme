from __future__ import annotations

import itertools

from hypothesis import given

from algoritma.graf.kruskal import kruskal
from tests.graf.helpers import component_count, weighted_edge_lists


def brute_force_msf(n: int, edges: list[tuple[int, int, int]]) -> int:
    """En küçük kapsayan ormanın ağırlığı: bileşen sayısını koruyan en hafif kenar alt kümesi."""
    plain = [(u, v) for u, v, _ in edges]
    target = component_count(n, plain)
    size = n - target  # kapsayan ormandaki kenar sayısı
    best = None
    for subset in itertools.combinations(range(len(edges)), size):
        chosen = [plain[i] for i in subset]
        if component_count(n, chosen) == target:
            weight = sum(edges[i][2] for i in subset)
            best = weight if best is None else min(best, weight)
    return best if best is not None else 0


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
