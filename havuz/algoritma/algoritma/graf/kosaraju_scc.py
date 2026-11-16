"""Kosaraju güçlü bağlı bileşenler: iki DFS geçişiyle (graf ve tersi) bileşenleri bulur.

Fikir:
    1. Geçiş: tüm grafta DFS yapılır ve köşeler bitiş sırasına göre bir listeye yazılır.
    2. Geçiş: kenarları ters çevrilmiş grafta, bitiş zamanı en büyük köşeden başlayarak
       gezilir; her gezinmenin ulaştığı köşeler tam olarak bir güçlü bağlı bileşendir.
    Neden çalışır: en son biten köşe, bileşen grafında bir "kaynak" bileşendedir; ters grafta
    o bileşenden dışarı kenar yoktur, dolayısıyla gezinme bileşenin dışına taşamaz.
    Bileşenler bileşen grafının topolojik sırasıyla (önce kaynaklar) çıkar. Özyinelemesiz yazıldı.

Karmaşıklık: zaman O(n + m); yer O(n + m) (ters graf)
Ne zaman: Tarjan'la aynı işler; mantığı adım adım izlemek daha kolaydır.
Ne zaman değil: ters grafı kurmaya bellek yoksa `tarjan_scc.py` (tek geçiş).
Bağımlılık: yok
Genişletme: bileşen numarası dizisi gerekiyorsa `component_of` sonucunu kullanın.

Örnek:
    >>> adj = [[1], [2], [0, 3], [4], [5], [3]]
    >>> kosaraju_scc(adj), component_of(adj)
    ([[0, 1, 2], [3, 4, 5]], [0, 0, 0, 1, 1, 1])
"""

from __future__ import annotations

from collections.abc import Sequence


def _finish_order(adj: Sequence[Sequence[int]]) -> list[int]:
    seen = [False] * len(adj)
    order: list[int] = []
    for root in range(len(adj)):
        if seen[root]:
            continue
        seen[root] = True
        stack = [(root, 0)]
        while stack:
            v, i = stack[-1]
            if i < len(adj[v]):
                stack[-1] = (v, i + 1)
                w = adj[v][i]
                if not seen[w]:
                    seen[w] = True
                    stack.append((w, 0))
            else:
                stack.pop()
                order.append(v)
    return order


def component_of(adj: Sequence[Sequence[int]]) -> list[int]:
    """comp[v] = v'nin bileşen numarası; numaralar bileşen grafının topolojik sırasıdır."""
    n = len(adj)
    reverse: list[list[int]] = [[] for _ in range(n)]
    for u, neighbors in enumerate(adj):
        for v in neighbors:
            reverse[v].append(u)
    comp = [-1] * n
    count = 0
    for root in reversed(_finish_order(adj)):
        if comp[root] != -1:
            continue
        comp[root] = count
        stack = [root]
        while stack:
            v = stack.pop()
            for w in reverse[v]:
                if comp[w] == -1:
                    comp[w] = count
                    stack.append(w)
        count += 1
    return comp


def kosaraju_scc(adj: Sequence[Sequence[int]]) -> list[list[int]]:
    """Güçlü bağlı bileşenler (her biri sıralı), bileşen grafının topolojik sırasıyla."""
    comp = component_of(adj)
    groups: list[list[int]] = [[] for _ in range(max(comp, default=-1) + 1)]
    for v, c in enumerate(comp):
        groups[c].append(v)
    return groups
