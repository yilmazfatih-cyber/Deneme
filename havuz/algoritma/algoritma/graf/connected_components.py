"""Bağlı bileşenler (yönsüz graf): birbirine yolla ulaşabilen köşe gruplarını bulur.

Fikir:
    Henüz bir bileşene atanmamış her köşeden bir BFS başlatılır; BFS'nin ulaştığı her köşe aynı
    bileşene etiketlenir. Her köşe ve kenar bir kez işlendiği için toplam O(n + m).
    Kenarlar zamanla ekleniyorsa (çevrimiçi) ayrık küme (`disjoint_set.py`) daha uygundur;
    burada graf baştan bellidir. İki parçalılık (iki renklilik) aynı gezinmenin bir yan
    ürünüdür: komşular hep zıt renge boyanır; aynı renkli komşu çıkarsa tek uzunlukta döngü vardır.

Karmaşıklık: zaman O(n + m); yer O(n + m)
Ne zaman: ağ bölünmesi, ada sayma, kümeleme, "kim kime ulaşabilir" gruplaması, iki parçalılık.
Ne zaman değil: YÖNLÜ grafta karşılıklı ulaşılabilirlik için `tarjan_scc.py`/`kosaraju_scc.py`.
Bağımlılık: yok
Genişletme: ızgaralarda komşu listesi yerine 4/8 yönlü komşuları doğrudan üreten bir döngü yazın.

Örnek:
    >>> connected_components(6, [(0, 1), (1, 2), (3, 4)])
    [[0, 1, 2], [3, 4], [5]]
    >>> component_labels(4, [(2, 3)]), bipartite_coloring(4, [(0, 1), (1, 2), (2, 3)])
    ([0, 1, 2, 2], [0, 1, 0, 1])
    >>> bipartite_coloring(3, [(0, 1), (1, 2), (2, 0)]) is None
    True
"""

from __future__ import annotations

from collections.abc import Sequence


def _adjacency(n: int, edges: Sequence[tuple[int, int]]) -> list[list[int]]:
    adj: list[list[int]] = [[] for _ in range(n)]
    for u, v in edges:
        adj[u].append(v)
        adj[v].append(u)
    return adj


def component_labels(n: int, edges: Sequence[tuple[int, int]]) -> list[int]:
    """label[v] = v'nin bileşen numarası; bileşenler en küçük köşelerine göre 0, 1, 2 … sıralı."""
    adj = _adjacency(n, edges)
    label = [-1] * n
    count = 0
    for root in range(n):
        if label[root] != -1:
            continue
        label[root] = count
        frontier = [root]
        for u in frontier:  # liste büyürken gezilir: BFS kuyruğu gibi
            for v in adj[u]:
                if label[v] == -1:
                    label[v] = count
                    frontier.append(v)
        count += 1
    return label


def connected_components(n: int, edges: Sequence[tuple[int, int]]) -> list[list[int]]:
    """Bileşenlerin köşe listeleri (her biri sıralı; bileşenler en küçük köşeye göre sıralı)."""
    groups: list[list[int]] = []
    for v, label in enumerate(component_labels(n, edges)):
        if label == len(groups):
            groups.append([])
        groups[label].append(v)
    return groups


def bipartite_coloring(n: int, edges: Sequence[tuple[int, int]]) -> list[int] | None:
    """Komşuları farklı renkli 0/1 boyama; tek uzunlukta döngü (ya da öz döngü) varsa None."""
    adj = _adjacency(n, edges)
    color = [-1] * n
    for root in range(n):
        if color[root] != -1:
            continue
        color[root] = 0
        frontier = [root]
        for u in frontier:
            for v in adj[u]:
                if color[v] == -1:
                    color[v] = 1 - color[u]
                    frontier.append(v)
                elif color[v] == color[u]:
                    return None
    return color
