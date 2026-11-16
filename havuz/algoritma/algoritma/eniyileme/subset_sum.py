"""Alt küme toplamı (geri izleme + budama): toplamı tam olarak hedefe eşit alt kümeleri bulur.

Fikir:
    Sayılar büyükten küçüğe sıralanır ve her sayı için iki dal açılır: al ya da alma.
    İki budama kuralı ağacı küçültür (sayılar negatif olmadığında geçerli):
      * kalan hedef < 0 → bu dal ölü (daha fazla almak yalnız büyütür),
      * kalan hedef > geriye kalan sayıların toplamı → hepsini alsak bile yetmez.
    Aynı değerdeki sayılar yan yana durduğu için "aynı değeri bu konumda ikinci kez atlayarak
    başlatma" kuralıyla yinelenen alt kümeler (değer olarak) tekrar üretilmez.
    Dizinler özgün sıradadır; çözüm, özgün listedeki konumlarla verilir.
    Ondalık sayılarda "kalan == 0" denetimi yuvarlama yüzünden kaçabilir (0.1 + 0.2 ≠ 0.3):
    tutarları kuruş gibi TAM SAYILARA çevirerek verin.

Karmaşıklık: en kötü O(2ⁿ) (NP-tam); budamayla pratikte çok daha az; yer O(n)
Ne zaman: küçük n (≲ 40) ve büyük/ondalıklı değerler; TÜM çözümler gerekiyorsa.
Ne zaman değil: değerler küçük tam sayılarsa DP O(n · hedef) (`algoritma/dp/knapsack.py` fikri);
    n ≈ 40 için "ortada buluşma" (iki yarının toplamları) O(2^(n/2)) daha hızlıdır.
Bağımlılık: yok
Özyineleme: derinlik ≤ n.
Genişletme: negatif sayılar için budamayı kaldırın (yalnız tam arama kalır) ya da tüm sayılara
    sabit ekleyip hedefi ona göre kaydırın (alt küme boyunu sabitlemek gerekir).

Örnek:
    >>> find_subset_with_sum([8, 6, 7, 5, 3, 10, 9], 15)  # 5 + 10
    [3, 5]
    >>> all_subsets_with_sum([3, 1, 2, 3], 6)  # {3, 1, 2} değer olarak bir kez sayılır
    [[0, 1, 2], [0, 3]]
"""

from __future__ import annotations

from collections.abc import Sequence


def _search(numbers: Sequence[float], target: float, first_only: bool) -> list[list[int]]:
    if any(x < 0 for x in numbers):
        raise ValueError("bu budama yalnız negatif olmayan sayılarla doğrudur")
    order = sorted(range(len(numbers)), key=lambda i: -numbers[i])
    values = [numbers[i] for i in order]
    suffix = [0.0] * (len(values) + 1)  # suffix[i] = values[i:] toplamı
    for i in range(len(values) - 1, -1, -1):
        suffix[i] = suffix[i + 1] + values[i]
    results: list[list[int]] = []
    chosen: list[int] = []

    def go(start: int, remaining: float) -> bool:
        if remaining == 0:
            results.append(sorted(order[i] for i in chosen))
            if first_only:
                return True  # devam edilirse yalnız 0 değerli öğeler eklenebilir
        if remaining > suffix[start]:
            return False  # kalanların hepsi bile yetmez
        for i in range(start, len(values)):
            if i > start and values[i] == values[i - 1]:
                continue  # aynı değerle aynı noktadan ikinci kez başlama (yinelenen çözüm)
            if values[i] > remaining:
                continue
            chosen.append(i)
            if go(i + 1, remaining - values[i]):
                return True
            chosen.pop()
        return False

    go(0, target)
    return results


def find_subset_with_sum(numbers: Sequence[float], target: float) -> list[int] | None:
    """Toplamı hedefe eşit bir alt kümenin dizinleri (artan) ya da None."""
    found = _search(numbers, target, first_only=True)
    return found[0] if found else None


def all_subsets_with_sum(numbers: Sequence[float], target: float) -> list[list[int]]:
    """Toplamı hedefe eşit, DEĞER olarak farklı tüm alt kümeler (dizin listeleri, sıralı)."""
    return sorted(_search(numbers, target, first_only=False))
