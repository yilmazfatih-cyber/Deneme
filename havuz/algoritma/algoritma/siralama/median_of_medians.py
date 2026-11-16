"""Medyanların medyanı (BFPRT): k. en küçüğü EN KÖTÜ durumda da O(n)'de bulan belirlenimci seçme.

Fikir:
    Quickselect'in tek zayıflığı kötü pivottur. Burada pivot özenle seçilir: öğeler 5'li
    gruplara bölünür, her grubun ortancası alınır ve bu ortancaların ortancası (yine bu
    algoritmayla) pivot yapılır. Bu pivotun altında ve üstünde öğelerin en az ~%30'u bulunur,
    yani her turda en az %30 elenir: T(n) ≤ T(n/5) + T(7n/10) + O(n) = O(n).
    Kuyruk özyinelemesi döngüye çevrildi; yalnız pivot hesabı özyinelemelidir (derinlik log_5 n).

Karmaşıklık: zaman en kötü O(n); ek yer O(n). Ölçüm: 200 000 rastgele sayıda bu gerçekleme
    `quickselect.py` ile aynı mertebede (~0.12 sn; ikisinde de bölümleme maliyeti baskın)
Ne zaman: rakip girdiye karşı güvence gerektiğinde (ör. saldırganın seçtiği veri); introselect'in
    yedek planı; kuramsal sınır gerektiğinde.
Ne zaman değil: sıradan veride `quickselect.py` daha basittir ve yeterlidir.
Bağımlılık: yok
Özyineleme: derinlik ≈ log_5 n (n = 10^9 için ~13); yığın taşmaz.
Genişletme: gruplar 7'li de olabilir; 3'lü gruplar doğrusal zamanı bozar.

Örnek:
    >>> median_of_medians_select([9, 1, 8, 2, 7, 3, 6, 4, 5], 4)
    5
    >>> median_of_medians_select(list(range(100, 0, -1)), 0)
    1
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Protocol, TypeVar


class _Comparable(Protocol):
    def __lt__(self, other: Any, /) -> bool: ...


T = TypeVar("T", bound=_Comparable)


def median_of_medians_select(items: Sequence[T], k: int) -> T:
    """Sıralı düzende k. öğe (0'dan başlar); en kötü durumda doğrusal."""
    if not 0 <= k < len(items):
        raise IndexError(f"k sınır dışında: {k} (uzunluk {len(items)})")
    a = list(items)
    while True:
        if len(a) <= 5:
            return sorted(a)[k]
        groups = [sorted(a[i : i + 5]) for i in range(0, len(a), 5)]
        medians = [group[(len(group) - 1) // 2] for group in groups]
        pivot = median_of_medians_select(medians, (len(medians) - 1) // 2)
        lows = [x for x in a if x < pivot]
        highs = [x for x in a if pivot < x]
        equal_count = len(a) - len(lows) - len(highs)
        if k < len(lows):
            a = lows
        elif k < len(lows) + equal_count:
            return pivot
        else:
            k -= len(lows) + equal_count
            a = highs
