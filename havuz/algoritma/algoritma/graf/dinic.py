"""Dinic: kaynaktan hedefe en büyük akış (ve en küçük kesim), katmanlı graf + engelleyici akış.

Fikir:
    Artık (residual) grafta her kenarın kalan kapasitesi ve ters kenarı vardır; akış göndermek
    ileri kapasiteyi azaltır, tersini artırır (böylece yanlış karar sonra geri alınabilir).
    Dinic her turda: (1) BFS ile kaynaktan katman numaraları hesaplanır; (2) yalnız katmanı bir
    artan kenarlar kullanılarak, artık yol kalmayana dek akış itilir ("engelleyici akış").
    Her kenar için "sıradaki denenecek kenar" işaretçisi tutulduğundan çıkmaz yollar tekrar
    denenmez. Hedef BFS'de ulaşılamaz olunca akış en büyüktür; kaynaktan ulaşılabilen köşeler
    en küçük kesimin bir tarafıdır (en büyük akış = en küçük kesim kapasitesi).
    DFS özyinelemesizdir (uzun yollarda yığın taşmaz). Kapasiteler tam sayı olmalıdır.

Karmaşıklık: zaman O(n² · m) genel; birim kapasitede O(m · √n); yer O(n + m)
Ne zaman: en büyük akış / en küçük kesim, iki parçalı eşleme, kenar-ayrık yollar, görüntü bölütleme.
Ne zaman değil: maliyetli akış için `min_cost_flow.py`; yalnız iki parçalı eşleme için
    `hopcroft_karp.py` daha yalındır.
Bağımlılık: yok
Genişletme: köşe kapasitesi için her köşeyi "giriş → çıkış" kenarıyla ikiye bölün.

Örnek:
    >>> net = Dinic(4)
    >>> a = net.add_edge(0, 1, 3)
    >>> b = net.add_edge(0, 2, 2)
    >>> c = net.add_edge(1, 2, 5)
    >>> d = net.add_edge(1, 3, 2)
    >>> e = net.add_edge(2, 3, 3)
    >>> net.max_flow(0, 3), net.min_cut_side(0), net.flow_on(d)
    (5, [0], 2)
"""

from __future__ import annotations

from collections import deque


class Dinic:
    """Tam sayı kapasiteli yönlü akış ağı."""

    def __init__(self, n: int) -> None:
        self._n = n
        self._adj: list[list[int]] = [[] for _ in range(n)]  # köşe → kenar kimlikleri
        self._to: list[int] = []
        self._cap: list[int] = []  # kalan (artık) kapasite
        self._original: list[int] = []

    def add_edge(self, u: int, v: int, capacity: int) -> int:
        """u→v kenarı ekler; kenar kimliğini döndürür (ters kenarın kimliği: kimlik ^ 1)."""
        if capacity < 0:
            raise ValueError("kapasite negatif olamaz")
        edge_id = len(self._to)
        for a, b, cap in ((u, v, capacity), (v, u, 0)):
            self._adj[a].append(len(self._to))
            self._to.append(b)
            self._cap.append(cap)
            self._original.append(cap)
        return edge_id

    def _levels(self, source: int) -> list[int]:
        level = [-1] * self._n
        level[source] = 0
        queue = deque([source])
        while queue:
            u = queue.popleft()
            for e in self._adj[u]:
                if self._cap[e] > 0 and level[self._to[e]] == -1:
                    level[self._to[e]] = level[u] + 1
                    queue.append(self._to[e])
        return level

    def _blocking_flow(self, source: int, sink: int, level: list[int]) -> int:
        pointer = [0] * self._n
        pushed = 0
        while True:
            path: list[int] = []  # kaynaktan şimdiki köşeye kenar kimlikleri
            v = source
            while v != sink:
                while pointer[v] < len(self._adj[v]):
                    e = self._adj[v][pointer[v]]
                    if self._cap[e] > 0 and level[self._to[e]] == level[v] + 1:
                        break
                    pointer[v] += 1
                if pointer[v] == len(self._adj[v]):  # çıkmaz: geri çekil
                    if v == source:
                        return pushed
                    e = path.pop()
                    v = self._to[e ^ 1]
                    pointer[v] += 1
                    continue
                e = self._adj[v][pointer[v]]
                path.append(e)
                v = self._to[e]
            bottleneck = min(self._cap[e] for e in path)
            for e in path:
                self._cap[e] -= bottleneck
                self._cap[e ^ 1] += bottleneck
            pushed += bottleneck

    def max_flow(self, source: int, sink: int) -> int:
        """En büyük akış değeri (önceki çağrıların akışı üstüne eklenir)."""
        if source == sink:
            raise ValueError("kaynak ve hedef farklı olmalı")
        flow = 0
        while True:
            level = self._levels(source)
            if level[sink] == -1:
                return flow
            flow += self._blocking_flow(source, sink, level)

    def flow_on(self, edge_id: int) -> int:
        """Bir kenardan geçen akış (add_edge'in döndürdüğü kimlik)."""
        return self._original[edge_id] - self._cap[edge_id]

    def min_cut_side(self, source: int) -> list[int]:
        """max_flow sonrası, artık grafta kaynaktan ulaşılabilen köşeler (kesimin kaynak tarafı)."""
        return [v for v, lv in enumerate(self._levels(source)) if lv != -1]
