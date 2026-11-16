from __future__ import annotations

import math

from hypothesis import given
from hypothesis import strategies as st

from algoritma.graf.bellman_ford import bellman_ford, find_negative_cycle
from tests.graf.helpers import all_pairs_shortest, reachability, weighted_edge_lists


def _min_weight(edges: list[tuple[int, int, int]]) -> dict[tuple[int, int], int]:
    best: dict[tuple[int, int], int] = {}
    for u, v, w in edges:
        best[(u, v)] = min(w, best.get((u, v), w))
    return best


def _simple_path_distances(n: int, edges: list[tuple[int, int, int]], source: int) -> list[float]:
    """Kaba kuvvet: tüm BASİT yolları gez (negatif döngü yoksa en kısa yollar basittir)."""
    weight = _min_weight(edges)
    dist: list[float] = [math.inf] * n
    stack: list[tuple[int, float, frozenset[int]]] = [(source, 0, frozenset([source]))]
    while stack:
        u, d, used = stack.pop()
        dist[u] = min(dist[u], d)
        for (a, b), w in weight.items():
            if a == u and b not in used:
                stack.append((b, d + w, used | {b}))
    return dist


def _negative_cycle_reachable(n: int, edges: list[tuple[int, int, int]], source: int) -> bool:
    """Bir köşe kendine negatif uzunlukta dönebiliyor ve kaynaktan ulaşılabiliyor mu?"""
    dist = all_pairs_shortest(n, edges, directed=True)
    reach = reachability(n, [(u, v) for u, v, _ in edges], directed=True)
    return any(dist[v][v] < 0 and reach[source][v] for v in range(n))


def _cycle_total(cycle: list[int], edges: list[tuple[int, int, int]]) -> int:
    weight = _min_weight(edges)
    return sum(weight[(cycle[i - 1], cycle[i])] for i in range(len(cycle)))


def test_hand_checked_example() -> None:
    # döviz arbitrajı: −log(kur) ağırlıklarında negatif döngü kâr demektir
    edges = [(0, 1, -2), (1, 2, 1), (2, 0, 0), (2, 3, 4)]
    _, _, cycle = bellman_ford(4, edges, 0)
    assert cycle is not None and sorted(cycle) == [0, 1, 2]
    dist, parent, cycle = bellman_ford(3, [(0, 1, 5), (1, 2, -7)], 0)
    assert (dist, parent, cycle) == ([0, 5, -2], [-1, 0, 1], None)


def test_edge_cases() -> None:
    assert bellman_ford(1, [], 0) == ([0], [-1], None)
    assert bellman_ford(2, [(1, 1, -1)], 0)[2] is None  # ulaşılamayan negatif öz döngü
    assert find_negative_cycle(2, [(1, 1, -1)]) == [1]
    assert find_negative_cycle(3, [(0, 1, 1), (1, 0, -1)]) is None  # toplam 0: negatif değil


@given(weighted_edge_lists(max_n=5, max_m=8, low=-4, high=6), st.data())
def test_matches_brute_force(
    graph: tuple[int, list[tuple[int, int, int]]], data: st.DataObject
) -> None:
    n, edges = graph
    source = data.draw(st.integers(0, n - 1))
    dist, _, cycle = bellman_ford(n, edges, source)
    assert (cycle is not None) == _negative_cycle_reachable(n, edges, source)
    if cycle is None:
        assert dist == _simple_path_distances(n, edges, source)
    else:
        assert _cycle_total(cycle, edges) < 0 and len(set(cycle)) == len(cycle)
    anywhere = find_negative_cycle(n, edges)
    expected = any(_negative_cycle_reachable(n, edges, s) for s in range(n))
    assert (anywhere is not None) == expected
    if anywhere is not None:
        assert _cycle_total(anywhere, edges) < 0
