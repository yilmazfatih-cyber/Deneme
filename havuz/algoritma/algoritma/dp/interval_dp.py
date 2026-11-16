"""Aralık DP'si: komşu yığınları birleştirme maliyeti ve en uzun palindrom alt dizi (geri izlemeli).

Fikir:
    Durum bir aralıktır: f[i][j] = yalnız i … j parçası için yanıt; kısa aralıklar önce çözülür
    ve her aralık "son adımın" yeri denenerek iki kısa aralıktan kurulur.
      Yığın birleştirme: yalnız KOMŞU iki yığın birleşir, maliyet toplamlarıdır:
          cost[i][j] = min_k cost[i][k] + cost[k+1][j] + toplam(i … j).
      En uzun palindrom alt dizi: s[i] == s[j] ise ikisi de alınır (+2), değilse bir uç atılır.
    Seçilen bölünme/karar saklanır; yanıtın kendisi (birleştirme ağacı, palindromun harfleri)
    geri izlenir.

Karmaşıklık: birleştirme O(n³) zaman, O(n²) yer; palindrom O(n²) zaman ve yer
Ne zaman: "bitişik parçaları birleştir/böl" türü problemler: dosya birleştirme, ifade
    parantezleme, palindrom bölme, balon patlatma, çokgen üçgenleme.
Ne zaman değil: birleşen parçalar bitişik olmak zorunda değilse açgözlü Huffman
    (`algoritma/kodlama/huffman.py`) en iyidir.
Bağımlılık: yok
Özyineleme: yalnız birleştirme ağacının yazımı özyinelemelidir; derinlik ≤ n.
Genişletme: Knuth iyileştirmesi (bölünme noktası tekdüzedir) birleştirmeyi O(n²)'ye indirir.

Örnek:
    >>> min_merge_cost([4, 1, 3, 2])
    (20, '(4 ((1 3) 2))')
    >>> longest_palindromic_subsequence("karakter")
    'karak'
"""

from __future__ import annotations

from collections.abc import Sequence


def min_merge_cost(piles: Sequence[int]) -> tuple[int, str]:
    """(en az toplam birleştirme maliyeti, birleştirme sırası parantezli olarak)."""
    n = len(piles)
    if n == 0:
        return 0, ""
    prefix = [0]
    for size in piles:
        prefix.append(prefix[-1] + size)
    cost = [[0] * n for _ in range(n)]
    split = [[0] * n for _ in range(n)]
    for length in range(2, n + 1):
        for i in range(n - length + 1):
            j = i + length - 1
            best, best_k = None, i
            for k in range(i, j):
                candidate = cost[i][k] + cost[k + 1][j]
                if best is None or candidate < best:
                    best, best_k = candidate, k
            cost[i][j] = (best or 0) + prefix[j + 1] - prefix[i]
            split[i][j] = best_k

    def render(i: int, j: int) -> str:
        if i == j:
            return str(piles[i])
        k = split[i][j]
        return f"({render(i, k)} {render(k + 1, j)})"

    return cost[0][n - 1], render(0, n - 1)


def longest_palindromic_subsequence(text: str) -> str:
    """En uzun palindrom alt dizinin kendisi (birden çoksa biri)."""
    n = len(text)
    if n == 0:
        return ""
    best = [[0] * n for _ in range(n)]
    for i in range(n - 1, -1, -1):
        best[i][i] = 1
        for j in range(i + 1, n):
            if text[i] == text[j]:
                best[i][j] = best[i + 1][j - 1] + 2
            else:
                best[i][j] = max(best[i + 1][j], best[i][j - 1])
    left: list[str] = []
    middle = ""
    i, j = 0, n - 1
    while i <= j:
        if i == j:
            middle = text[i]
            break
        if text[i] == text[j]:
            left.append(text[i])
            i, j = i + 1, j - 1
        elif best[i + 1][j] >= best[i][j - 1]:
            i += 1
        else:
            j -= 1
    return "".join(left) + middle + "".join(reversed(left))
