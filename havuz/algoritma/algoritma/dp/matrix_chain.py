"""Matris zinciri çarpımı: en az skaler çarpım gerektiren parantezlemeyi bulur ve yazar.

Fikir:
    A1 (p0×p1), A2 (p1×p2), …, An çarpımının sonucu parantezlemeden bağımsızdır ama maliyeti
    değildir: (A·B)·C ile A·(B·C) arasında yüzlerce kat fark olabilir. cost[i][j] = Ai…Aj'yi
    çarpmanın en az maliyeti; son çarpımın nerede yapılacağı (k) denenir:
        cost[i][j] = min_k cost[i][k] + cost[k+1][j] + p(i−1) · p(k) · p(j).
    Aralıklar kısa olandan uzuna doğru doldurulur (aralık DP'si). Her aralık için seçilen k
    saklanır ve parantezleme bundan kurulur.

Karmaşıklık: zaman O(n³); yer O(n²)
Ne zaman: zincirleme matris/tensör çarpımı sırası, birleşmeli işlemlerde en ucuz gruplama.
Ne zaman değil: numpy'da `numpy.linalg.multi_dot` aynı işi yapar.
Bağımlılık: yok
Özyineleme: yalnız parantez yazımı özyinelemelidir; derinlik ≤ n (O(n³) zaten n'i sınırlar).
Genişletme: aynı kalıp "en ucuz üçgenleme", "en iyi ikili arama ağacı" gibi aralık DP'lerine uyar.

Örnek:
    >>> matrix_chain_order([10, 30, 5, 60])
    (4500, '((A1A2)A3)')
    >>> matrix_chain_order([40, 20, 30, 10, 30])
    (26000, '((A1(A2A3))A4)')
"""

from __future__ import annotations

from collections.abc import Sequence


def matrix_chain_order(dims: Sequence[int]) -> tuple[int, str]:
    """dims = [p0, p1, …, pn] (Ai, p(i−1) × p(i) boyutlu). (en az maliyet, parantezleme)."""
    n = len(dims) - 1
    if n < 1:
        raise ValueError("en az bir matris gerekir: dims en az iki sayı içermeli")
    cost = [[0] * (n + 1) for _ in range(n + 1)]
    split = [[0] * (n + 1) for _ in range(n + 1)]
    for length in range(2, n + 1):
        for i in range(1, n - length + 2):
            j = i + length - 1
            best = None
            for k in range(i, j):
                candidate = cost[i][k] + cost[k + 1][j] + dims[i - 1] * dims[k] * dims[j]
                if best is None or candidate < best:
                    best, split[i][j] = candidate, k
            cost[i][j] = best if best is not None else 0

    def render(i: int, j: int) -> str:
        if i == j:
            return f"A{i}"
        k = split[i][j]
        return f"({render(i, k)}{render(k + 1, j)})"

    return cost[1][n], render(1, n)
