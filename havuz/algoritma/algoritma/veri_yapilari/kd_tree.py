"""k-d ağacı: k boyutlu noktalarda en yakın komşu ve dikdörtgen (kutu) aralık sorgusu.

Fikir:
    Uzay sırayla eksenlere göre ikiye bölünür: kökte x'e göre ortanca nokta, bir altta y'ye göre,
    sonra yine x… Her düğüm bir bölme düzlemidir. En yakın komşu ararken önce sorgunun düştüğü
    tarafa inilir; dönüşte öbür taraf ancak "bölme düzlemine uzaklığın karesi < şimdiye kadarki en
    iyi uzaklığın karesi" ise gezilir. Düşük boyutta (k ≤ ~10) ve dağınık veride bu budama
    gezilen düğüm sayısını O(log n) civarına indirir.
    Uzaklıklar KARE olarak döndürülür (kök almak kayan nokta hatası ekler ve gereksizdir).

Karmaşıklık: kurulum O(n log² n); en yakın komşu ortalama O(log n), en kötü O(n);
    kutu sorgusu O(n^(1−1/k) + yanıt); yer O(n)
Ne zaman: 2B/3B konum verisinde "en yakın nokta", "bu dikdörtgendeki noktalar" sorguları.
Ne zaman değil: yüksek boyutta (k > ~20) budama işe yaramaz; kaba kuvvet ya da yaklaşık
    yöntemler (LSH, HNSW) kullanın. Noktalar sık değişiyorsa ağacı yeniden kurmak gerekir.
Bağımlılık: yok
Özyineleme: kurulum ve arama özyinelemelidir; ağaç dengeli olduğundan derinlik ~log2 n.
Genişletme: başka uzaklık (Manhattan) için `_dist2` ve budama koşulunu birlikte değiştirin.

Örnek:
    >>> tree = KDTree([(2, 3), (5, 4), (9, 6), (4, 7), (8, 1), (7, 2)])
    >>> tree.nearest((9, 2))
    (4, 2)
    >>> tree.k_nearest((9, 2), 2), tree.in_box((4, 0), (8, 4))
    ([(2, 4), (4, 5)], [1, 4, 5])
"""

from __future__ import annotations

import heapq
import math
from collections.abc import Sequence


def _dist2(a: Sequence[float], b: Sequence[float]) -> float:
    return sum((x - y) * (x - y) for x, y in zip(a, b))


class KDTree:
    """Değişmeyen nokta kümesi üstünde k-d ağacı. Sonuçlar nokta DİZİNLERİYLE döner."""

    def __init__(self, points: Sequence[Sequence[float]]) -> None:
        self._points = [tuple(p) for p in points]
        dims = {len(p) for p in self._points}
        if len(dims) > 1 or 0 in dims:
            raise ValueError("tüm noktalar aynı (sıfırdan büyük) boyutta olmalı")
        self._k = dims.pop() if dims else 0  # boş ağaçta boyut bilinmez: her sorgu kabul edilir
        self._point: list[int] = []  # düğüm → nokta dizini
        self._axis: list[int] = []
        self._left: list[int] = []
        self._right: list[int] = []
        self._root = self._build(list(range(len(self._points))), 0)

    def __len__(self) -> int:
        return len(self._points)

    def _build(self, indices: list[int], depth: int) -> int:
        if not indices:
            return -1
        axis = depth % self._k
        indices.sort(key=lambda i: self._points[i][axis])
        mid = len(indices) // 2
        node = len(self._point)
        self._point.append(indices[mid])
        self._axis.append(axis)
        self._left.append(-1)
        self._right.append(-1)
        self._left[node] = self._build(indices[:mid], depth + 1)
        self._right[node] = self._build(indices[mid + 1 :], depth + 1)
        return node

    def _check_query(self, query: Sequence[float]) -> None:
        if self._k and len(query) != self._k:
            raise ValueError(f"sorgu {self._k} boyutlu olmalı")

    def nearest(self, query: Sequence[float]) -> tuple[int, float]:
        """(en yakın noktanın dizini, uzaklığın karesi). Boş ağaçta ValueError."""
        result = self.k_nearest(query, 1)
        if not result:
            raise ValueError("boş ağaçta en yakın nokta yok")
        dist2, index = result[0]
        return index, dist2

    def k_nearest(self, query: Sequence[float], k: int) -> list[tuple[float, int]]:
        """En yakın k nokta: (uzaklığın karesi, dizin) çiftleri, artan sırada."""
        self._check_query(query)
        heap: list[tuple[float, int]] = []  # (−uzaklık², −dizin): en uzağı tepede tutar

        def visit(node: int) -> None:
            if node == -1:
                return
            index = self._point[node]
            point = self._points[index]
            d2 = _dist2(point, query)
            if len(heap) < k:
                heapq.heappush(heap, (-d2, -index))
            elif (d2, index) < (-heap[0][0], -heap[0][1]):
                heapq.heapreplace(heap, (-d2, -index))
            diff = query[self._axis[node]] - point[self._axis[node]]
            near, far = (self._left, self._right) if diff < 0 else (self._right, self._left)
            visit(near[node])
            worst = -heap[0][0] if len(heap) == k else math.inf
            if diff * diff <= worst:
                visit(far[node])

        if k > 0:
            visit(self._root)
        return sorted((-d2, -i) for d2, i in heap)

    def in_box(self, low: Sequence[float], high: Sequence[float]) -> list[int]:
        """low[j] ≤ p[j] ≤ high[j] (her j için) koşulunu sağlayan noktaların sıralı dizinleri."""
        self._check_query(low)
        self._check_query(high)
        found: list[int] = []
        stack = [self._root]
        while stack:
            node = stack.pop()
            if node == -1:
                continue
            point = self._points[self._point[node]]
            if all(lo <= x <= hi for lo, x, hi in zip(low, point, high)):
                found.append(self._point[node])
            axis = self._axis[node]
            if low[axis] <= point[axis]:
                stack.append(self._left[node])
            if point[axis] <= high[axis]:
                stack.append(self._right[node])
        return sorted(found)
