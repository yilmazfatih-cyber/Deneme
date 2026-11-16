"""Para üstü: bir tutarı en az sayıda madenî parayla oluşturmak (hangi paralar?) ve kaç yolla.

Fikir:
    En az para: best[t] = t tutarı için en az para sayısı; best[t] = 1 + min(best[t − c]).
    Her t için son eklenen para saklanır; t'den geri yürünerek paraların kendisi bulunur.
    Açgözlü yöntem (hep en büyük parayı al) yalnız "kanonik" para sistemlerinde doğrudur:
    {1, 5, 10, 25}'te çalışır ama {1, 3, 4} ile 6 için açgözlü 4+1+1 (3 para) verir, doğrusu
    3+3 (2 para). DP her sistemde doğrudur.
    Yol sayısı (sıra önemsiz): ways[t] += ways[t − c], dış döngü paralar üzerinde olduğu için
    her kombinasyon bir kez sayılır (dış döngü tutar olsaydı sıralı diziler sayılırdı).

Karmaşıklık: zaman O(k · T) (k para türü, T tutar); yer O(T)
Ne zaman: kasada para üstü, ödeme parçalama, "bu tutar şu birimlerle oluşur mu" soruları.
Ne zaman değil: tutar çok büyük ve para sistemi kanonikse açgözlü yeter (O(k)).
Bağımlılık: yok
Genişletme: her paradan sınırlı adet varsa `knapsack.py` içindeki ikili bölme fikrini kullanın.

Örnek:
    >>> min_coins([1, 3, 4], 6), count_ways([1, 2, 5], 5)
    ([3, 3], 4)
    >>> min_coins([5, 10], 3) is None
    True
"""

from __future__ import annotations

from collections.abc import Sequence


def min_coins(coins: Sequence[int], amount: int) -> list[int] | None:
    """Tutarı oluşturan en az sayıdaki paralar (büyükten küçüğe); mümkün değilse None."""
    if amount < 0 or any(c <= 0 for c in coins):
        raise ValueError("tutar negatif olamaz, paralar pozitif olmalı")
    inf = amount + 1
    best = [0] + [inf] * amount
    last = [0] * (amount + 1)
    for t in range(1, amount + 1):
        for c in coins:
            if c <= t and best[t - c] + 1 < best[t]:
                best[t] = best[t - c] + 1
                last[t] = c
    if best[amount] == inf:
        return None
    used = []
    t = amount
    while t:
        used.append(last[t])
        t -= last[t]
    return sorted(used, reverse=True)


def count_ways(coins: Sequence[int], amount: int) -> int:
    """Tutarın kaç farklı para kombinasyonuyla (sıra önemsiz) oluşturulabileceği."""
    if amount < 0 or any(c <= 0 for c in coins):
        raise ValueError("tutar negatif olamaz, paralar pozitif olmalı")
    ways = [1] + [0] * amount
    for c in sorted(set(coins)):
        for t in range(c, amount + 1):
            ways[t] += ways[t - c]
    return ways[amount]
