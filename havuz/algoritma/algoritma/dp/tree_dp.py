"""Ağaç üstünde DP: en ağır bağımsız küme (hiçbir ikisi komşu olmayan köşeler) ve köşelerin kendisi.

Fikir:
    Ağaç köklenir; her v için iki değer hesaplanır:
        take[v] = v seçildiğinde v'nin alt ağacındaki en iyi toplam = w[v] + Σ skip[çocuk]
        skip[v] = v seçilmediğinde = Σ max(take[çocuk], skip[çocuk])
    Çocuklar ebeveynden önce bitmelidir: köşeler BFS sırasıyla dizilir ve bu sıra TERSTEN
    gezilir (özyineleme yok; derin ağaçta yığın taşmaz). Geri izleme kökten aşağı yapılır:
    ebeveyn seçildiyse çocuk seçilemez; seçilmediyse çocuk için büyük olan değer izlenir.
    Graf orman olabilir (her bileşen ayrı köklenir).

Karmaşıklık: zaman O(n); yer O(n)
Ne zaman: ağaç biçimli yapılarda "komşu ikisi birden olmaz" seçimleri: şirket hiyerarşisinde
    davet listesi, ağaçta en küçük köşe örtüsü (n − bağımsız küme), ağaçta eşleme.
Ne zaman değil: genel graflarda en büyük bağımsız küme NP-zordur; bu yöntem yalnız döngüsüz
    graflarda doğrudur.
Bağımlılık: yok
Genişletme: aynı "çocuklardan ebeveyne" iskeletiyle alt ağaç boyutu, çap, uzaklık toplamı
    gibi değerler hesaplanır; take/skip yerine kendi durumlarınızı yazın.

Örnek:
    >>> max_weight_independent_set([3, 2, 1, 10, 1], [(0, 1), (0, 2), (1, 3), (1, 4)])
    (14, [0, 3, 4])
"""

from __future__ import annotations

from collections.abc import Sequence


def max_weight_independent_set(
    weights: Sequence[float], edges: Sequence[tuple[int, int]]
) -> tuple[float, list[int]]:
    """(en büyük toplam ağırlık, seçilen köşeler sıralı). Graf orman olmalı."""
    n = len(weights)
    if len(edges) >= n and n > 0:
        raise ValueError("ağaç/orman en çok n − 1 kenar içerir")
    adj: list[list[int]] = [[] for _ in range(n)]
    for u, v in edges:
        adj[u].append(v)
        adj[v].append(u)
    parent = [-1] * n
    order: list[int] = []
    seen = [False] * n
    for root in range(n):
        if seen[root]:
            continue
        seen[root] = True
        head = len(order)
        order.append(root)
        while head < len(order):  # bu bileşen için BFS (liste büyüdükçe gezilir)
            u = order[head]
            head += 1
            for v in adj[u]:
                if not seen[v]:
                    seen[v] = True
                    parent[v] = u
                    order.append(v)
                elif v != parent[u]:
                    raise ValueError("graf döngü içeriyor; bu yöntem yalnız ağaç/ormanda geçerli")
    take = list(weights)
    skip: list[float] = [0] * n
    for v in reversed(order):  # çocuklar ebeveynden önce
        p = parent[v]
        if p != -1:
            take[p] += skip[v]
            skip[p] += max(take[v], skip[v])
    chosen = [False] * n
    for v in order:  # kökten aşağı geri izleme
        p = parent[v]
        chosen[v] = take[v] > skip[v] if p == -1 or not chosen[p] else False
    total = sum(weights[v] for v in range(n) if chosen[v])
    return total, [v for v in range(n) if chosen[v]]
