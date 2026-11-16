"""Kalıp — önek toplamı: P[i] = ilk i öğenin toplamı; her aralık toplamı P[hi] − P[lo], O(1).

Fikir:
    Bir kez O(n)'de önek toplamları hesaplanır; sonra her [lo, hi) aralığının toplamı iki sayının
    farkıdır. Üç yaygın uzantı:
      * Sözlük + önek: "toplamı tam k olan ardışık parça sayısı": P[j] − P[i] = k ⇔
        P[i] = P[j] − k; o ana dek görülen önek değerleri sayılır (negatiflerde de çalışır).
      * 2B önek: S[r][c] = sol üst dikdörtgenin toplamı; her alt dikdörtgen dört terimle.
      * Fark dizisi (tersi): "aralığa ekle" işlemleri D[lo] += x, D[hi] −= x ile O(1); sonda tek
        bir önek toplamı tüm değerleri verir.
    Akla gelmeli: çok sayıda aralık toplamı sorusu, "toplamı k olan alt dizi", çok sayıda aralık
    güncellemesi ardından tek okuma.

Karmaşıklık: kurulum O(n) (2B: O(r·c)); sorgu O(1); fark dizisi: güncelleme O(1), okuma O(n)
Ne zaman: dizi DEĞİŞMİYOR (ya da tüm güncellemeler okumadan önce geliyor).
Ne zaman değil: güncelleme ve sorgu iç içe geliyorsa `algoritma/veri_yapilari/fenwick_tree.py` ya da
    segment ağacı.
Bağımlılık: yok
Genişletme: XOR, çarpım (sıfırsız) gibi tersi olan işlemler için aynı kalıp çalışır.

Örnek:
    >>> count_subarrays_with_sum([3, -1, 2, 1, -2, 2], 2)
    5
    >>> occupancy_per_day(5, [(0, 3), (1, 5), (2, 3)])
    [1, 2, 3, 1, 1]
    >>> table = prefix_2d([[1, 2], [3, 4]])
    >>> rect_sum(table, 0, 0, 2, 2), rect_sum(table, 1, 0, 2, 2)
    (10, 7)
"""

from __future__ import annotations

from collections.abc import Sequence


def prefix_sums(values: Sequence[int]) -> list[int]:
    """İSKELET: P[0] = 0, P[i] = values[0] + … + values[i−1]; aralık [lo, hi) = P[hi] − P[lo]."""
    prefix = [0]
    for value in values:
        prefix.append(prefix[-1] + value)
    return prefix


def count_subarrays_with_sum(changes: Sequence[int], target: int) -> int:
    """Problem: Bir esnafın kasasındaki günlük net değişim (artı ya da eksi) kayıtlı. Toplam net
    değişimi tam `target` olan kaç ardışık gün dilimi var?
    Çözüm: önek değerleri bir sözlükte sayılır; her j için P[j] − target kaç kez görüldüyse
    o kadar dilim j'de biter.
    """
    seen = {0: 1}
    running = count = 0
    for change in changes:
        running += change
        count += seen.get(running - target, 0)
        seen[running] = seen.get(running, 0) + 1
    return count


def occupancy_per_day(days: int, stays: Sequence[tuple[int, int]]) -> list[int]:
    """Problem: Bir pansiyonda her konaklama [giriş, çıkış) günlerini kapsıyor. Her günün
    doluluğunu (o gün kalan misafir sayısı) bulun.
    Çözüm (fark dizisi): girişte +1, çıkışta −1; sonra önek toplamı.
    """
    difference = [0] * (days + 1)
    for start, end in stays:
        if not 0 <= start <= end <= days:
            raise ValueError(f"geçersiz konaklama: [{start}, {end})")
        difference[start] += 1
        difference[end] -= 1
    return prefix_sums(difference)[1 : days + 1]


def prefix_2d(grid: Sequence[Sequence[int]]) -> list[list[int]]:
    """Problem: Bir tarlanın parsel verimleri ızgarada; birçok dikdörtgen bölgenin toplam verimi
    sorulacak. S[r][c] = ilk r satır, ilk c sütunun toplamı (kenarlarda 0 satırı/sütunu var).
    """
    rows, cols = len(grid), len(grid[0]) if grid else 0
    table = [[0] * (cols + 1) for _ in range(rows + 1)]
    for r in range(rows):
        for c in range(cols):
            table[r + 1][c + 1] = grid[r][c] + table[r][c + 1] + table[r + 1][c] - table[r][c]
    return table


def rect_sum(table: Sequence[Sequence[int]], r1: int, c1: int, r2: int, c2: int) -> int:
    """[r1, r2) × [c1, c2) dikdörtgeninin toplamı (içerme-dışlama ile dört terim)."""
    return table[r2][c2] - table[r1][c2] - table[r2][c1] + table[r1][c1]
