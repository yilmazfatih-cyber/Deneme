from __future__ import annotations

from collections import Counter

from hypothesis import given

from algoritma.graf.euler_path import euler_path_directed, euler_path_undirected
from tests.graf.helpers import edge_lists


def _exists_by_backtracking(edges: list[tuple[int, int]], directed: bool) -> bool:
    """Kaba kuvvet: her başlangıçtan, kenarları teker teker deneyerek tümünü kullanabilir miyiz?"""
    if not edges:
        return True
    m = len(edges)

    def extend(v: int, used: int) -> bool:
        if used == (1 << m) - 1:
            return True
        for i, (a, b) in enumerate(edges):
            if used >> i & 1:
                continue
            if a == v and extend(b, used | 1 << i):
                return True
            if not directed and b == v and extend(a, used | 1 << i):
                return True
        return False

    starts = {u for u, _ in edges} | (set() if directed else {v for _, v in edges})
    return any(extend(s, 0) for s in starts)


def _uses_each_edge_once(path: list[int], edges: list[tuple[int, int]], directed: bool) -> bool:
    steps = [(path[i], path[i + 1]) for i in range(len(path) - 1)]
    if not directed:
        steps = [(min(a, b), max(a, b)) for a, b in steps]
        edges = [(min(a, b), max(a, b)) for a, b in edges]
    return Counter(steps) == Counter(edges)


def test_hand_checked_example() -> None:
    # "zarf" çizimi: kalemi kaldırmadan, her çizgiden bir kez
    house = [(0, 1), (1, 2), (2, 3), (3, 0), (0, 2), (1, 3), (2, 4), (4, 3)]
    path = euler_path_undirected(5, house)
    assert path is not None and _uses_each_edge_once(path, house, directed=False)
    assert {path[0], path[-1]} == {0, 1}  # tek dereceli iki köşe


def test_edge_cases() -> None:
    assert euler_path_directed(3, []) == [] and euler_path_undirected(3, []) == []
    assert euler_path_undirected(2, [(0, 0)]) == [0, 0]  # öz döngü
    assert euler_path_directed(4, [(0, 1), (2, 3)]) is None  # bağlı değil
    assert euler_path_undirected(4, [(0, 1), (2, 3)]) is None
    big = [(i, (i + 1) % 20_000) for i in range(20_000)]
    assert len(euler_path_directed(20_000, big) or []) == 20_001


@given(edge_lists(max_n=5, max_m=7))
def test_directed_matches_backtracking(graph: tuple[int, list[tuple[int, int]]]) -> None:
    n, edges = graph
    path = euler_path_directed(n, edges)
    assert (path is not None) == _exists_by_backtracking(edges, directed=True)
    if path:
        assert _uses_each_edge_once(path, edges, directed=True)


@given(edge_lists(max_n=5, max_m=7))
def test_undirected_matches_backtracking(graph: tuple[int, list[tuple[int, int]]]) -> None:
    n, edges = graph
    path = euler_path_undirected(n, edges)
    assert (path is not None) == _exists_by_backtracking(edges, directed=False)
    if path:
        assert _uses_each_edge_once(path, edges, directed=False)
