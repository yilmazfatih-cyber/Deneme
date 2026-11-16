from __future__ import annotations

import math

import pytest
from hypothesis import given

from algoritma.graf.floyd_warshall import floyd_warshall, has_negative_cycle, reconstruct_path
from tests.graf.helpers import weighted_edge_lists


def _simple_path_matrix(n: int, edges: list[tuple[int, int, int]]) -> list[list[float]]:
    """Kaba kuvvet: her kaynaktan tüm basit yollar (negatif döngü yoksa en kısalar basittir)."""
    weight: dict[tuple[int, int], int] = {}
    for u, v, w in edges:
        weight[(u, v)] = min(w, weight.get((u, v), w))
    result = [[math.inf] * n for _ in range(n)]
    for source in range(n):
        stack: list[tuple[int, float, frozenset[int]]] = [(source, 0, frozenset([source]))]
        while stack:
            u, d, used = stack.pop()
            result[source][u] = min(result[source][u], d)
            for (a, b), w in weight.items():
                if a == u and b not in used:
                    stack.append((b, d + w, used | {b}))
    return result


def test_hand_checked_example() -> None:
    dist, nxt = floyd_warshall(4, [(0, 1, 3), (1, 2, 1), (2, 3, 1), (0, 3, 10), (3, 0, 2)])
    assert dist[0][3] == 5 and dist[3][2] == 6
    assert reconstruct_path(nxt, 0, 3) == [0, 1, 2, 3] and reconstruct_path(nxt, 2, 2) == [2]


def test_edge_cases() -> None:
    dist, nxt = floyd_warshall(2, [])
    assert dist == [[0, math.inf], [math.inf, 0]] and reconstruct_path(nxt, 0, 1) is None
    dist, nxt = floyd_warshall(2, [(0, 1, -1), (1, 0, -1)])
    assert has_negative_cycle(dist)
    looping = [[0, 1, 1], [0, 1, 0], [0, 0, 2]]  # negatif döngüde oluşabilecek kısır döngü
    with pytest.raises(ValueError, match="negatif döngü"):
        reconstruct_path(looping, 0, 2)
    assert floyd_warshall(0, []) == ([], [])


@given(weighted_edge_lists(max_n=5, max_m=9, low=-3, high=8))
def test_matches_brute_force(graph: tuple[int, list[tuple[int, int, int]]]) -> None:
    n, edges = graph
    dist, nxt = floyd_warshall(n, edges)
    brute = _simple_path_matrix(n, edges)
    # negatif döngü ⇔ bir (u, v, w) kenarı + v'den u'ya basit yol toplamı negatif
    negative = any(brute[v][u] + w < 0 for u, v, w in edges)
    assert has_negative_cycle(dist) == negative
    if negative:
        return
    assert dist == brute
    weight = {(u, v): min(w for a, b, w in edges if (a, b) == (u, v)) for u, v, _ in edges}
    for u in range(n):
        for v in range(n):
            path = reconstruct_path(nxt, u, v)
            assert (path is None) == (dist[u][v] == math.inf)
            if path is not None:
                total = sum(weight[(path[i], path[i + 1])] for i in range(len(path) - 1))
                assert path[0] == u and path[-1] == v and total == dist[u][v]
