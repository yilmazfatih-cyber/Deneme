"""Tarjan güçlü bağlı bileşenler: yönlü grafta karşılıklı ulaşılabilen köşe grupları, tek DFS.

Fikir:
    DFS sırasında her köşeye bir giriş numarası (index) verilir ve `low` = o köşenin alt
    ağacından, hâlâ yığında olan köşelere giden kenarlarla ulaşılabilen en küçük giriş numarası
    hesaplanır. Bir köşede low == index ise o köşe bir bileşenin "kökü"dür: yığında onun üstünde
    kalan köşelerin hepsi aynı bileşendir ve yığından çıkarılır.
    Bileşenler, bileşen grafının TERS topolojik sırasıyla (önce "batan" bileşenler) çıkar.
    Ders kitabı sürümü özyinelemelidir; burada (köşe, komşu dizini) yığınıyla özyinelemesiz.

Karmaşıklık: zaman O(n + m); yer O(n)
Ne zaman: döngüleri tek düğüme indirip DAG elde etmek, 2-SAT, "herkes herkese ulaşabiliyor mu?".
Ne zaman değil: yönsüz graf için `connected_components.py` yeter. Aynı iş için iki geçişli ama
    daha kolay anlaşılan sürüm: `kosaraju_scc.py`.
Bağımlılık: yok
Genişletme: bileşen grafı için her (u, v) kenarında comp[u] ≠ comp[v] ise bir kenar ekleyin.

Örnek:
    >>> adj = [[1], [2], [0, 3], [4], [5], [3]]
    >>> tarjan_scc(adj)
    [[3, 4, 5], [0, 1, 2]]
"""

from __future__ import annotations

from collections.abc import Sequence


def tarjan_scc(adj: Sequence[Sequence[int]]) -> list[list[int]]:
    """Güçlü bağlı bileşenler (her biri sıralı), bileşen grafının ters topolojik sırasıyla."""
    n = len(adj)
    index = [-1] * n
    low = [0] * n
    on_stack = [False] * n
    stack: list[int] = []
    components: list[list[int]] = []
    counter = 0
    for root in range(n):
        if index[root] != -1:
            continue
        index[root] = low[root] = counter
        counter += 1
        stack.append(root)
        on_stack[root] = True
        work = [(root, 0)]  # özyineleme yığınının yerine: (köşe, sıradaki komşu dizini)
        while work:
            v, i = work[-1]
            if i < len(adj[v]):
                work[-1] = (v, i + 1)
                w = adj[v][i]
                if index[w] == -1:  # ağaç kenarı: "özyinelemeli çağrı"
                    index[w] = low[w] = counter
                    counter += 1
                    stack.append(w)
                    on_stack[w] = True
                    work.append((w, 0))
                elif on_stack[w]:  # yığındaki köşeye kenar: low güncellenir
                    low[v] = min(low[v], index[w])
                continue
            work.pop()  # v'nin tüm komşuları bitti: "çağrıdan dönüş"
            if work:
                parent = work[-1][0]
                low[parent] = min(low[parent], low[v])
            if low[v] == index[v]:  # v bir bileşenin kökü
                component = []
                while True:
                    w = stack.pop()
                    on_stack[w] = False
                    component.append(w)
                    if w == v:
                        break
                components.append(sorted(component))
    return components
