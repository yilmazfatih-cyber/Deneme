"""LU ayrışımı (kısmi pivotlu): P·A = L·U; bir kez ayrıştır, birçok sağ taraf için hızlı çöz.

Fikir:
    Gauss eliminasyonunun adımları kaydedilir: U üst üçgen sonuç, L ise her satırdan çıkarılan
    katsayılar (köşegeni 1 olan alt üçgen). A·x = b artık iki üçgen sistemdir: L·y = P·b (ileri
    yerine koyma) ve U·x = y (geri yerine koyma), her biri O(n²). Ayrışım O(n³) bir kez yapılır.
    Kısmi pivotlama: her sütunda mutlak değerce EN BÜYÜK öğe pivot seçilir (satırlar değiş-
    tirilir, P kaydı tutulur). Küçük pivota bölmek kayan nokta hatalarını büyütür; pivotlama
    bunu sınırlar. Yine de kötü koşullu (neredeyse tekil) matrislerde sonuç güvenilmez;
    `tolerance` altındaki pivotta "tekil" hatası verilir.
    Kesin sonuç gerekiyorsa `gaussian_elimination.py` (kesirlerle) kullanın.

Karmaşıklık: ayrışım O(n³); her çözüm O(n²); determinant O(n) (ayrışımdan sonra); yer O(n²)
Ne zaman: aynı katsayı matrisiyle çok sayıda sağ taraf (devre çözümü, sonlu farklar, regresyon).
Ne zaman değil: büyük/seyrek sistemlerde numpy/scipy ya da yinelemeli yöntemler; kesinlik
    gerektiğinde kesirli Gauss.
Bağımlılık: yok
Genişletme: ters matris = her birim vektör için `lu_solve`; simetrik pozitif tanımlı
    matrislerde Cholesky (yarı iş) kullanın.

Örnek:
    >>> lu = lu_decompose([[2.0, 1.0], [4.0, 3.0]])
    >>> lu.permutation, lu.solve([3.0, 7.0]), lu.determinant()
    ([1, 0], [1.0, 1.0], 2.0)
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class LUResult:
    """P·A = L·U. `permutation[i]`: U'nun i. satırının A'daki özgün satırı."""

    lower: list[list[float]]
    upper: list[list[float]]
    permutation: list[int]
    swaps: int

    def solve(self, b: Sequence[float]) -> list[float]:
        """A·x = b'yi çözer (ileri + geri yerine koyma)."""
        n = len(self.upper)
        if len(b) != n:
            raise ValueError(f"sağ taraf {n} uzunlukta olmalı")
        y = [0.0] * n
        for i in range(n):  # L·y = P·b (L'nin köşegeni 1)
            y[i] = b[self.permutation[i]] - sum(self.lower[i][k] * y[k] for k in range(i))
        x = [0.0] * n
        for i in range(n - 1, -1, -1):  # U·x = y
            total = sum(self.upper[i][k] * x[k] for k in range(i + 1, n))
            x[i] = (y[i] - total) / self.upper[i][i]
        return x

    def determinant(self) -> float:
        """det(A) = (−1)^değişim · Π U[i][i]."""
        det = -1.0 if self.swaps % 2 else 1.0
        for i in range(len(self.upper)):
            det *= self.upper[i][i]
        return det


def lu_decompose(a: Sequence[Sequence[float]], tolerance: float = 1e-12) -> LUResult:
    """Kısmi pivotlu LU ayrışımı; pivot `tolerance` altındaysa ValueError (tekil matris)."""
    n = len(a)
    if any(len(row) != n for row in a):
        raise ValueError("LU ayrışımı kare matris ister")
    upper = [[float(x) for x in row] for row in a]
    lower = [[0.0] * n for _ in range(n)]
    permutation = list(range(n))
    swaps = 0
    for c in range(n):
        pivot = max(range(c, n), key=lambda i: abs(upper[i][c]))
        if abs(upper[pivot][c]) <= tolerance:
            raise ValueError(
                "matris tekil (ya da çok kötü koşullu): kesin çözüm için Gauss kullanın"
            )
        if pivot != c:
            upper[c], upper[pivot] = upper[pivot], upper[c]
            lower[c], lower[pivot] = lower[pivot], lower[c]
            permutation[c], permutation[pivot] = permutation[pivot], permutation[c]
            swaps += 1
        for i in range(c + 1, n):
            factor = upper[i][c] / upper[c][c]
            lower[i][c] = factor
            upper[i] = [x - factor * y for x, y in zip(upper[i], upper[c])]
            upper[i][c] = 0.0  # tam sıfır (yuvarlama kalıntısı kalmasın)
    for i in range(n):
        lower[i][i] = 1.0
    return LUResult(lower, upper, permutation, swaps)
