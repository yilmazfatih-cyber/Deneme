"""Derinlik öncelikli arama (DFS): özyinelemesiz ön/son sıra ve yönlü grafta döngü bulma.

Fikir:
    DFS bir yoldan gidebildiği kadar derine iner, çıkmaza gelince geri döner. Ders kitapları
    bunu özyinelemeyle yazar; Python'da özyineleme ~1000 derinlikte durur, bu yüzden burada açık
    yığın kullanılır. Yığında (köşe, sıradaki komşu dizini) çiftleri tutulur; böylece ön sıra
    (köşeye ilk giriş) ve son sıra (köşeden son çıkış) özyinelemeli sürümle BİREBİR aynı çıkar.
    Yönlü döngü: üç renk — beyaz (görülmedi), gri (yığında), siyah (bitti). Gri bir köşeye
    giden kenar geri kenardır ve bir döngü kapatır; döngü yığından okunur.

Karmaşıklık: zaman O(n + m); yer O(n)
Ne zaman: erişilebilirlik, döngü bulma, topolojik sıra, köprü/eklem, bileşenler — hepsinin temeli.
Ne zaman değil: en kısa yol gerekiyorsa DFS değil `bfs.py` / `dijkstra.py`.
Bağımlılık: yok
Genişletme: giriş/çıkış zamanları gerekiyorsa `dfs_postorder` içinde sayaçla iki dizi doldurun.

Örnek:
    >>> adj = [[1, 2], [3], [3], []]
    >>> dfs_preorder(adj, 0), dfs_postorder(adj, 0)
    ([0, 1, 3, 2], [3, 1, 2, 0])
    >>> find_directed_cycle([[1], [2], [0]]), find_directed_cycle(adj)
    ([0, 1, 2], None)
"""

from __future__ import annotations

from collections.abc import Sequence


def dfs_preorder(adj: Sequence[Sequence[int]], source: int) -> list[int]:
    """Köşelere ilk giriş sırası (özyinelemeli DFS ile aynı)."""
    seen = [False] * len(adj)
    seen[source] = True
    order = [source]
    stack = [(source, 0)]
    while stack:
        u, i = stack[-1]
        if i == len(adj[u]):
            stack.pop()
            continue
        stack[-1] = (u, i + 1)
        v = adj[u][i]
        if not seen[v]:
            seen[v] = True
            order.append(v)
            stack.append((v, 0))
    return order


def dfs_postorder(adj: Sequence[Sequence[int]], source: int) -> list[int]:
    """Köşelerden son çıkış sırası (bir köşe, tüm torunlarından sonra yazılır)."""
    seen = [False] * len(adj)
    seen[source] = True
    order: list[int] = []
    stack = [(source, 0)]
    while stack:
        u, i = stack[-1]
        if i == len(adj[u]):
            stack.pop()
            order.append(u)
            continue
        stack[-1] = (u, i + 1)
        v = adj[u][i]
        if not seen[v]:
            seen[v] = True
            stack.append((v, 0))
    return order


def find_directed_cycle(adj: Sequence[Sequence[int]]) -> list[int] | None:
    """Yönlü bir döngünün köşeleri (sırasıyla; son köşeden ilkine kenar var) ya da None."""
    white, gray, black = 0, 1, 2
    color = [white] * len(adj)
    for root in range(len(adj)):
        if color[root] != white:
            continue
        color[root] = gray
        stack = [(root, 0)]
        while stack:
            u, i = stack[-1]
            if i == len(adj[u]):
                color[u] = black
                stack.pop()
                continue
            stack[-1] = (u, i + 1)
            v = adj[u][i]
            if color[v] == gray:  # geri kenar: v yığında, v … u yolu + (u, v) bir döngü
                path = [w for w, _ in stack]
                return path[path.index(v) :]
            if color[v] == white:
                color[v] = gray
                stack.append((v, 0))
    return None
