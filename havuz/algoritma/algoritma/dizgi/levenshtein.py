"""Levenshtein ve Damerau-Levenshtein uzaklıkları: az bellekli sürümler (yazım denetimi için).

Fikir:
    Levenshtein: ekle/sil/değiştir işlemleriyle a'yı b'ye çevirmenin en az adım sayısı. DP
    tablosunun her satırı yalnız bir öncekine bağlı olduğundan iki satır yeter: bellek
    O(min(n, m)). (İşlemlerin kendisi gerekiyorsa `algoritma/dp/edit_distance.py`.)
    Damerau ekler: bitişik iki harfin yer değiştirmesi ("kitpa" → "kitap") TEK işlemdir.
      * Kısıtlı sürüm (OSA, "en iyi hizalama"): bir parça yalnız bir kez düzenlenebilir.
        Hızlı ve yaygın ama üçgen eşitsizliğini bozar: OSA("ca", "abc") = 3 iken gerçek 2'dir.
      * Kısıtsız sürüm (gerçek Damerau-Levenshtein): her harfin en son görüldüğü satır
        tutularak (Lowrance-Wagner) yer değiştirmenin arasına ekleme/silme de girebilir; metriktir.
    Türkçe notu: karşılaştırma kod noktasıyladır; "ı" ile "i" farklı harftir. Harf duyarsız
    karşılaştırma için önce `casefold_tr` uygulayın.

Karmaşıklık: Levenshtein O(n · m) zaman, O(min(n, m)) yer; OSA O(n · m) zaman, O(m) yer;
    gerçek Damerau O(n · m) zaman, O(n · m) yer
Ne zaman: yazım düzeltme önerisi, bulanık arama, yinelenen kayıt bulma.
Ne zaman değil: çok sayıda kelimeyi tek tek karşılaştırmak yavaşsa BK-ağacı ya da n-gram dizini.
Bağımlılık: yok
Genişletme: sözlükte en yakın k öneri için her kelimeye uzaklık hesaplayıp `heapq.nsmallest`.

Örnek:
    >>> levenshtein("kitap", "kitpa"), damerau_levenshtein_osa("kitap", "kitpa")
    (2, 1)
    >>> damerau_levenshtein_osa("ca", "abc"), damerau_levenshtein("ca", "abc")
    (3, 2)
"""

from __future__ import annotations


def levenshtein(a: str, b: str) -> int:
    """Ekle/sil/değiştir uzaklığı, iki satırlık bellekle."""
    if len(a) < len(b):
        a, b = b, a  # b kısa olan: satırlar onun uzunluğunda
    previous = list(range(len(b) + 1))
    for i, char_a in enumerate(a, start=1):
        current = [i] + [0] * len(b)
        for j, char_b in enumerate(b, start=1):
            current[j] = min(
                previous[j] + 1,  # sil
                current[j - 1] + 1,  # ekle
                previous[j - 1] + (char_a != char_b),  # değiştir (ya da dokunma)
            )
        previous = current
    return previous[-1]


def damerau_levenshtein_osa(a: str, b: str) -> int:
    """Kısıtlı Damerau (OSA): bitişik yer değiştirme 1 işlem; her parça bir kez düzenlenir."""
    before: list[int] = []  # iki önceki satır
    previous = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        current = [i] + [0] * len(b)
        for j in range(1, len(b) + 1):
            cost = a[i - 1] != b[j - 1]
            current[j] = min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                current[j] = min(current[j], before[j - 2] + 1)
        before, previous = previous, current
    return previous[-1]


def damerau_levenshtein(a: str, b: str) -> int:
    """Gerçek (kısıtsız) Damerau-Levenshtein uzaklığı; bir metriktir."""
    n, m = len(a), len(b)
    big = n + m  # hiçbir uzaklık bunu aşmaz: tablo kenarlarında "sonsuz" yerine
    last_row: dict[str, int] = {}  # harf → a'da en son görüldüğü satır
    table = [[big] * (m + 2) for _ in range(n + 2)]
    for i in range(n + 1):
        table[i + 1][1] = i
    for j in range(m + 1):
        table[1][j + 1] = j
    for i in range(1, n + 1):
        last_match_col = 0
        for j in range(1, m + 1):
            k = last_row.get(b[j - 1], 0)
            ell = last_match_col
            cost = 1
            if a[i - 1] == b[j - 1]:
                cost = 0
                last_match_col = j
            table[i + 1][j + 1] = min(
                table[i][j] + cost,  # değiştir / dokunma
                table[i + 1][j] + 1,  # ekle
                table[i][j + 1] + 1,  # sil
                table[k][ell] + (i - k - 1) + 1 + (j - ell - 1),  # yer değiştir (+ aradakiler)
            )
        last_row[a[i - 1]] = i
    return table[n + 1][m + 1]
