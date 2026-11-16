"""Graf gösterimleri: kenar listesi, komşuluk listesi ve komşuluk matrisi arasında dönüşüm.

Fikir:
    Köşeler 0 … n−1 tam sayılarıdır. Üç yaygın gösterim vardır:
      * Kenar listesi `[(u, v, w), …]`: en sade; Kruskal ve Bellman-Ford doğrudan bunu ister.
      * Komşuluk listesi `adj[u] = [v, …]` ya da ağırlıklıda `[(v, w), …]`: seyrek graflarda
        (kenar sayısı m ≪ n²) en verimli; BFS, DFS, Dijkstra bunu ister. Bellek O(n + m).
      * Komşuluk matrisi `M[u][v]` (kenar yoksa ∞): yoğun graflarda ve Floyd-Warshall'da;
        "u–v kenarı var mı?" sorusu O(1), ama bellek O(n²).
    Bu kütüphanedeki graf modülleri bu üç biçimden birini bekler; dönüşümler buradadır.

Karmaşıklık: liste dönüşümleri O(n + m); matris dönüşümleri O(n²); yer aynı mertebede
Ne zaman: elinizdeki veriyi bir graf algoritmasının istediği biçime getirmek için.
Ne zaman değil: köşeleriniz dizgi ya da nesneyse önce `index_vertices` ile numaralandırın.
Bağımlılık: yok
Genişletme: yeni bir gösterim (ör. CSR dizileri) eklerseniz buradaki işlevlerin yanına yazın.

Örnek:
    >>> adjacency_list(3, [(0, 1), (1, 2)], directed=False)
    [[1], [0, 2], [1]]
    >>> m = adjacency_matrix(3, [(0, 1, 4), (1, 2, 1)], directed=True)
    >>> m[0][1], m[1][0], edges_from_matrix(m)
    (4, inf, [(0, 1, 4), (1, 2, 1)])
    >>> index_vertices([("ankara", "izmir"), ("izmir", "bursa")])
    (['ankara', 'izmir', 'bursa'], [(0, 1), (1, 2)])
"""

from __future__ import annotations

import math
from collections.abc import Hashable, Sequence
from typing import TypeVar

H = TypeVar("H", bound=Hashable)


def adjacency_list(n: int, edges: Sequence[tuple[int, int]], directed: bool) -> list[list[int]]:
    """Ağırlıksız kenarlardan komşuluk listesi; yönsüzde her kenar iki yöne yazılır."""
    adj: list[list[int]] = [[] for _ in range(n)]
    for u, v in edges:
        adj[u].append(v)
        if not directed:
            adj[v].append(u)
    return adj


def weighted_adjacency_list(
    n: int, edges: Sequence[tuple[int, int, float]], directed: bool
) -> list[list[tuple[int, float]]]:
    """Ağırlıklı kenarlardan komşuluk listesi: adj[u] = [(v, ağırlık), …]."""
    adj: list[list[tuple[int, float]]] = [[] for _ in range(n)]
    for u, v, w in edges:
        adj[u].append((v, w))
        if not directed:
            adj[v].append((u, w))
    return adj


def adjacency_matrix(
    n: int, edges: Sequence[tuple[int, int, float]], directed: bool
) -> list[list[float]]:
    """Komşuluk matrisi; kenar yoksa ∞, köşegen 0. Paralel kenarlardan en hafifi tutulur."""
    matrix = [[0.0 if i == j else math.inf for j in range(n)] for i in range(n)]
    for u, v, w in edges:
        if w < matrix[u][v]:
            matrix[u][v] = w
        if not directed and w < matrix[v][u]:
            matrix[v][u] = w
    return matrix


def edges_from_matrix(matrix: Sequence[Sequence[float]]) -> list[tuple[int, int, float]]:
    """Matristeki sonlu, köşegen dışı her girdi için (u, v, w) kenarı."""
    return [
        (u, v, w)
        for u, row in enumerate(matrix)
        for v, w in enumerate(row)
        if u != v and w != math.inf
    ]


def transpose(adj: Sequence[Sequence[int]]) -> list[list[int]]:
    """Tüm kenarları ters çevrilmiş yönlü graf (u→v yerine v→u)."""
    reverse: list[list[int]] = [[] for _ in adj]
    for u, neighbors in enumerate(adj):
        for v in neighbors:
            reverse[v].append(u)
    return reverse


def index_vertices(edges: Sequence[tuple[H, H]]) -> tuple[list[H], list[tuple[int, int]]]:
    """Adlı köşeleri ilk görülme sırasıyla 0, 1, 2 … diye numaralandırır: (adlar, kenarlar)."""
    names: list[H] = []
    number: dict[H, int] = {}
    numbered: list[tuple[int, int]] = []
    for a, b in edges:
        for name in (a, b):
            if name not in number:
                number[name] = len(names)
                names.append(name)
        numbered.append((number[a], number[b]))
    return names, numbered
