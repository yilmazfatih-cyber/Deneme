"""En uzun ortak alt dizgi (bitişik parça): iki metnin ortak en uzun kesintisiz parçası.

Fikir:
    L[i][j] = a[:i] ile b[:j]'nin SONUNDA biten en uzun ortak parçanın uzunluğu:
        a[i−1] == b[j−1] ise L[i][j] = L[i−1][j−1] + 1, değilse 0.
    Tablonun en büyük değeri yanıtın uzunluğu, konumu da parçanın yeridir. Her satır yalnız
    öncekine bağlı olduğundan iki satır yeter: bellek O(m) (m = len(b); kısa metni b yapın).
    Not: "alt dizi" (subsequence, harfler bitişik olmak zorunda değil) farklı bir sorudur;
    o `algoritma/dp/lcs.py`'dedir.

Karmaşıklık: zaman O(n · m); yer O(m)
Ne zaman: iki metindeki ortak alıntıyı bulmak, dosya benzerliği, ortak önek/sonek dışı ortaklık.
Ne zaman değil: çok uzun metinlerde (≫ 10⁴) sonek dizisi/otomatı ile O(n + m) çözümler gerekir.
Bağımlılık: yok
Genişletme: k metnin ortak parçası için sonek dizisi + LCP üstünde kayan pencere kullanın
    (`algoritma/veri_yapilari/suffix_array.py`).

Örnek:
    >>> longest_common_substring("güneşli bir gün", "bir gün daha")
    'bir gün'
    >>> longest_common_substring("abc", "xyz")
    ''
"""

from __future__ import annotations


def longest_common_substring(a: str, b: str) -> str:
    """En uzun ortak parça; birden çoksa a'da en solda biteni."""
    best_length, best_end_a = 0, 0
    previous = [0] * (len(b) + 1)
    for i in range(1, len(a) + 1):
        current = [0] * (len(b) + 1)
        for j in range(1, len(b) + 1):
            if a[i - 1] == b[j - 1]:
                current[j] = previous[j - 1] + 1
                if current[j] > best_length:
                    best_length, best_end_a = current[j], i
        previous = current
    return a[best_end_a - best_length : best_end_a]
