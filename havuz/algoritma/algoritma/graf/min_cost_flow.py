"""En düşük maliyetli akış: istenen akışı (ya da en büyüğünü) en ucuza gönderir.

Fikir:
    Her kenarın kapasitesi ve birim akış maliyeti vardır. "Ardışık en kısa yollar" yöntemi:
    artık grafta kaynaktan hedefe MALİYETÇE en kısa yol bulunur, o yoldan darboğaz kadar akış
    gönderilir; istenen akışa ulaşılana ya da yol kalmayana dek tekrarlanır. Ters kenarların
    maliyeti eksilidir (akışı geri almak parayı geri verir); bu yüzden en kısa yol için negatif
    kenarlara dayanan Bellman-Ford'un kuyruklu sürümü (SPFA) kullanılır. Başlangıç grafında
    negatif maliyetli DÖNGÜ olmamalıdır; bu koşulda her adım en ucuz akışı korur.
    Kapasite ve maliyetler tam sayıdır (kesin sonuç).

Karmaşıklık: zaman O(F · n · m) (F = gönderilen akış, her yol için bir SPFA); yer O(n + m)
Ne zaman: ağırlıklı atama (en ucuz kişi–iş eşlemesi), ulaştırma problemi, kapasiteli rota planı.
Ne zaman değil: yalnız akış miktarı önemliyse `dinic.py` çok daha hızlıdır; çok büyük F için
    potansiyelli Dijkstra ya da maliyet ölçekleme gerekir.
Bağımlılık: yok
Genişletme: Johnson potansiyelleriyle SPFA yerine Dijkstra kullanıp her yolu O(m log n)'e indirin.

Örnek:
    >>> net = MinCostFlow(4)
    >>> edges = [(0, 1, 2, 1), (0, 2, 1, 2), (1, 2, 1, 1), (1, 3, 1, 3), (2, 3, 2, 1)]
    >>> for u, v, capacity, cost in edges:  # (u, v, kapasite, birim maliyet)
    ...     _ = net.add_edge(u, v, capacity, cost)
    >>> net.flow(0, 3), net.flow(0, 3)
    ((3, 10), (0, 0))
"""

from __future__ import annotations

from collections import deque


class MinCostFlow:
    """Tam sayı kapasite ve maliyetli yönlü akış ağı."""

    def __init__(self, n: int) -> None:
        self._n = n
        self._adj: list[list[int]] = [[] for _ in range(n)]
        self._to: list[int] = []
        self._cap: list[int] = []
        self._cost: list[int] = []
        self._original: list[int] = []

    def add_edge(self, u: int, v: int, capacity: int, cost: int) -> int:
        """u→v kenarı; kimliğini döndürür (ters kenar: kimlik ^ 1, maliyeti −cost)."""
        if capacity < 0:
            raise ValueError("kapasite negatif olamaz")
        edge_id = len(self._to)
        for a, b, cap, c in ((u, v, capacity, cost), (v, u, 0, -cost)):
            self._adj[a].append(len(self._to))
            self._to.append(b)
            self._cap.append(cap)
            self._cost.append(c)
            self._original.append(cap)
        return edge_id

    def _cheapest_path(self, source: int, sink: int) -> tuple[int, list[int]] | None:
        """SPFA: artık grafta en ucuz yolun (maliyeti, kenarları) ya da None."""
        inf = float("inf")
        dist: list[float] = [inf] * self._n
        via = [-1] * self._n
        in_queue = [False] * self._n
        dist[source] = 0
        queue = deque([source])
        while queue:
            u = queue.popleft()
            in_queue[u] = False
            for e in self._adj[u]:
                v = self._to[e]
                if self._cap[e] > 0 and dist[u] + self._cost[e] < dist[v]:
                    dist[v] = dist[u] + self._cost[e]
                    via[v] = e
                    if not in_queue[v]:
                        in_queue[v] = True
                        queue.append(v)
        if dist[sink] == inf:
            return None
        path = []
        v = sink
        while v != source:
            path.append(via[v])
            v = self._to[via[v] ^ 1]
        return int(dist[sink]), path[::-1]

    def flow(self, source: int, sink: int, limit: int | None = None) -> tuple[int, int]:
        """En çok `limit` (None: sınırsız) akışı en ucuza gönderir; (akış, toplam maliyet)."""
        if source == sink:
            raise ValueError("kaynak ve hedef farklı olmalı")
        total_flow = total_cost = 0
        while limit is None or total_flow < limit:
            found = self._cheapest_path(source, sink)
            if found is None:
                break
            unit_cost, path = found
            push = min(self._cap[e] for e in path)
            if limit is not None:
                push = min(push, limit - total_flow)
            for e in path:
                self._cap[e] -= push
                self._cap[e ^ 1] += push
            total_flow += push
            total_cost += push * unit_cost
        return total_flow, total_cost

    def flow_on(self, edge_id: int) -> int:
        """Bir kenardan geçen akış."""
        return self._original[edge_id] - self._cap[edge_id]
