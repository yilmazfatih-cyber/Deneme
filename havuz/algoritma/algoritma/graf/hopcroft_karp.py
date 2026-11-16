"""Hopcroft-Karp: iki parçalı grafta en büyük eşleme, O(m √n).

Fikir:
    Eşleme, ortak ucu olmayan kenarlar kümesidir. "Artırıcı yol": boş bir sol köşeden boş bir
    sağ köşeye, eşlemede olmayan ve olan kenarları sırayla kullanan yol; yol boyunca kenarların
    durumu ters çevrilince eşleme 1 büyür. Artırıcı yol kalmayınca eşleme en büyüktür (Berge).
    Hopcroft-Karp her turda önce BFS ile tüm boş sol köşelerden katmanlar kurar, sonra bu
    katmanlarda birbiriyle köşe paylaşmayan EN KISA artırıcı yolların hepsini bulur. Tur sayısı
    O(√n) ile sınırlıdır. DFS özyinelemesiz yazıldı.

Karmaşıklık: zaman O(m √n); yer O(n + m)
Ne zaman: görev atama (kişi–iş, öğrenci–proje) gibi iki parçalı eşleme; en küçük köşe örtüsü
    (König teoremi: iki parçalı grafta en büyük eşleme = en küçük köşe örtüsü).
Ne zaman değil: kenarlar ağırlıklıysa (en ucuz atama) `min_cost_flow.py`; iki parçalı olmayan
    grafta Edmonds'un çiçek algoritması gerekir (bu kütüphanede yok).
Bağımlılık: yok
Genişletme: sağdaki her köşenin kapasitesi k ise onu k kopyaya bölün.

Örnek:
    >>> adj = [[0, 1], [0], [1, 2]]  # sol köşe → komşu sağ köşeler
    >>> hopcroft_karp(3, 3, adj)
    (3, [1, 0, 2], [1, 0, 2])
"""

from __future__ import annotations

from collections import deque
from collections.abc import Sequence

_INF = float("inf")


def hopcroft_karp(
    n_left: int, n_right: int, adj: Sequence[Sequence[int]]
) -> tuple[int, list[int], list[int]]:
    """(eşleme boyu, match_left, match_right); eşsiz köşelerin karşılığı −1."""
    match_left = [-1] * n_left
    match_right = [-1] * n_right
    dist: list[float] = [_INF] * n_left

    def build_layers() -> bool:
        queue: deque[int] = deque()
        for u in range(n_left):
            dist[u] = 0 if match_left[u] == -1 else _INF
            if match_left[u] == -1:
                queue.append(u)
        found_free = False
        while queue:
            u = queue.popleft()
            for v in adj[u]:
                w = match_right[v]
                if w == -1:
                    found_free = True
                elif dist[w] == _INF:
                    dist[w] = dist[u] + 1
                    queue.append(w)
        return found_free

    def augment(root: int, pointer: list[int]) -> bool:
        stack = [root]  # sol köşeler
        chosen: list[int] = []  # stack[i]'nin bir sonrakine geçmek için seçtiği sağ köşe
        while stack:
            u = stack[-1]
            if pointer[u] == len(adj[u]):
                dist[u] = _INF  # çıkmaz: bu turda bir daha denenmesin
                stack.pop()
                if chosen:
                    chosen.pop()
                continue
            v = adj[u][pointer[u]]
            pointer[u] += 1
            w = match_right[v]
            if w == -1:  # boş sağ köşe: yolu ters çevir
                chosen.append(v)
                for left, right in zip(stack, chosen):
                    match_left[left] = right
                    match_right[right] = left
                return True
            if dist[w] == dist[u] + 1:
                chosen.append(v)
                stack.append(w)
        return False

    size = 0
    while build_layers():
        pointer = [0] * n_left
        for u in range(n_left):
            if match_left[u] == -1 and augment(u, pointer):
                size += 1
    return size, match_left, match_right
