"""Prim: en küçük kapsayan ağacı tek bir köşeden başlayıp en hafif kenarla büyüterek kurar.

Fikir:
    Ağaç bir köşeyle başlar. Her adımda, ağaçtaki bir köşeyi ağaç dışındaki bir köşeye bağlayan
    en hafif kenar seçilir ve o köşe ağaca katılır (kesim özelliği bunun doğru olduğunu söyler).
    En hafif kenarı bulmak için yığın kullanılır; ağaca zaten katılmış köşeye giden bayat
    kayıtlar çıkınca atlanır (tembel Prim). Graf bağlı değilse ağaç dışında kalan ilk köşeden
    yeniden başlanır; sonuç bir kapsayan ormandır (Kruskal ile aynı toplam).

Karmaşıklık: zaman O(m log m); yer O(n + m)
Ne zaman: komşuluk listesi elde olan graflar; ağacı bir başlangıç noktasından büyütmek gerekiyorsa.
Ne zaman değil: kenar listesi hazırsa ve sıralamak ucuzsa `kruskal.py` daha kısadır.
Bağımlılık: yok
Genişletme: yoğun graf için yığın yerine her köşenin "ağaca en ucuz bağlantısı" dizisini tutup
    her adımda doğrusal en küçüğü seçin (O(n²)).

Örnek:
    >>> edges = [(0, 1, 4), (0, 2, 1), (1, 2, 2), (1, 3, 5), (2, 3, 8)]
    >>> prim(4, edges)
    (8, [(0, 2, 1), (2, 1, 2), (1, 3, 5)])
"""

from __future__ import annotations

import heapq
from collections.abc import Sequence


def prim(
    n: int, edges: Sequence[tuple[int, int, float]]
) -> tuple[float, list[tuple[int, int, float]]]:
    """(toplam ağırlık, seçilen kenarlar (ağaçtaki uç, yeni köşe, ağırlık) — eklenme sırasıyla)."""
    adj: list[list[tuple[float, int]]] = [[] for _ in range(n)]
    for u, v, w in edges:
        adj[u].append((w, v))
        adj[v].append((w, u))
    in_tree = [False] * n
    total: float = 0
    chosen: list[tuple[int, int, float]] = []
    for start in range(n):
        if in_tree[start]:
            continue
        in_tree[start] = True
        heap = [(w, start, v) for w, v in adj[start]]
        heapq.heapify(heap)
        while heap:
            w, u, v = heapq.heappop(heap)
            if in_tree[v]:
                continue  # bayat kayıt: v zaten ağaçta
            in_tree[v] = True
            total += w
            chosen.append((u, v, w))
            for weight, nxt in adj[v]:
                if not in_tree[nxt]:
                    heapq.heappush(heap, (weight, v, nxt))
    return total, chosen
