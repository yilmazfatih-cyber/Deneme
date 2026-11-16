"""Kruskal: en küçük kapsayan ağaç (orman) — kenarları hafiften ağıra, döngü kurmayanları seçerek.

Fikir:
    Kenarlar ağırlığa göre sıralanır ve sırayla denenir: kenarın iki ucu farklı bileşendeyse
    kenar seçilir ve bileşenler birleşir; aynı bileşendeyse döngü kuracağı için atlanır.
    "Kesim özelliği" bu açgözlü seçimin en iyi olduğunu kanıtlar: bir bileşeni geri kalandan
    ayıran en hafif kenar her zaman bir en küçük kapsayan ağaçtadır. Bileşen takibi için içeride
    küçük bir ayrık küme vardır (yol yarılama + boyuta göre birleştirme).
    Graf bağlı değilse her bileşenin kapsayan ağacından oluşan bir orman döner.

Karmaşıklık: zaman O(m log m) (sıralama baskın); yer O(n + m)
Ne zaman: kenar listesi elde olan seyrek graflar; kümeleme (en ağır k−1 kenarı atınca k küme).
Ne zaman değil: çok yoğun graflarda (m ≈ n²) dizi tabanlı Prim O(n²) daha iyi olabilir.
Bağımlılık: yok (ayrık kümenin kısa bir kopyası içeride; tam sürüm:
    `algoritma/veri_yapilari/disjoint_set.py`)
Genişletme: en BÜYÜK kapsayan ağaç için sıralamayı ters çevirin.

Örnek:
    >>> edges = [(0, 1, 4), (0, 2, 1), (1, 2, 2), (1, 3, 5), (2, 3, 8)]
    >>> kruskal(4, edges)
    (8, [(0, 2, 1), (1, 2, 2), (1, 3, 5)])
"""

from __future__ import annotations

from collections.abc import Sequence


def kruskal(
    n: int, edges: Sequence[tuple[int, int, float]]
) -> tuple[float, list[tuple[int, int, float]]]:
    """(toplam ağırlık, seçilen kenarlar — ağırlık sırasıyla)."""
    parent = list(range(n))
    size = [1] * n

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]  # yol yarılama
            x = parent[x]
        return x

    total: float = 0
    chosen: list[tuple[int, int, float]] = []
    for u, v, w in sorted(edges, key=lambda edge: edge[2]):
        root_u, root_v = find(u), find(v)
        if root_u == root_v:
            continue  # döngü kurardı
        if size[root_u] < size[root_v]:
            root_u, root_v = root_v, root_u
        parent[root_v] = root_u
        size[root_u] += size[root_v]
        total += w
        chosen.append((u, v, w))
        if len(chosen) == n - 1:
            break
    return total, chosen
