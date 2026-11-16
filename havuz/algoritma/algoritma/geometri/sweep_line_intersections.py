"""Süpürme çizgisiyle kesişim sayımı: yatay ve dikey parçalar arasındaki kesişimler, O(n log n).

Fikir:
    Dikey bir çizgi soldan sağa "süpürülür". Olaylar x'e göre sıralanır:
      * yatay parça başlar → onun y'si "etkin" kümeye eklenir,
      * dikey parça (x'te) → etkin yatayların y'si [y1, y2] aralığındaysa her biri bir kesişim,
      * yatay parça biter → y'si kümeden çıkarılır.
    Aynı x'te sıra: önce başlayanlar, sonra dikeyler, sonra bitenler (uçta değme de kesişim
    sayılır). "Aralıktaki etkin y sayısı" sorusu Fenwick ağacıyla O(log n)'de yanıtlanır; y'ler
    önce sıkıştırılır (yalnız geçen değerlerin sırası tutulur). Kaba kuvvet O(H·V)'dir.
    Genel (eğik) parçalar için Bentley-Ottmann gerekir; o burada YOK (bkz. README "Sınırlar").

Karmaşıklık: zaman O((H + V) log(H + V)); yer O(H + V)
Ne zaman: VLSI/devre tasarımı, harita ızgaraları, dikdörtgen kenarlarının kesişimi sayımı.
Ne zaman değil: birkaç parça için doğrudan çift çift deneyin (`segment_intersection.py`).
Bağımlılık: yok (Fenwick ağacının kısa bir kopyası içeride; tam sürüm:
    `algoritma/veri_yapilari/fenwick_tree.py`)
Genişletme: kesişen çiftlerin kendisi gerekiyorsa Fenwick yerine sıralı bir kümede aralığı gezin
    (O(n log n + k)).

Örnek:
    >>> horizontals = [((0, 2), (6, 2)), ((1, 4), (5, 4))]
    >>> verticals = [((3, 0), (3, 5)), ((5, 3), (5, 6)), ((7, 0), (7, 9))]
    >>> count_orthogonal_intersections(horizontals, verticals)
    3
"""

from __future__ import annotations

from bisect import bisect_left, bisect_right
from collections.abc import Sequence

Segment = tuple[tuple[int, int], tuple[int, int]]
_START, _QUERY, _END = 0, 1, 2  # aynı x'te işlem sırası


class _Fenwick:
    def __init__(self, n: int) -> None:
        self.tree = [0] * (n + 1)

    def add(self, i: int, delta: int) -> None:
        i += 1
        while i < len(self.tree):
            self.tree[i] += delta
            i += i & -i

    def prefix(self, count: int) -> int:
        total = 0
        while count > 0:
            total += self.tree[count]
            count -= count & -count
        return total


def count_orthogonal_intersections(
    horizontals: Sequence[Segment], verticals: Sequence[Segment]
) -> int:
    """Yatay ((x1, y), (x2, y)) ve dikey ((x, y1), (x, y2)) parçalar arasındaki kesişim sayısı."""
    for (ax, ay), (bx, by) in horizontals:
        if ay != by:
            raise ValueError(f"yatay parçanın y'leri eşit olmalı: {((ax, ay), (bx, by))}")
    for (ax, ay), (bx, by) in verticals:
        if ax != bx:
            raise ValueError(f"dikey parçanın x'leri eşit olmalı: {((ax, ay), (bx, by))}")
    ys = sorted({a[1] for a, _ in horizontals})  # koordinat sıkıştırma
    events: list[tuple[int, int, int, int]] = []  # (x, tür, y ya da y1, y2)
    for (x1, y), (x2, _) in horizontals:
        events.append((min(x1, x2), _START, y, 0))
        events.append((max(x1, x2), _END, y, 0))
    for (x, y1), (_, y2) in verticals:
        events.append((x, _QUERY, min(y1, y2), max(y1, y2)))
    events.sort()
    active = _Fenwick(len(ys))
    total = 0
    for _, kind, a, b in events:
        if kind == _START:
            active.add(bisect_left(ys, a), 1)
        elif kind == _END:
            active.add(bisect_left(ys, a), -1)
        else:
            total += active.prefix(bisect_right(ys, b)) - active.prefix(bisect_left(ys, a))
    return total
