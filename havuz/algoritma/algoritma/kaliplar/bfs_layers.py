"""Kalıp — BFS katmanları: kaynak(lar)dan adım adım yayılan dalgalar; en az adım = katman numarası.

Fikir:
    BFS'de kuyruk, "şu an işlenen katman" ve "bir sonraki katman" diye düşünülürse her katman
    kaynaktan aynı uzaklıktaki düğümlerdir. Katman katman ilerlemek üç soruyu doğal yanıtlar:
    "en az kaç adım", "her şey kaçıncı adımda dolar/bulaşır" ve "aynı anda birden çok kaynak"
    (ÇOK KAYNAKLI BFS: tüm kaynaklar başta 0. katmana konur — her hücrenin EN YAKIN kaynağa
    uzaklığı tek geçişte bulunur). Durumlar ızgara hücresi olmak zorunda değil: kilit
    kombinasyonu, kat numarası, bulmaca durumu da olabilir (örtük graf).
    Akla gelmeli: "en az hamle/adım/gün", "yayılma", "en yakın X'e uzaklık", tüm kenarlar eşit.

Karmaşıklık: O(durum + geçiş); yer O(durum)
Ne zaman: ağırlıksız (eşit maliyetli) adımlar; durum uzayı belleğe sığıyor.
Ne zaman değil: adımların maliyeti farklıysa Dijkstra (`algoritma/graf/dijkstra.py`); 0/1
    maliyetlerde 0-1 BFS (`algoritma/graf/bfs.py`).
Bağımlılık: yok
Genişletme: çok büyük durum uzaylarında iki uçtan (başlangıç ve hedef) aynı anda BFS
    (çift yönlü) aranan derinliği yarıya indirir.

Örnek:
    >>> bfs_layers([0], lambda x: [x + 1, x * 2] if x < 10 else [])[:4]
    [[0], [1], [2], [3, 4]]
    >>> distance_to_nearest_station(["S..", ".#.", "..S"])
    [[0, 1, 2], [1, -1, 1], [2, 1, 0]]
    >>> elevator_presses(10, 1, 10, up=3, down=1), days_until_all_sick(["S..", "...", ".#."])
    (3, 4)
"""

from __future__ import annotations

from collections.abc import Callable, Hashable, Iterable, Sequence
from typing import TypeVar

N = TypeVar("N", bound=Hashable)


def bfs_layers(sources: Iterable[N], neighbors: Callable[[N], Iterable[N]]) -> list[list[N]]:
    """İSKELET: katmanlar listesi; i. katman kaynaklara tam i adım uzaktaki durumlar."""
    layer = list(dict.fromkeys(sources))  # yinelenen kaynakları ayıkla, sırayı koru
    seen = set(layer)
    layers: list[list[N]] = []
    while layer:
        layers.append(layer)
        next_layer: list[N] = []
        for node in layer:
            for nxt in neighbors(node):
                if nxt not in seen:
                    seen.add(nxt)
                    next_layer.append(nxt)
        layer = next_layer
    return layers


def _grid_neighbors(grid: Sequence[str]) -> Callable[[tuple[int, int]], list[tuple[int, int]]]:
    rows, cols = len(grid), len(grid[0]) if grid else 0

    def neighbors(cell: tuple[int, int]) -> list[tuple[int, int]]:
        r, c = cell
        around = ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1))
        return [(a, b) for a, b in around if 0 <= a < rows and 0 <= b < cols and grid[a][b] != "#"]

    return neighbors


def distance_to_nearest_station(grid: Sequence[str]) -> list[list[int]]:
    """Problem: Bir semt haritasında 'S' metro istasyonu, '#' geçilmez bina, '.' sokak. Her
    sokak hücresinden EN YAKIN istasyona kaç adım yürünür (4 yön)? Ulaşılamayan ve bina: −1.
    Çözüm: tüm istasyonlar aynı anda 0. katman (çok kaynaklı BFS).
    """
    stations = [(r, c) for r, row in enumerate(grid) for c, ch in enumerate(row) if ch == "S"]
    distance = [[-1] * len(row) for row in grid]
    for step, layer in enumerate(bfs_layers(stations, _grid_neighbors(grid))):
        for r, c in layer:
            distance[r][c] = step
    return distance


def elevator_presses(floors: int, start: int, goal: int, up: int, down: int) -> int:
    """Problem: Eski bir binanın asansöründe yalnız iki düğme var: "up kat yukarı" ve "down kat
    aşağı" (bina dışına çıkan basış işe yaramaz). 1 … floors katlı binada start'tan goal'e en az
    kaç basış gerekir? Olanaksızsa −1.
    """
    if not (1 <= start <= floors and 1 <= goal <= floors):
        raise ValueError("katlar 1 ile kat sayısı arasında olmalı")

    def neighbors(floor: int) -> list[int]:
        return [f for f in (floor + up, floor - down) if 1 <= f <= floors]

    for presses, layer in enumerate(bfs_layers([start], neighbors)):
        if goal in layer:
            return presses
    return -1


def days_until_all_sick(classroom: Sequence[str]) -> int:
    """Problem: Bir sınıf ızgarasında 'S' hasta, '.' sağlıklı öğrenci, '#' boş sıra. Her gün,
    hasta öğrencinin dört komşusundaki sağlıklılar hastalanır. Herkes kaçıncı günün sonunda
    hasta olur? Bulaşmayan sağlıklı öğrenci kalırsa −1.
    """
    sick = [(r, c) for r, row in enumerate(classroom) for c, ch in enumerate(row) if ch == "S"]
    layers = bfs_layers(sick, _grid_neighbors(classroom))
    reached = sum(len(layer) for layer in layers)
    healthy_total = sum(row.count(".") + row.count("S") for row in classroom)
    if reached != healthy_total:
        return -1
    return max(len(layers) - 1, 0)
