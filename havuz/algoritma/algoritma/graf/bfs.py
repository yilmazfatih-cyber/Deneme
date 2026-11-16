"""Genişlik öncelikli arama (BFS): ağırlıksız grafta en kısa yol; 0-1 ağırlıklarda 0-1 BFS.

Fikir:
    Kaynaktan başlayıp önce 1 kenar uzaktaki köşeler, sonra 2 kenar uzaktakiler… ziyaret edilir.
    Bunu bir FIFO kuyruğu sağlar: kuyruktaki uzaklıklar hep "d, d, …, d+1, d+1" biçimindedir.
    Bir köşe ilk kez görüldüğünde uzaklığı kesinleşir; bu yüzden ağırlıksız grafta en kısa
    yolları O(n + m)'de verir. Ebeveyn dizisi tutulursa yolun kendisi geri izlenir.
    0-1 BFS: ağırlıklar yalnız 0 ya da 1 ise çift uçlu kuyruk kullanılır; 0'lık kenarla
    ulaşılan köşe başa, 1'lik kenarla ulaşılan sona eklenir. Dijkstra'nın O(m) özel hâli.

Karmaşıklık: zaman O(n + m); yer O(n)
Ne zaman: ağırlıksız en kısa yol (ızgara, sosyal ağda derece), katman katman gezinme,
    iki parçalılık sınaması; 0/1 ağırlıklarda `zero_one_bfs`.
Ne zaman değil: ağırlıklar farklıysa `dijkstra.py`; negatif ağırlık varsa `bellman_ford.py`.
Bağımlılık: yok
Genişletme: çok kaynaklı BFS için başlangıçta tüm kaynakları uzaklık 0 ile kuyruğa koyun.

Örnek:
    >>> adj = [[1, 2], [0, 3], [0, 3], [1, 2, 4], [3]]
    >>> bfs_distances(adj, 0), shortest_path_unweighted(adj, 0, 4)
    ([0, 1, 1, 2, 3], [0, 1, 3, 4])
    >>> zero_one_bfs([[(1, 1), (2, 0)], [], [(1, 0)]], 0)
    [0, 0, 0]
"""

from __future__ import annotations

from collections import deque
from collections.abc import Sequence


def bfs_distances(adj: Sequence[Sequence[int]], source: int) -> list[int]:
    """Kaynaktan her köşeye en az kenar sayısı; ulaşılamayanlar −1."""
    dist = [-1] * len(adj)
    dist[source] = 0
    queue = deque([source])
    while queue:
        u = queue.popleft()
        for v in adj[u]:
            if dist[v] == -1:
                dist[v] = dist[u] + 1
                queue.append(v)
    return dist


def bfs_order(adj: Sequence[Sequence[int]], source: int) -> list[int]:
    """Köşelerin BFS ile ilk görülme sırası."""
    seen = [False] * len(adj)
    seen[source] = True
    order = [source]
    head = 0
    while head < len(order):  # liste + baş işaretçisi = kuyruk
        u = order[head]
        head += 1
        for v in adj[u]:
            if not seen[v]:
                seen[v] = True
                order.append(v)
    return order


def shortest_path_unweighted(
    adj: Sequence[Sequence[int]], source: int, target: int
) -> list[int] | None:
    """En az kenarlı yolun köşeleri (kaynak ve hedef dahil); yol yoksa None."""
    parent = [-1] * len(adj)
    seen = [False] * len(adj)
    seen[source] = True
    queue = deque([source])
    while queue:
        u = queue.popleft()
        if u == target:
            path = [u]
            while path[-1] != source:
                path.append(parent[path[-1]])
            return path[::-1]
        for v in adj[u]:
            if not seen[v]:
                seen[v] = True
                parent[v] = u
                queue.append(v)
    return None


def zero_one_bfs(adj: Sequence[Sequence[tuple[int, int]]], source: int) -> list[float]:
    """Ağırlıkları 0 ya da 1 olan grafta en kısa uzaklıklar (ulaşılamayan: ∞)."""
    dist: list[float] = [float("inf")] * len(adj)
    dist[source] = 0
    queue = deque([source])
    while queue:
        u = queue.popleft()
        for v, w in adj[u]:
            if w not in (0, 1):
                raise ValueError(f"0-1 BFS yalnız 0 ya da 1 ağırlık kabul eder (bulunan: {w})")
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                if w == 0:
                    queue.appendleft(v)
                else:
                    queue.append(v)
    return dist
