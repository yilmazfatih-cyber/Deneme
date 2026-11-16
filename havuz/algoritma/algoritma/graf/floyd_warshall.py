"""Floyd-Warshall: tüm köşe çiftleri arasındaki en kısa yollar; negatif döngü sınaması.

Fikir:
    dist[i][j], yalnız {0 … k−1} köşelerinden geçerek i'den j'ye en kısa yol olsun. k. köşeyi
    de kullanmaya izin verince: dist[i][j] = min(dist[i][j], dist[i][k] + dist[k][j]).
    k = 0 … n−1 için bu güncelleme yapılınca tüm en kısa yollar bulunur. `nxt[i][j]` i'den j'ye
    giden en kısa yoldaki ikinci köşedir; yol, bundan adım adım kurulur.
    Negatif ağırlıklara izin verir; dist[i][i] < 0 olan her i negatif bir döngü üstündedir.

Karmaşıklık: zaman O(n³); yer O(n²)
Ne zaman: küçük/yoğun graflarda (n ≲ 400) tüm çiftler; geçişli kapanış; negatif döngü sınaması.
Ne zaman değil: büyük seyrek graflarda her köşeden Dijkstra (O(n·m log n)) daha hızlıdır.
Bağımlılık: yok
Genişletme: yalnız ulaşılabilirlik gerekiyorsa min/+ yerine or/and kullanın (geçişli kapanış).

Örnek:
    >>> dist, nxt = floyd_warshall(3, [(0, 1, 5), (1, 2, -2), (0, 2, 4)])
    >>> dist[0], reconstruct_path(nxt, 0, 2), has_negative_cycle(dist)
    ([0, 5, 3], [0, 1, 2], False)
"""

from __future__ import annotations

import math
from collections.abc import Sequence


def floyd_warshall(
    n: int, edges: Sequence[tuple[int, int, float]]
) -> tuple[list[list[float]], list[list[int]]]:
    """(dist, nxt): dist[i][j] en kısa uzaklık (yoksa ∞); nxt[i][j] yoldaki sonraki köşe (−1)."""
    dist: list[list[float]] = [[math.inf] * n for _ in range(n)]
    nxt = [[-1] * n for _ in range(n)]
    for i in range(n):
        dist[i][i] = 0
        nxt[i][i] = i
    for u, v, w in edges:
        if w < dist[u][v]:  # paralel kenarlardan en hafifi; negatif öz döngü köşegeni düşürür
            dist[u][v] = w
            nxt[u][v] = v
    for k in range(n):
        dist_k = dist[k]
        for i in range(n):
            d_ik = dist[i][k]
            if d_ik == math.inf:
                continue
            row, nxt_row = dist[i], nxt[i]
            for j in range(n):
                candidate = d_ik + dist_k[j]
                if candidate < row[j]:
                    row[j] = candidate
                    nxt_row[j] = nxt_row[k]
    return dist, nxt


def has_negative_cycle(dist: Sequence[Sequence[float]]) -> bool:
    """Köşegende negatif değer varsa grafta negatif döngü vardır."""
    return any(dist[i][i] < 0 for i in range(len(dist)))


def reconstruct_path(nxt: Sequence[Sequence[int]], u: int, v: int) -> list[int] | None:
    """u'dan v'ye en kısa yolun köşeleri; yol yoksa None. Negatif döngü varken kullanmayın."""
    if nxt[u][v] == -1:
        return None
    path = [u]
    while u != v:
        u = nxt[u][v]
        path.append(u)
        if len(path) > len(nxt) + 1:
            raise ValueError("yol bir negatif döngüye takıldı; önce has_negative_cycle sınayın")
    return path
