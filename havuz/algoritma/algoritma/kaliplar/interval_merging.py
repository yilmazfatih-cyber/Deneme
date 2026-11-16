"""Kalıp — aralık birleştirme: aralıkları başlangıca göre sırala, çakışanları tek geçişte birleştir.

Fikir:
    Başlangıca göre sıralanmış aralıklarda, bir aralık ancak SON birleştirilmiş aralıkla
    çakışabilir (öncekiler zaten daha önce bitmiştir). Bu yüzden tek geçiş yeter: çakışıyorsa son
    aralığın bitişini uzat, değilse yeni aralık başlat. Aynı iskelet; toplam kapsanan uzunluk,
    boşlukları (kimsenin meşgul olmadığı zamanlar) bulma, yeni aralık ekleme gibi soruları çözer.
    Kural seçimi önemli: burada aralıklar KAPALI [a, b] ve dokunanlar ([1, 3] ile [3, 5])
    birleştirilir; yarı açık mantık isteniyorsa karşılaştırmayı `<` yapın.
    Akla gelmeli: takvim, rezervasyon, IP aralıkları, "kapsanan toplam uzunluk", "ortak boş zaman".

Karmaşıklık: O(n log n) (sıralama); geçiş O(n); yer O(n)
Ne zaman: aralık kümesi elde ve bir kez işlenecek.
Ne zaman değil: aralıklar tek tek eklenip sık sorgulanıyorsa
    `algoritma/veri_yapilari/interval_tree.py` ya da sıralı bir yapı.
Bağımlılık: yok
Genişletme: her birleşik aralığa kaç aralığın katıldığını saymak için birleşirken sayaç tutun.

Örnek:
    >>> merge_intervals([(9, 12), (1, 3), (2, 5), (12, 14)])
    [(1, 5), (9, 14)]
    >>> common_free_slots([[(9, 10), (13, 15)], [(9.5, 11)]], 9, 17)
    [(11, 13), (15, 17)]
    >>> covered_length([(0, 4), (3, 6), (8, 9)])
    7
"""

from __future__ import annotations

from collections.abc import Sequence


def merge_intervals(intervals: Sequence[tuple[float, float]]) -> list[tuple[float, float]]:
    """İSKELET: çakışan ya da DOKUNAN kapalı aralıkları birleştirir; sonuç sıralı ve ayrık.

    Problem: Bir doktorun takviminde randevular (başlangıç, bitiş) karışık sırada. Dolu zaman
    bloklarını (birleşik) listeleyin.
    """
    merged: list[tuple[float, float]] = []
    for start, end in sorted(intervals):
        if end < start:
            raise ValueError(f"bitiş başlangıçtan önce olamaz: ({start}, {end})")
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def common_free_slots(
    busy_lists: Sequence[Sequence[tuple[float, float]]], day_start: float, day_end: float
) -> list[tuple[float, float]]:
    """Problem: Bir ekipteki herkesin dolu saatleri ayrı listelerde. Mesai [day_start, day_end]
    içinde HERKESİN boş olduğu (uzunluğu > 0) aralıklar hangileri?
    Çözüm: tüm dolu aralıkları birleştir; birleşik bloklar arasındaki boşluklar ortak boş zamandır.
    """
    busy = merge_intervals([slot for person in busy_lists for slot in person])
    free: list[tuple[float, float]] = []
    cursor = day_start
    for start, end in busy:
        if start > cursor:
            free.append((cursor, min(start, day_end)))
        cursor = max(cursor, end)
        if cursor >= day_end:
            break
    if cursor < day_end:
        free.append((cursor, day_end))
    return [(a, b) for a, b in free if b > a]


def covered_length(segments: Sequence[tuple[float, float]]) -> float:
    """Problem: Bir yol boyunca asfaltlanan parçalar (km cinsinden [başlangıç, bitiş]) üst üste
    binebiliyor. Asfaltlanmış TOPLAM uzunluk kaç km?
    """
    return sum(end - start for start, end in merge_intervals(segments))
