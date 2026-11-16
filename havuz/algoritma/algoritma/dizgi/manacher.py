"""Manacher: bir dizgideki tüm palindrom parçaları O(n)'de bulur; en uzununu ve sayısını verir.

Fikir:
    Tek ve çift uzunluklu palindromları ayrı ayrı düşünmemek için harflerin arasına ve iki uca
    ayraç konmuş gibi çalışılır: "aba" → "#a#b#a#". p[i] = i merkezli en uzun palindromun
    yarıçapı. Şimdiye kadar en sağa uzanan palindrom [c − p[c], c + p[c]] içindeyken i'nin
    aynası j = 2c − i'dir ve p[i] en az min(p[j], sağ sınır − i) olur; oradan karakter karakter
    genişletilir. Sağ sınır yalnız ileri gittiği için toplam iş O(n).
    Dönüştürülmüş dizide p[i], özgün dizideki palindromun UZUNLUĞUNA eşittir.

Karmaşıklık: zaman O(n); yer O(n)
Ne zaman: en uzun palindrom parça, tüm palindrom parçaları sayma, palindrom bölme ön hesabı.
Ne zaman değil: palindrom ALT DİZİ (ardışık olmak zorunda değil) için
    `algoritma/dp/interval_dp.py`.
Bağımlılık: yok
Genişletme: her konumda biten en uzun palindrom gerekiyorsa radii'den bir geçişte çıkarılır.

Örnek:
    >>> longest_palindromic_substring("ababa ve kayak")
    'ababa'
    >>> count_palindromic_substrings("aaa"), palindrome_radii("aba")
    (6, [0, 1, 0, 3, 0, 1, 0])
"""

from __future__ import annotations


def palindrome_radii(text: str) -> list[int]:
    """Ayraçlı dizide (uzunluk 2n+1) her merkezin yarıçapı = özgün palindromun uzunluğu."""
    n = 2 * len(text) + 1

    def at(i: int) -> str | None:  # ayraç konumları (çift i) için None
        return text[i // 2] if i % 2 else None

    radius = [0] * n
    center = right = 0  # en sağa uzanan palindrom: merkez ve sağ sınır (dahil)
    for i in range(n):
        if i < right:
            radius[i] = min(radius[2 * center - i], right - i)
        while (
            i - radius[i] - 1 >= 0
            and i + radius[i] + 1 < n
            and at(i - radius[i] - 1) == at(i + radius[i] + 1)
        ):
            radius[i] += 1
        if i + radius[i] > right:
            center, right = i, i + radius[i]
    return radius


def longest_palindromic_substring(text: str) -> str:
    """En uzun palindrom parça (birden çoksa en soldaki)."""
    radius = palindrome_radii(text)
    best = max(range(len(radius)), key=radius.__getitem__)  # eşitlikte ilki: en soldaki
    start = (best - radius[best]) // 2
    return text[start : start + radius[best]]


def count_palindromic_substrings(text: str) -> int:
    """Palindrom olan (konumu farklı) parça sayısı: her merkez, yarıçapının yarısı kadar katkı."""
    return sum((r + 1) // 2 for r in palindrome_radii(text))
