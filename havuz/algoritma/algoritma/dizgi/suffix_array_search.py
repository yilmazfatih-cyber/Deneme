"""Sonek dizisiyle desen arama: bir metni bir kez dizinle, sonra her deseni O(m log n)'de bul.

Fikir:
    Metnin tüm sonekleri sözlük sırasıyla dizilmiştir (sonek dizisi). Bir desenle başlayan
    sonekler bu dizide ARDIŞIK bir blok oluşturur. Bloğun başı ve sonu ikili aramayla bulunur:
    her adımda desen, ortadaki sonekin ilk m harfiyle karşılaştırılır (O(m)). Bloktaki
    soneklerin başlangıç konumları desenin metindeki geçişleridir.
    Dizin bir kez kurulur (O(n log² n)); sonra binlerce desen ucuza sorgulanır — kitap,
    kod tabanı, DNA dizisi gibi DEĞİŞMEYEN büyük metinlerde arama motoru mantığı.

Karmaşıklık: kurulum O(n log² n); sorgu O(m log n + geçiş sayısı); yer O(n)
Ne zaman: aynı (değişmeyen) metinde çok sayıda farklı desen sorgusu; "kaç kez geçiyor" sayımı.
Ne zaman değil: metin sık değişiyorsa dizin her seferinde yeniden kurulur; tek sorgu için
    `kmp.py` ya da `str.find` yeter.
Bağımlılık: algoritma.veri_yapilari.suffix_array (sonek dizisi kurulumu)
Genişletme: en uzun tekrar eden parça, farklı alt dizgi sayısı gibi sorular için LCP dizisini
    de dizinde tutun (`lcp_array`).

Örnek:
    >>> index = SuffixArrayIndex("ali ata bak, ali topu at")
    >>> index.find_all("ali"), index.count("at"), index.find_all("kedi")
    ([0, 13], 2, [])
"""

from __future__ import annotations

from algoritma.veri_yapilari.suffix_array import suffix_array


class SuffixArrayIndex:
    """Değişmeyen bir metin için sonek dizisi tabanlı arama dizini."""

    def __init__(self, text: str) -> None:
        self._text = text
        self._sa = suffix_array(text)

    def _bounds(self, pattern: str) -> tuple[int, int]:
        """Desenle başlayan soneklerin sonek dizisindeki [lo, hi) bloğu."""
        m = len(pattern)
        text, sa = self._text, self._sa
        lo, hi = 0, len(sa)
        while lo < hi:  # ilk "önek ≥ desen"
            mid = (lo + hi) // 2
            if text[sa[mid] : sa[mid] + m] < pattern:
                lo = mid + 1
            else:
                hi = mid
        start, hi = lo, len(sa)
        while lo < hi:  # ilk "önek > desen"
            mid = (lo + hi) // 2
            if text[sa[mid] : sa[mid] + m] <= pattern:
                lo = mid + 1
            else:
                hi = mid
        return start, lo

    def find_all(self, pattern: str) -> list[int]:
        """Desenin tüm geçişlerinin başlangıç konumları (artan). Boş desen: her konum."""
        if not pattern:
            return list(range(len(self._text) + 1))
        lo, hi = self._bounds(pattern)
        return sorted(self._sa[lo:hi])

    def count(self, pattern: str) -> int:
        """Desenin kaç kez geçtiği (çakışanlar dahil)."""
        if not pattern:
            return len(self._text) + 1
        lo, hi = self._bounds(pattern)
        return hi - lo
