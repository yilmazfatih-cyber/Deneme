"""KMP (Knuth-Morris-Pratt): metinde bir desenin tüm geçişlerini O(n + m)'de bulur.

Fikir:
    Önek fonksiyonu pi[i] = desen[:i+1]'in hem öneki hem (kendisi olmayan) soneki olan en uzun
    parçasının uzunluğu. Eşleşme i. karakterde bozulduğunda baştan başlamak yerine desen
    pi[eşleşen−1] kadar kaydırılır: o kadar karakterin zaten eşleştiği bilinir. Böylece metindeki
    hiçbir karaktere geri dönülmez; toplam karşılaştırma ≤ 2n. pi de aynı mantıkla desenin
    kendisi üstünde O(m)'de hesaplanır. Çakışan geçişler de bulunur ("aa" içinde "aaa": 0, 1).

Karmaşıklık: zaman O(n + m); yer O(m)
Ne zaman: tek desen, uzun metin, en kötü durum güvencesi; akış hâlinde gelen metinde arama;
    bir dizginin en kısa periyodu (n − pi[n−1]).
Ne zaman değil: Python'da tek seferlik arama için `str.find` / `re` (C ile yazılmış) daha hızlı;
    çok sayıda desen için `aho_corasick.py`.
Bağımlılık: yok
Genişletme: dizgi yerine herhangi bir dizi (kelime listesi, sayı dizisi) de aynı kodla aranır.

Örnek:
    >>> prefix_function("ababaca")
    [0, 0, 1, 2, 3, 0, 1]
    >>> kmp_search("abababab", "abab"), kmp_search("İzmir izmir", "zmir")
    ([0, 2, 4], [1, 7])
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import TypeVar

T = TypeVar("T")


def prefix_function(pattern: Sequence[T]) -> list[int]:
    """pi[i] = pattern[:i+1]'in en uzun öz önek-soneki."""
    pi = [0] * len(pattern)
    k = 0
    for i in range(1, len(pattern)):
        while k > 0 and pattern[i] != pattern[k]:
            k = pi[k - 1]  # daha kısa bir önek-sonek dene
        if pattern[i] == pattern[k]:
            k += 1
        pi[i] = k
    return pi


def kmp_search(text: Sequence[T], pattern: Sequence[T]) -> list[int]:
    """Desenin metindeki tüm başlangıç konumları (çakışanlar dahil). Boş desen: her konum."""
    if not pattern:
        return list(range(len(text) + 1))
    pi = prefix_function(pattern)
    found = []
    k = 0  # şu an eşleşmiş karakter sayısı
    for i, char in enumerate(text):
        while k > 0 and char != pattern[k]:
            k = pi[k - 1]
        if char == pattern[k]:
            k += 1
        if k == len(pattern):
            found.append(i - k + 1)
            k = pi[k - 1]  # çakışan bir sonraki geçişi kaçırma
    return found
