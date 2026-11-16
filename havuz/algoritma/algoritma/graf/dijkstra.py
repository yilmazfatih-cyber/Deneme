"""Dijkstra: negatif olmayan ağırlıklı grafta tek kaynaktan tüm köşelere en kısa yollar.

Fikir:
    Kaynaktan uzaklığı kesinleşmemiş köşeler arasında en yakını seçilir; negatif kenar
    olmadığından ona daha kısa bir yol bulunamaz, uzaklığı kesinleşir. Sonra onun kenarları
    "gevşetilir": dist[u] + w < dist[v] ise dist[v] güncellenir ve ebeveyni u olur.
    En yakını seçmek için ikili yığın (heapq) kullanılır. Python'da anahtar azaltma yerine
    "tembel silme" yapılır: güncellenen köşe yığına yeniden itilir; eski (bayat) kayıt
    çıkınca `d > dist[u]` denetimiyle atlanır. Ebeveyn dizisinden yolun kendisi geri izlenir.

Karmaşıklık: zaman O((n + m) log n); yer O(n + m)
Ne zaman: yol ağı, ağ gecikmesi, oyun haritası — ağırlıklar ≥ 0 olan her en kısa yol sorusu.
Ne zaman değil: negatif ağırlık varsa `bellman_ford.py` (Dijkstra yanlış sonuç verir; bu
    gerçekleme negatif kenarda ValueError fırlatır). Ağırlıksız grafta `bfs.py` daha hızlıdır.
    Tek hedef ve iyi bir sezgisel varsa `a_star.py` daha az köşe gezer.
Bağımlılık: yok
Genişletme: tek hedef sorulursa hedef yığından çıktığı anda döngüyü bitirerek hızlandırın.

Örnek:
    >>> adj = [[(1, 4), (2, 1)], [(3, 1)], [(1, 2), (3, 5)], []]
    >>> dijkstra(adj, 0)
    ([0, 3, 1, 4], [-1, 2, 0, 1])
    >>> shortest_path(adj, 0, 3)
    (4, [0, 2, 1, 3])
"""

from __future__ import annotations

import heapq
import math
from collections.abc import Sequence


def dijkstra(
    adj: Sequence[Sequence[tuple[int, float]]], source: int
) -> tuple[list[float], list[int]]:
    """(uzaklıklar, ebeveynler). Ulaşılamayan köşe: uzaklık ∞, ebeveyn −1."""
    for u, neighbors in enumerate(adj):
        for v, w in neighbors:
            if w < 0:
                raise ValueError(
                    f"negatif ağırlıklı kenar {u}→{v} ({w}): Dijkstra yerine bellman_ford kullanın"
                )
    dist: list[float] = [math.inf] * len(adj)
    parent = [-1] * len(adj)
    dist[source] = 0
    heap: list[tuple[float, int]] = [(0, source)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]:
            continue  # bayat kayıt: u daha kısa bir yolla zaten işlendi
        for v, w in adj[u]:
            candidate = d + w
            if candidate < dist[v]:
                dist[v] = candidate
                parent[v] = u
                heapq.heappush(heap, (candidate, v))
    return dist, parent


def path_from_parents(parent: Sequence[int], target: int) -> list[int]:
    """Ebeveyn dizisinden kökten `target`'a yol (target'a ulaşılamadıysa yalnız [target])."""
    path = [target]
    while parent[path[-1]] != -1:
        path.append(parent[path[-1]])
    return path[::-1]


def shortest_path(
    adj: Sequence[Sequence[tuple[int, float]]], source: int, target: int
) -> tuple[float, list[int]] | None:
    """(uzaklık, yol köşeleri); hedefe ulaşılamıyorsa None."""
    dist, parent = dijkstra(adj, source)
    if dist[target] == math.inf:
        return None
    return dist[target], path_from_parents(parent, target)
