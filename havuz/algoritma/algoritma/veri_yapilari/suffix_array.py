"""Sonek dizisi + LCP dizisi: metnin tüm sonekleri sıralı; desen ve tekrar sorgularının temeli.

Fikir:
    Sonek dizisi, metnin soneklerinin başlangıç konumlarını sözlük sırasıyla verir. Kurulum
    "önek ikiye katlama" ile yapılır: her sonek önce ilk 1 harfine göre sıralanır; sonra ilk 2,
    4, 8 … harfine göre. 2k harflik sıra, k harflik sıralardan oluşan (sıra[i], sıra[i+k])
    çiftlerinden elde edilir; tüm sıralar farklı olunca durulur (en çok log n tur).
    LCP dizisi (Kasai): lcp[i] = sonek[sa[i−1]] ile sonek[sa[i]]'nin en uzun ortak öneki
    (lcp[0] = 0). Metinde bir konumdan sonrakine geçerken ortak önek en çok 1 azalır; bu yüzden
    toplam iş O(n) olur.
    Karşılaştırma Unicode kod noktası sırasıyladır (Python dizgi sırası).

Karmaşıklık: sonek dizisi O(n log² n) (her turda sıralama); LCP O(n); yer O(n)
Ne zaman: aynı metinde çok sayıda desen arama; en uzun tekrar eden alt dizgi; farklı alt dizgiler.
Ne zaman değil: tek desen tek metin için KMP (`kmp.py`) yeter; çok sayıda desen ve akış için
    Aho-Corasick (`aho_corasick.py`).
Bağımlılık: yok
Genişletme: farklı alt dizgi sayısı = n(n+1)/2 − Σ lcp; desen arama için
    `algoritma/dizgi/suffix_array_search.py`.

Örnek:
    >>> sa = suffix_array("banana")
    >>> sa, lcp_array("banana", sa)
    ([5, 3, 1, 0, 4, 2], [0, 1, 3, 0, 0, 2])
    >>> longest_repeated_substring("banana")
    'ana'
"""

from __future__ import annotations


def suffix_array(text: str) -> list[int]:
    """Soneklerin başlangıç konumları, soneklerin sözlük sırasıyla."""
    n = len(text)
    if n == 0:
        return []
    rank = [ord(char) for char in text]
    order = list(range(n))
    k = 1
    while True:
        key = [(rank[i], rank[i + k] if i + k < n else -1) for i in range(n)]
        order.sort(key=key.__getitem__)
        new_rank = [0] * n
        for j in range(1, n):
            new_rank[order[j]] = new_rank[order[j - 1]] + (key[order[j - 1]] != key[order[j]])
        rank = new_rank
        if rank[order[-1]] == n - 1:  # tüm sıralar farklı: sıralama kesinleşti
            return order
        k *= 2


def lcp_array(text: str, sa: list[int]) -> list[int]:
    """Kasai: lcp[i] = LCP(text[sa[i-1]:], text[sa[i]:]), lcp[0] = 0."""
    n = len(text)
    rank = [0] * n
    for position, start in enumerate(sa):
        rank[start] = position
    lcp = [0] * n
    h = 0
    for i in range(n):  # metin sırasıyla gez: h bir sonraki adımda en çok 1 azalır
        if rank[i] == 0:
            h = 0
            continue
        j = sa[rank[i] - 1]
        while i + h < n and j + h < n and text[i + h] == text[j + h]:
            h += 1
        lcp[rank[i]] = h
        if h:
            h -= 1
    return lcp


def longest_repeated_substring(text: str) -> str:
    """En az iki kez geçen en uzun alt dizgi (çakışabilir); birden çoksa sözlükte ilk olan."""
    sa = suffix_array(text)
    lcp = lcp_array(text, sa)
    best = max(range(len(lcp)), key=lcp.__getitem__, default=0)
    return text[sa[best] : sa[best] + lcp[best]] if lcp else ""
