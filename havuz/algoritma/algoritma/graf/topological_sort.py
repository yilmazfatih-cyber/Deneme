"""Topolojik sıralama: yönlü döngüsüz grafta (DAG) her kenar u→v için u'yu v'den önce dizer.

Fikir:
    Kahn: giriş derecesi 0 olan (hiçbir şeye bağımlı olmayan) köşeler kuyruğa alınır; biri
    çıkarılıp sıraya yazılınca onun kenarları silinmiş sayılır ve derecesi 0'a düşenler kuyruğa
    girer. Sonunda sıraya yazılan köşe sayısı n'den azsa grafta döngü vardır. Kuyruk yerine
    öncelik kuyruğu kullanılırsa sözlükte en küçük topolojik sıra elde edilir.
    DFS: bir köşe, ondan ulaşılabilen her şey bittikten sonra "biter" (son sıra). Son sıranın
    tersi topolojik sıradır. Döngü varsa gri köşeye geri kenar görülür.

Karmaşıklık: zaman O(n + m) (sözlük sıralı sürüm O(m + n log n)); yer O(n)
Ne zaman: bağımlılık çözme (derleme sırası, ders önkoşulları, iş akışı), DAG üstünde DP.
Ne zaman değil: grafta döngü olabiliyorsa ve yine de sıra gerekiyorsa önce güçlü bağlı
    bileşenleri bulup (`tarjan_scc.py`) bileşen grafını sıralayın.
Bağımlılık: yok
Genişletme: paralel yürütme katmanları için Kahn'da kuyruğu tur tur boşaltın (her tur bir katman).

Örnek:
    >>> adj = [[1, 2], [3], [3], []]
    >>> topological_sort_kahn(adj), topological_sort_dfs(adj), smallest_topological_order(adj)
    ([0, 1, 2, 3], [0, 2, 1, 3], [0, 1, 2, 3])
    >>> topological_sort_kahn([[1], [0]]) is None
    True
"""

from __future__ import annotations

import heapq
from collections import deque
from collections.abc import Sequence


def _in_degrees(adj: Sequence[Sequence[int]]) -> list[int]:
    degree = [0] * len(adj)
    for neighbors in adj:
        for v in neighbors:
            degree[v] += 1
    return degree


def topological_sort_kahn(adj: Sequence[Sequence[int]]) -> list[int] | None:
    """Kahn algoritması; döngü varsa None."""
    degree = _in_degrees(adj)
    queue = deque(v for v in range(len(adj)) if degree[v] == 0)
    order: list[int] = []
    while queue:
        u = queue.popleft()
        order.append(u)
        for v in adj[u]:
            degree[v] -= 1
            if degree[v] == 0:
                queue.append(v)
    return order if len(order) == len(adj) else None


def smallest_topological_order(adj: Sequence[Sequence[int]]) -> list[int] | None:
    """Sözlükte en küçük topolojik sıra (her adımda hazır olanların en küçüğü); döngüde None."""
    degree = _in_degrees(adj)
    heap = [v for v in range(len(adj)) if degree[v] == 0]
    heapq.heapify(heap)
    order: list[int] = []
    while heap:
        u = heapq.heappop(heap)
        order.append(u)
        for v in adj[u]:
            degree[v] -= 1
            if degree[v] == 0:
                heapq.heappush(heap, v)
    return order if len(order) == len(adj) else None


def topological_sort_dfs(adj: Sequence[Sequence[int]]) -> list[int] | None:
    """DFS son sırasının tersi (özyinelemesiz); döngü varsa None."""
    white, gray, black = 0, 1, 2
    color = [white] * len(adj)
    finished: list[int] = []
    for root in range(len(adj)):
        if color[root] != white:
            continue
        color[root] = gray
        stack = [(root, 0)]
        while stack:
            u, i = stack[-1]
            if i == len(adj[u]):
                color[u] = black
                finished.append(u)
                stack.pop()
                continue
            stack[-1] = (u, i + 1)
            v = adj[u][i]
            if color[v] == gray:
                return None  # geri kenar: döngü
            if color[v] == white:
                color[v] = gray
                stack.append((v, 0))
    return finished[::-1]
