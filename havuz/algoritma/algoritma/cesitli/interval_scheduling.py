"""Aralık zamanlama (açgözlü): çakışmayan en çok etkinlik seçimi ve en az salonla tüm etkinlikler.

Fikir:
    Aralıklar yarı açıktır: [başlangıç, bitiş) — 10'da biten ile 10'da başlayan çakışmaz.
    En çok etkinlik: BİTİŞE göre sırala; son seçilenden sonra başlayanı seç. Değişim argümanı:
    bir en iyi çözümün ilk etkinliği en erken bitenle değiştirilebilir (daha erken bitip yer
    açar), çözüm kötüleşmez; tümevarımla açgözlü seçim en iyidir.
    En az salon: BAŞLANGICA göre sırala; salonların boşalma zamanlarını en-küçük yığında tut;
    en erken boşalan salon yetişiyorsa ona, değilse yeni salona koy. Gereken salon sayısı aynı
    anda süren en çok etkinlik sayısıdır (daha azı olanaksız).

Karmaşıklık: ikisi de O(n log n); yer O(n)
Ne zaman: toplantı salonu, kaynak/CPU ayırma, ders programı, reklam yerleşimi.
Ne zaman değil: etkinliklerin ağırlığı (kârı) farklıysa açgözlü yanlıştır: ağırlıklı aralık
    zamanlama DP + ikili arama gerektirir.
Bağımlılık: yok
Genişletme: ağırlıklı sürüm için bitişe göre sırala, p(j) = j'den önce biten son etkinlik
    (ikili arama), dp[j] = max(dp[j−1], w_j + dp[p(j)]).

Örnek:
    >>> meetings = [(9, 11), (10, 12), (11, 13), (12, 14), (13, 15)]
    >>> max_non_overlapping(meetings), min_rooms(meetings)
    ([0, 2, 4], 2)
    >>> assign_rooms(meetings)
    [0, 1, 0, 1, 0]
"""

from __future__ import annotations

import heapq
from collections.abc import Sequence


def max_non_overlapping(intervals: Sequence[tuple[float, float]]) -> list[int]:
    """Birbiriyle çakışmayan en çok sayıda aralığın dizinleri (bitişe göre sıralı)."""
    order = sorted(range(len(intervals)), key=lambda i: (intervals[i][1], intervals[i][0]))
    chosen: list[int] = []
    last_end = float("-inf")
    for i in order:
        start, end = intervals[i]
        if start >= last_end:
            chosen.append(i)
            last_end = end
    return chosen


def assign_rooms(intervals: Sequence[tuple[float, float]]) -> list[int]:
    """Her aralığa salon numarası (0'dan); çakışanlar aynı salona düşmez; salon sayısı en az."""
    for start, end in intervals:
        if end < start:
            raise ValueError(f"bitiş başlangıçtan önce olamaz: ({start}, {end})")
    order = sorted(range(len(intervals)), key=lambda i: intervals[i])
    free_at: list[tuple[float, int]] = []  # (boşalma zamanı, salon)
    room_of = [0] * len(intervals)
    rooms = 0
    for i in order:
        start, end = intervals[i]
        if free_at and free_at[0][0] <= start:
            _, room = heapq.heappop(free_at)
        else:
            room, rooms = rooms, rooms + 1
        room_of[i] = room
        heapq.heappush(free_at, (end, room))
    return room_of


def min_rooms(intervals: Sequence[tuple[float, float]]) -> int:
    """Tüm aralıkları çakışmasız yerleştirmek için gereken en az salon sayısı."""
    return max(assign_rooms(intervals), default=-1) + 1
