"""Köprüler ve eklem noktaları: silinince yönsüz grafı bölen kenarları ve köşeleri bulur.

Fikir:
    DFS ağacında her köşeye giriş zamanı `tin` verilir; `low[v]` = v'nin alt ağacından en çok
    bir geri kenarla ulaşılabilen en küçük giriş zamanı. Ağaç kenarı (u, v) için:
      * low[v] > tin[u] ise v'nin alt ağacı u'nun üstüne hiç bağlanamıyor → (u, v) KÖPRÜ.
      * low[v] ≥ tin[u] ise (u kök değilken) u silinince v'nin alt ağacı kopar → u EKLEM NOKTASI.
      * Kök ancak DFS ağacında 2+ çocuğu varsa eklem noktasıdır.
    Paralel kenarlar doğru işlenir: ebeveyn köşeye değil ebeveyn KENARINA (kimliğiyle) geri
    dönülmez; aynı iki köşe arasındaki ikinci kenar geri kenar sayılır ve köprü oluşmaz.
    Özyinelemesiz yazıldı (uzun yollarda yığın taşmaz).

Karmaşıklık: zaman O(n + m); yer O(n + m)
Ne zaman: ağ güvenilirliği (tek hata noktası), yol/köprü kritikliği, 2-bağlı bileşenlere bölme.
Ne zaman değil: yönlü graflarda bu tanımlar farklıdır (güçlü bağlılık için `tarjan_scc.py`).
Bağımlılık: yok
Genişletme: 2-kenar-bağlı bileşenler = köprüler silindikten sonraki bağlı bileşenler.

Örnek:
    >>> edges = [(0, 1), (1, 2), (2, 0), (1, 3), (3, 4)]
    >>> bridges_and_articulation_points(5, edges)
    ([(1, 3), (3, 4)], [1, 3])
"""

from __future__ import annotations

from collections.abc import Sequence


def bridges_and_articulation_points(
    n: int, edges: Sequence[tuple[int, int]]
) -> tuple[list[tuple[int, int]], list[int]]:
    """(köprüler (küçük, büyük) sıralı, eklem noktaları sıralı)."""
    adj: list[list[tuple[int, int]]] = [[] for _ in range(n)]
    for edge_id, (u, v) in enumerate(edges):
        adj[u].append((v, edge_id))
        adj[v].append((u, edge_id))
    tin = [-1] * n
    low = [0] * n
    timer = 0
    bridges: list[tuple[int, int]] = []
    is_cut = [False] * n
    for root in range(n):
        if tin[root] != -1:
            continue
        tin[root] = low[root] = timer
        timer += 1
        root_children = 0
        stack = [(root, -1, 0)]  # (köşe, geldiği kenarın kimliği, sıradaki komşu dizini)
        while stack:
            v, parent_edge, i = stack[-1]
            if i < len(adj[v]):
                stack[-1] = (v, parent_edge, i + 1)
                w, edge_id = adj[v][i]
                if edge_id == parent_edge:
                    continue  # aynı kenardan geri dönme (paralel kenar ayrı kimlik taşır)
                if tin[w] == -1:
                    tin[w] = low[w] = timer
                    timer += 1
                    stack.append((w, edge_id, 0))
                    if v == root:
                        root_children += 1
                else:
                    low[v] = min(low[v], tin[w])
                continue
            stack.pop()
            if stack:
                u = stack[-1][0]
                low[u] = min(low[u], low[v])
                if low[v] > tin[u]:
                    bridges.append((min(u, v), max(u, v)))
                if u != root and low[v] >= tin[u]:
                    is_cut[u] = True
        if root_children > 1:
            is_cut[root] = True
    return sorted(bridges), [v for v in range(n) if is_cut[v]]
