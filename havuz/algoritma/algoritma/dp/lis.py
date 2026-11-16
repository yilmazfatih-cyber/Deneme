"""En uzun artan alt dizi (LIS), O(n log n): uzunluğu değil alt dizinin kendisini döndürür.

Fikir:
    tails[k] = şimdiye dek görülen, uzunluğu k+1 olan artan alt dizilerin en KÜÇÜK son öğesi.
    tails her zaman artan sıralıdır; bu yüzden yeni öğe x için yeri ikili aramayla bulunur:
    x'ten büyük-eşit ilk tails[j] yerine x yazılır (j = len ise sona eklenir). Böylece uzunluk
    j+1 olan bir alt dizinin sonu x olur. Yanıtın kendisi için her öğenin "bir önceki öğesi"
    (tails[j−1]'deki dizin) saklanır ve sondan geriye yürünür.
    Kesin artan yerine azalmayan (≤) istenirse ikili arama `bisect_right` olur.

Karmaşıklık: zaman O(n log n); yer O(n)
Ne zaman: sıralamaya en yakın alt dizi, iç içe kutular (zarflar), sabır oyunu, sürüm sıraları.
Ne zaman değil: iki dizinin ortak alt dizisi gerekiyorsa `lcs.py`.
Bağımlılık: yok
Genişletme: en uzun AZALAN alt dizi için öğeleri ters işaretle (−x) verin ya da `key` ekleyin.

Örnek:
    >>> longest_increasing_subsequence([3, 1, 4, 1, 5, 9, 2, 6])
    [1, 4, 5, 6]
    >>> lis_indices([3, 1, 4, 1, 5, 9, 2, 6]), longest_increasing_subsequence([2, 2, 2], strict=False)
    ([1, 2, 4, 7], [2, 2, 2])
"""

from __future__ import annotations

from bisect import bisect_left, bisect_right
from collections.abc import Sequence
from typing import Any, Protocol, TypeVar


class _Comparable(Protocol):
    def __lt__(self, other: Any, /) -> bool: ...


T = TypeVar("T", bound=_Comparable)


def lis_indices(seq: Sequence[T], strict: bool = True) -> list[int]:
    """En uzun artan (strict=False: azalmayan) alt dizinin dizinleri."""
    tail_values: list[T] = []
    tail_index: list[int] = []
    previous = [-1] * len(seq)
    search = bisect_left if strict else bisect_right
    for i, x in enumerate(seq):
        j = search(tail_values, x)
        if j == len(tail_values):
            tail_values.append(x)
            tail_index.append(i)
        else:
            tail_values[j] = x
            tail_index[j] = i
        previous[i] = tail_index[j - 1] if j > 0 else -1
    result = []
    k = tail_index[-1] if tail_index else -1
    while k != -1:
        result.append(k)
        k = previous[k]
    return result[::-1]


def longest_increasing_subsequence(seq: Sequence[T], strict: bool = True) -> list[T]:
    """En uzun artan alt dizinin öğeleri."""
    return [seq[i] for i in lis_indices(seq, strict)]
