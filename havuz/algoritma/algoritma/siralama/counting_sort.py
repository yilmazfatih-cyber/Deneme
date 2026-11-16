"""Sayma sıralaması: küçük aralıktaki tam sayı anahtarları karşılaştırmadan, O(n + k)'de sıralar.

Fikir:
    Anahtarlar [en küçük, en büyük] aralığındaki tam sayılarsa her anahtarın kaç kez geçtiği
    sayılır. Sayıların önek toplamı her anahtarın çıktıdaki ilk konumunu verir. Girdi soldan
    sağa gezilip her öğe kendi anahtarının sıradaki konumuna yazılır; böylece eşit anahtarlar
    özgün sırasını korur (kararlı). Karşılaştırma yapılmadığı için O(n log n) alt sınırı
    geçerli değildir; bedeli, anahtar aralığı k kadar bellektir.

Karmaşıklık: zaman O(n + k), ek yer O(n + k) (k = en büyük − en küçük + 1)
Kararlılık: kararlı
Ne zaman: anahtar aralığı küçükse (yaş, not, gün, bayt); taban sıralamanın iç adımı olarak.
Ne zaman değil: aralık n'den çok büyükse (ör. 64 bit kimlikler) — `radix_sort.py` ya da `sorted()`.
Bağımlılık: yok
Genişletme: `max_range` sınırı yanlışlıkla dev bellek ayırmayı önler; gerekirse artırın.

Örnek:
    >>> counting_sort([4, -1, 2, 4, 0])
    [-1, 0, 2, 4, 4]
    >>> counting_sort(["elma", "ev", "at"], key=len)
    ['ev', 'at', 'elma']
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any, TypeVar, cast

T = TypeVar("T")


def counting_sort(
    items: Sequence[T], key: Callable[[T], int] | None = None, max_range: int = 10_000_000
) -> list[T]:
    """Tam sayı anahtarlara göre kararlı sıralanmış yeni liste."""
    get_key: Callable[[T], int] = key if key is not None else cast(Callable[[Any], int], int)
    keys = [get_key(item) for item in items]
    if not keys:
        return []
    low, high = min(keys), max(keys)
    if high - low + 1 > max_range:
        raise ValueError(
            f"anahtar aralığı çok geniş ({high - low + 1}); radix_sort ya da sorted() kullanın"
        )
    counts = [0] * (high - low + 1)
    for k in keys:
        counts[k - low] += 1
    position = 0
    for value, count in enumerate(counts):  # önek toplamı: her anahtarın ilk çıktı konumu
        counts[value] = position
        position += count
    result: list[T | None] = [None] * len(items)
    for item, k in zip(items, keys):
        result[counts[k - low]] = item
        counts[k - low] += 1
    return cast(list[T], result)
