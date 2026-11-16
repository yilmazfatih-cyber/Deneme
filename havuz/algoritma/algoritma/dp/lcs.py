"""En uzun ortak alt dizi (LCS) ve ondan türeyen satır farkı (diff).

Fikir:
    L[i][j] = a'nın ilk i öğesi ile b'nin ilk j öğesinin LCS uzunluğu.
      a[i−1] == b[j−1] ise L[i][j] = L[i−1][j−1] + 1 (ortak öğe alınır),
      değilse        L[i][j] = max(L[i−1][j], L[i][j−1]) (birinden bir öğe atlanır).
    Tablo dolunca sağ alt köşeden geri yürünerek alt dizinin kendisi bulunur: eşitse çapraz,
    değilse büyük olan komşuya. Aynı geri yürüyüş bir "fark" da verir: ortak öğeler korunur,
    yalnız a'da olanlar silinmiş (−), yalnız b'de olanlar eklenmiş (+) sayılır — `diff` komutu
    ve sürüm denetim sistemleri bu fikrin hızlandırılmış hâllerini kullanır.

Karmaşıklık: zaman O(n · m); yer O(n · m) (yalnız uzunluk için O(min(n, m)) yeterdi)
Ne zaman: iki metin/sürüm karşılaştırma, DNA hizalama, "ne değişti" raporu.
Ne zaman değil: çok uzun girdilerde (≫ 10⁴ satır) Myers O((n+m)·d) farkı ya da `difflib`.
    Bitişik (ardışık) ortak parça gerekiyorsa `algoritma/dizgi/longest_common_substring.py`.
Bağımlılık: yok
Genişletme: satır yerine kelime farkı için girdileri `metin.split()` ile verin.

Örnek:
    >>> "".join(longest_common_subsequence("ABCBDAB", "BDCABA"))
    'BCBA'
    >>> diff(["a", "b", "c"], ["a", "c", "d"])
    [(' ', 'a'), ('-', 'b'), (' ', 'c'), ('+', 'd')]
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import TypeVar

T = TypeVar("T")


def _table(a: Sequence[T], b: Sequence[T]) -> list[list[int]]:
    table = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(1, len(a) + 1):
        row, above = table[i], table[i - 1]
        for j in range(1, len(b) + 1):
            if a[i - 1] == b[j - 1]:
                row[j] = above[j - 1] + 1
            else:
                row[j] = max(above[j], row[j - 1])
    return table


def longest_common_subsequence(a: Sequence[T], b: Sequence[T]) -> list[T]:
    """Bir en uzun ortak alt dizi (öğeleri, sırasıyla)."""
    table = _table(a, b)
    i, j = len(a), len(b)
    result: list[T] = []
    while i and j:
        if a[i - 1] == b[j - 1]:
            result.append(a[i - 1])
            i, j = i - 1, j - 1
        elif table[i - 1][j] >= table[i][j - 1]:
            i -= 1
        else:
            j -= 1
    return result[::-1]


def diff(a: Sequence[T], b: Sequence[T]) -> list[tuple[str, T]]:
    """a'yı b'ye çeviren satır farkı: (' ', öğe) ortak, ('-', öğe) silinen, ('+', öğe) eklenen."""
    table = _table(a, b)
    i, j = len(a), len(b)
    script: list[tuple[str, T]] = []
    while i or j:
        if i and j and a[i - 1] == b[j - 1]:
            script.append((" ", a[i - 1]))
            i, j = i - 1, j - 1
        elif j and (not i or table[i][j - 1] >= table[i - 1][j]):
            script.append(("+", b[j - 1]))
            j -= 1
        else:
            script.append(("-", a[i - 1]))
            i -= 1
    return script[::-1]
