"""Bit maskeli DP: n kişiye n işi en ucuza atama (kim hangi işi yapacak?), O(n · 2ⁿ).

Fikir:
    Kaba kuvvet n! atamayı dener. Oysa sırayla 0., 1., 2. … kişiye iş verirken önemli olan
    yalnız "hangi işler zaten verildi" kümesidir; kim hangisini aldı değil. Bu küme n bitlik
    bir tam sayıyla (bit maskesi) gösterilir: j. bit 1 ise j. iş verilmiş demektir.
    best[mask] = maskedeki işler ilk popcount(mask) kişiye verildiğinde en az maliyet.
    Sıradaki kişi k = popcount(mask), maskede olmayan her j işini dener:
        best[mask | 1<<j] = min(best[mask] + cost[k][j]).
    Her maske için son verilen iş saklanır; tam maskeden geri yürünerek atama kurulur.

Karmaşıklık: zaman O(n · 2ⁿ); yer O(2ⁿ) — Python'da pratik sınır n ≈ 20
Ne zaman: küçük n'de (≤ 20) "alt küme" durumlu her problem: atama, küme örtüsü, gezgin satıcı
    (`algoritma/graf/tsp_held_karp.py`), çakışmasız seçim.
Ne zaman değil: n büyükse atama problemi için Macar algoritması O(n³) ya da
    `algoritma/graf/min_cost_flow.py`.
Bağımlılık: yok
Genişletme: kişi sayısı iş sayısından azsa (n × m, n ≤ m) aynı kod çalışır; maske m bitlik olur.

Örnek:
    >>> min_cost_assignment([[9, 2, 7], [6, 4, 3], [5, 8, 1]])
    (9, [1, 0, 2])
"""

from __future__ import annotations

import math
from collections.abc import Sequence


def min_cost_assignment(cost: Sequence[Sequence[float]]) -> tuple[float, list[int]]:
    """cost[kişi][iş] (n kişi, m ≥ n iş). (en az toplam, assignment[kişi] = iş)."""
    n = len(cost)
    m = len(cost[0]) if n else 0
    if n > m:
        raise ValueError("kişi sayısı iş sayısından fazla olamaz")
    best: list[float] = [math.inf] * (1 << m)
    last_job = [-1] * (1 << m)
    best[0] = 0
    for mask in range(1 << m):
        person = mask.bit_count()
        if person >= n or best[mask] == math.inf:
            continue
        for job in range(m):
            if mask >> job & 1:
                continue
            nxt = mask | 1 << job
            candidate = best[mask] + cost[person][job]
            if candidate < best[nxt]:
                best[nxt] = candidate
                last_job[nxt] = job
    full = min((mask for mask in range(1 << m) if mask.bit_count() == n), key=best.__getitem__)
    assignment = [0] * n
    mask = full
    for person in range(n - 1, -1, -1):
        job = last_job[mask]
        assignment[person] = job
        mask ^= 1 << job
    return best[full], assignment
