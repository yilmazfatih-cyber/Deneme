"""Hızlı seçme (quickselect): k. en küçük öğeyi tümünü sıralamadan, beklenen O(n)'de bulur.

Fikir:
    Hızlı sıralamadaki bölümleme adımı yapılır, ama yalnız aranan sıranın düştüğü bölgeyle
    devam edilir; öbür bölge hiç sıralanmaz. Rastgele pivot ile her adımda ortalama olarak
    kalan iş sabit bir oranla küçülür: n + n/2 + n/4 + … = O(n). Üç yollu bölümleme, çok
    yinelenen değerlerde bile ilerlemeyi güvenceye alır. Döngüyle yazıldı, özyineleme yok.

Karmaşıklık: zaman beklenen O(n), en kötü O(n²) (rastgele pivotla olasılığı ihmal edilebilir);
    ek yer O(n) (girdinin kopyası)
Ne zaman: ortanca, yüzdelik dilim, en küçük k öğe (k. öğeyi bulup ondan küçükleri alın).
Ne zaman değil: en kötü durum güvencesi gerekiyorsa `median_of_medians.py`; çok sayıda farklı k
    için bir kez sıralamak daha ucuzdur. Küçük k için `heapq.nsmallest` da uygundur.
Bağımlılık: yok
Genişletme: yerinde çalışan sürüm için kopya yerine çağıranın listesini doğrudan bölümleyin.

Örnek:
    >>> import random
    >>> data = [7, 10, 4, 3, 20, 15]
    >>> quickselect(data, 2, rng=random.Random(0)), quickselect(data, 0), quickselect(data, 5)
    (7, 3, 20)
"""

from __future__ import annotations

import random
from collections.abc import Sequence
from typing import Any, Protocol, TypeVar


class _Comparable(Protocol):
    def __lt__(self, other: Any, /) -> bool: ...


T = TypeVar("T", bound=_Comparable)


def quickselect(items: Sequence[T], k: int, rng: random.Random | None = None) -> T:
    """Sıralı düzende k. öğe (0'dan başlar): sorted(items)[k] ile aynı sonucu verir."""
    if not 0 <= k < len(items):
        raise IndexError(f"k sınır dışında: {k} (uzunluk {len(items)})")
    rng = rng if rng is not None else random.Random(0)
    a = list(items)
    lo, hi = 0, len(a) - 1
    while True:
        pivot = a[rng.randint(lo, hi)]
        lt, i, gt = lo, lo, hi  # üç yollu bölümleme: [<pivot | =pivot | >pivot]
        while i <= gt:
            if a[i] < pivot:
                a[lt], a[i] = a[i], a[lt]
                lt += 1
                i += 1
            elif pivot < a[i]:
                a[i], a[gt] = a[gt], a[i]
                gt -= 1
            else:
                i += 1
        if k < lt:
            hi = lt - 1
        elif k > gt:
            lo = gt + 1
        else:
            return pivot
