"""En yakın ortak ata (LCA), ikili sıçrama ile: köklü ağaçta iki köşenin en derin ortak atası.

Fikir:
    up[k][v] = v'nin 2^k kuşak yukarıdaki atası (yoksa kök). Bu tablo up[k][v] = up[k−1][up[k−1][v]]
    ile O(n log n)'de kurulur. Her sayı ikinin kuvvetlerinin toplamı olduğundan, bir köşeden
    d kuşak yukarı çıkmak d'nin 1 olan bitleri kadar sıçrayıştır (O(log n)).
    LCA(u, v): önce derin olan, sığ olanın derinliğine çıkarılır. Eşitlerse yanıt odur. Değilse
    k büyükten küçüğe denenir: up[k][u] ≠ up[k][v] ise ikisi birden sıçrar (ortak ata henüz
    aşılmadı). Sonunda u ve v ortak atanın hemen altındadır; yanıt up[0][u].
    Ağaç BFS ile kurulur (özyineleme yok), derinlikler ve ebeveynler oradan gelir.

Karmaşıklık: kurulum O(n log n); lca/distance/kth_ancestor O(log n); yer O(n log n)
Ne zaman: ağaçta çok sayıda yol/uzaklık sorgusu (soy ağacı, dosya sistemi, ağ topolojisi).
Ne zaman değil: tek sorgu için iki köşeden yukarı yürümek yeter; çok büyük sorgu sayısında
    Euler turu + seyrek tablo (`sparse_table.py`) O(1) sorgu verir.
Bağımlılık: yok
Genişletme: yol üstünde en büyük kenar ağırlığı için up tablosunun yanına aynı biçimde bir
    "en büyük" tablosu tutun.

Örnek:
    >>> tree = LowestCommonAncestor(7, [(0, 1), (0, 2), (1, 3), (1, 4), (2, 5), (5, 6)])
    >>> tree.lca(3, 4), tree.lca(3, 6), tree.distance(4, 6), tree.kth_ancestor(6, 2)
    (1, 0, 5, 2)
"""

from __future__ import annotations

from collections.abc import Sequence


class LowestCommonAncestor:
    """Yönsüz ağaç kenarlarından köklü ağaç kurar ve LCA sorgularını yanıtlar."""

    def __init__(self, n: int, edges: Sequence[tuple[int, int]], root: int = 0) -> None:
        if n == 0 or len(edges) != n - 1:
            raise ValueError("ağaç n ≥ 1 köşe ve tam n − 1 kenar içermeli")
        adj: list[list[int]] = [[] for _ in range(n)]
        for u, v in edges:
            adj[u].append(v)
            adj[v].append(u)
        self.depth = [-1] * n
        parent = [root] * n
        self.depth[root] = 0
        order = [root]
        for u in order:  # BFS
            for v in adj[u]:
                if self.depth[v] == -1:
                    self.depth[v] = self.depth[u] + 1
                    parent[v] = u
                    order.append(v)
        if len(order) != n:
            raise ValueError("kenarlar bağlı bir ağaç oluşturmuyor")
        self._up = [parent]
        for _ in range(max(1, (n - 1).bit_length()) - 1):
            previous = self._up[-1]
            self._up.append([previous[previous[v]] for v in range(n)])

    def kth_ancestor(self, v: int, k: int) -> int:
        """v'nin k kuşak yukarıdaki atası; kökü aşarsa −1."""
        if k > self.depth[v]:
            return -1
        level = 0
        while k:
            if k & 1:
                v = self._up[level][v]
            k >>= 1
            level += 1
        return v

    def lca(self, u: int, v: int) -> int:
        """u ve v'nin en yakın ortak atası."""
        if self.depth[u] < self.depth[v]:
            u, v = v, u
        u = self.kth_ancestor(u, self.depth[u] - self.depth[v])
        if u == v:
            return u
        for level in reversed(range(len(self._up))):
            if self._up[level][u] != self._up[level][v]:
                u = self._up[level][u]
                v = self._up[level][v]
        return self._up[0][u]

    def distance(self, u: int, v: int) -> int:
        """İki köşe arasındaki kenar sayısı."""
        return self.depth[u] + self.depth[v] - 2 * self.depth[self.lca(u, v)]
