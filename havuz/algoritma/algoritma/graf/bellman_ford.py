"""Bellman-Ford: negatif ağırlıklarda da en kısa yollar; ulaşılabilir negatif döngüyü bulur.

Fikir:
    Tüm kenarlar n−1 kez gevşetilir. i. turdan sonra, en çok i kenarlı en kısa yollar doğrudur;
    negatif döngü yoksa en kısa yol en çok n−1 kenarlıdır, dolayısıyla n−1 tur yeter. n. turda
    hâlâ bir kenar gevşiyorsa kaynaktan ulaşılabilen bir negatif döngü vardır: o köşeden ebeveyn
    zincirinde n adım geri gidilince kesinlikle döngünün içine düşülür, döngü oradan okunur.
    Bir turda hiçbir şey değişmezse erken durulur.

Karmaşıklık: zaman O(n · m); yer O(n)
Ne zaman: negatif ağırlık (ör. kâr/zarar, döviz kuru logaritmaları) ya da negatif döngü
    (arbitraj) sorusu; fark kısıtları sistemleri.
Ne zaman değil: tüm ağırlıklar ≥ 0 ise `dijkstra.py` çok daha hızlıdır.
Bağımlılık: yok
Genişletme: tüm grafta (kaynaktan bağımsız) negatif döngü için `find_negative_cycle` sanal bir
    kaynaktan her köşeye 0 ağırlıklı kenar eklemiş gibi davranır.

Örnek:
    >>> edges = [(0, 1, 4), (0, 2, 5), (1, 2, -3), (2, 3, 2)]
    >>> bellman_ford(4, edges, 0)
    ([0, 4, 1, 3], [-1, 0, 1, 2], None)
    >>> find_negative_cycle(3, [(0, 1, 1), (1, 2, -2), (2, 1, 1)])
    [1, 2]
"""

from __future__ import annotations

import math
from collections.abc import Sequence


def _cycle_through(parent: Sequence[int], start: int, n: int) -> list[int]:
    """Ebeveyn zincirinde n adım geri git (kesin döngüdesin), döngüyü ileri yönde döndür."""
    v = start
    for _ in range(n):
        v = parent[v]
    cycle = [v]
    u = parent[v]
    while u != v:
        cycle.append(u)
        u = parent[u]
    return cycle[::-1]


def bellman_ford(
    n: int, edges: Sequence[tuple[int, int, float]], source: int
) -> tuple[list[float], list[int], list[int] | None]:
    """(uzaklıklar, ebeveynler, negatif döngü ya da None).

    Negatif döngü bulunursa uzaklıklar anlamsızdır; döngü köşeleri kenar yönünde sıralıdır.
    """
    dist: list[float] = [math.inf] * n
    parent = [-1] * n
    dist[source] = 0
    for _ in range(n - 1):
        changed = False
        for u, v, w in edges:
            if dist[u] != math.inf and dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                parent[v] = u
                changed = True
        if not changed:
            return dist, parent, None
    for u, v, w in edges:
        if dist[u] != math.inf and dist[u] + w < dist[v]:
            parent[v] = u
            return dist, parent, _cycle_through(parent, v, n)
    return dist, parent, None


def find_negative_cycle(n: int, edges: Sequence[tuple[int, int, float]]) -> list[int] | None:
    """Grafın herhangi bir yerindeki negatif döngü (kenar yönünde köşeler) ya da None."""
    dist = [0.0] * n  # sanal kaynak: her köşeye 0 ağırlıklı kenar
    parent = [-1] * n
    for _ in range(n):
        last_relaxed = -1
        for u, v, w in edges:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                parent[v] = u
                last_relaxed = v
        if last_relaxed == -1:
            return None
    return _cycle_through(parent, last_relaxed, n)
