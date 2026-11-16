"""A*: hedefe tahmini uzaklığı (sezgisel) kullanıp Dijkstra'dan az köşe gezen en kısa yol araması.

Fikir:
    Dijkstra köşeleri kaynaktan uzaklığa (g) göre açar. A* ise f = g + h'ye göre açar; h(v),
    v'den hedefe kalan yolun tahminidir. h hiçbir zaman gerçeği AŞMIYORSA (kabul edilebilir)
    hedef yığından ilk çıktığında bulunan yol en kısadır. h ayrıca tutarlıysa
    (h(u) ≤ w(u, v) + h(v)) her köşe en çok bir kez açılır. h ≡ 0 iken A* = Dijkstra.
    Izgarada 4 yönlü harekette Manhattan uzaklığı (|dx| + |dy|) kabul edilebilir ve tutarlıdır.
    Köşeler herhangi bir hash'lenebilir değer olabilir; komşular bir fonksiyonla üretilir
    (graf önceden kurulmak zorunda değil: bulmaca durumları, sonsuz ızgaralar).

Karmaşıklık: zaman en kötü O((n + m) log n) (h ≡ 0); iyi bir h ile çok daha az; yer O(n)
Ne zaman: tek kaynak–tek hedef, hedefe iyi bir alt tahmin var (harita, oyun, bulmaca).
Ne zaman değil: tüm köşelere uzaklık gerekiyorsa `dijkstra.py`; h abartıyorsa sonuç en kısa olmaz.
Bağımlılık: yok
Genişletme: 8 yönlü ızgara için komşulara çaprazları (maliyet √2), h olarak oktil uzaklığı ekleyin.

Örnek:
    >>> grid = ["....",
    ...         ".##.",
    ...         "...."]
    >>> grid_shortest_path(grid, (0, 0), (2, 3))
    (5, [(0, 0), (1, 0), (2, 0), (2, 1), (2, 2), (2, 3)])
"""

from __future__ import annotations

import heapq
import itertools
from collections.abc import Callable, Hashable, Iterable, Sequence
from typing import TypeVar

N = TypeVar("N", bound=Hashable)


def a_star(
    start: N,
    goal: N,
    neighbors: Callable[[N], Iterable[tuple[N, float]]],
    heuristic: Callable[[N], float],
) -> tuple[float, list[N]] | None:
    """(maliyet, yol). `neighbors(v)` → (komşu, kenar maliyeti ≥ 0); h kabul edilebilir olmalı."""
    tie = itertools.count()  # eşit f'lerde köşeleri karşılaştırmak gerekmesin
    best: dict[N, float] = {start: 0}
    parent: dict[N, N] = {}
    heap: list[tuple[float, int, float, N]] = [(heuristic(start), next(tie), 0, start)]
    while heap:
        _, _, g, node = heapq.heappop(heap)
        if g > best[node]:
            continue  # bayat kayıt (daha iyi bir yolla yeniden itildi)
        if node == goal:
            path = [node]
            while path[-1] in parent:
                path.append(parent[path[-1]])
            return g, path[::-1]
        for nxt, cost in neighbors(node):
            candidate = g + cost
            if candidate < best.get(nxt, float("inf")):
                best[nxt] = candidate
                parent[nxt] = node
                heapq.heappush(heap, (candidate + heuristic(nxt), next(tie), candidate, nxt))
    return None


def grid_shortest_path(
    grid: Sequence[str], start: tuple[int, int], goal: tuple[int, int]
) -> tuple[float, list[tuple[int, int]]] | None:
    """'#' duvar, diğer hücreler yol; 4 yönlü, adım maliyeti 1. (adım, hücreler) ya da None."""
    rows, cols = len(grid), len(grid[0]) if grid else 0

    def open_cell(r: int, c: int) -> bool:
        return 0 <= r < rows and 0 <= c < cols and grid[r][c] != "#"

    def neighbors(cell: tuple[int, int]) -> Iterable[tuple[tuple[int, int], float]]:
        r, c = cell
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if open_cell(r + dr, c + dc):
                yield (r + dr, c + dc), 1

    def manhattan(cell: tuple[int, int]) -> float:
        return abs(cell[0] - goal[0]) + abs(cell[1] - goal[1])

    if not open_cell(*start) or not open_cell(*goal):
        return None
    return a_star(start, goal, neighbors, manhattan)
