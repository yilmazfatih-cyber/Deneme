"""Graf testleri için kaba kuvvet yardımcıları ve hypothesis stratejileri (kütüphaneden bağımsız).

Buradaki işlevler bilerek en basit (yavaş ama apaçık doğru) yoldan yazılmıştır; kütüphanedeki
gerçeklemeler bunlarla karşılaştırılır.
Genişletme: yeni bir kaba kuvvet denetimi gerekiyorsa buraya ekleyin.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

from hypothesis import strategies as st

Edge = tuple[int, int]
WEdge = tuple[int, int, int]


@st.composite
def edge_lists(
    draw: st.DrawFn, max_n: int = 7, max_m: int = 14, min_n: int = 1, loops: bool = True
) -> tuple[int, list[Edge]]:
    """(n, kenar listesi); yinelenen kenar ve (istenirse) öz döngü içerebilir."""
    n = draw(st.integers(min_n, max_n))
    if n == 0:
        return 0, []
    pair = st.tuples(st.integers(0, n - 1), st.integers(0, n - 1))
    edges = draw(st.lists(pair, max_size=max_m))
    if not loops:
        edges = [(u, v) for u, v in edges if u != v]
    return n, edges


@st.composite
def weighted_edge_lists(
    draw: st.DrawFn, max_n: int = 6, max_m: int = 12, low: int = 0, high: int = 9
) -> tuple[int, list[WEdge]]:
    n = draw(st.integers(1, max_n))
    triple = st.tuples(st.integers(0, n - 1), st.integers(0, n - 1), st.integers(low, high))
    return n, draw(st.lists(triple, max_size=max_m))


def adjacency(n: int, edges: Sequence[Edge], directed: bool) -> list[list[int]]:
    adj: list[list[int]] = [[] for _ in range(n)]
    for u, v in edges:
        adj[u].append(v)
        if not directed:
            adj[v].append(u)
    return adj


def weighted_adjacency(
    n: int, edges: Sequence[WEdge], directed: bool
) -> list[list[tuple[int, int]]]:
    adj: list[list[tuple[int, int]]] = [[] for _ in range(n)]
    for u, v, w in edges:
        adj[u].append((v, w))
        if not directed:
            adj[v].append((u, w))
    return adj


def reachability(n: int, edges: Sequence[Edge], directed: bool) -> list[list[bool]]:
    """reach[u][v]: u'dan v'ye (0 ya da daha çok kenarla) gidilebilir mi? Floyd–Warshall, O(n³)."""
    reach = [[u == v for v in range(n)] for u in range(n)]
    for u, v in edges:
        reach[u][v] = True
        if not directed:
            reach[v][u] = True
    for k in range(n):
        for i in range(n):
            if reach[i][k]:
                for j in range(n):
                    if reach[k][j]:
                        reach[i][j] = True
    return reach


def component_count(n: int, edges: Sequence[Edge], removed: int = -1) -> int:
    """Yönsüz grafta bağlı bileşen sayısı; `removed` köşesi (varsa) yok sayılır."""
    alive = [v for v in range(n) if v != removed]
    kept = [(u, v) for u, v in edges if removed not in (u, v)]
    reach = reachability(n, kept, directed=False)
    seen: set[int] = set()
    count = 0
    for v in alive:
        if v not in seen:
            count += 1
            seen.update(w for w in alive if reach[v][w])
    return count


def all_pairs_shortest(n: int, edges: Sequence[WEdge], directed: bool) -> list[list[float]]:
    """Negatif döngü yoksa doğru olan basit üçlü döngü (karşılaştırma için en sade biçim)."""
    dist = [[0.0 if i == j else math.inf for j in range(n)] for i in range(n)]
    for u, v, w in edges:
        dist[u][v] = min(dist[u][v], w)
        if not directed:
            dist[v][u] = min(dist[v][u], w)
    for k in range(n):
        for i in range(n):
            for j in range(n):
                if dist[i][k] + dist[k][j] < dist[i][j]:
                    dist[i][j] = dist[i][k] + dist[k][j]
    return dist


def is_valid_path(path: Sequence[int], edges: Sequence[Edge], directed: bool) -> bool:
    pairs = set(edges) | (set() if directed else {(v, u) for u, v in edges})
    return all((path[i], path[i + 1]) in pairs for i in range(len(path) - 1))
