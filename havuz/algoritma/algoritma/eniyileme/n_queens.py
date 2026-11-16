"""N vezir (geri izleme): n×n tahtaya birbirini tehdit etmeyen n vezir yerleştirmenin tüm yolları.

Fikir:
    Her satıra bir vezir konur; satır satır ilerlenir. Bir sütun ya da çapraz doluysa o kare
    denenmez (budama). Sütunlar, "/" çaprazları (satır + sütun) ve "\\" çaprazları
    (satır − sütun + n − 1) birer bit maskesinde tutulur: "boş kareler" tek bir bit işlemiyle
    bulunur ve en düşük 1 bit `x & -x` ile tek tek seçilir. Çıkmaza girilince bir önceki
    satıra dönülür (geri izleme). Bu, kaba kuvvetin nⁿ olasılığını binlerce kat budar.

Karmaşıklık: en kötü O(n!) (budama ile pratikte çok daha az); yer O(n)
Ne zaman: kısıt sağlama problemlerinin (CSP) öğretici örneği; geri izleme iskeletinin şablonu.
Ne zaman değil: TEK bir çözüm yeterse ve n büyükse (≫ 30) min-çakışma yerel araması
    (`hill_climbing.py` fikri) çok daha hızlıdır.
Bağımlılık: yok
Özyineleme: derinlik n (satır sayısı); n ≤ ~20 için sorun yok (çözüm sayısı zaten patlar).
Genişletme: simetrileri (döndürme/yansıma) eleyerek "temel çözümleri" saymak için ilk satırı
    yalnız sol yarıda deneyip sonucu ikiyle çarpın.

Örnek:
    >>> count_n_queens(8), n_queens_solutions(4)
    (92, [[1, 3, 0, 2], [2, 0, 3, 1]])
"""

from __future__ import annotations


def n_queens_solutions(n: int, limit: int | None = None) -> list[list[int]]:
    """Çözümler: her çözüm, satır satır vezirin sütun dizinleri. `limit` çözüm bulununca durur."""
    if n < 0:
        raise ValueError("n negatif olamaz")
    full = (1 << n) - 1
    solutions: list[list[int]] = []
    placement: list[int] = []

    def place(columns: int, diagonals: int, anti_diagonals: int) -> bool:
        """True dönerse arama durur (limit doldu)."""
        if len(placement) == n:
            solutions.append(list(placement))
            return limit is not None and len(solutions) >= limit
        free = full & ~(columns | diagonals | anti_diagonals)
        while free:
            bit = free & -free  # en sağdaki boş sütun
            free ^= bit
            placement.append(bit.bit_length() - 1)
            if place(columns | bit, (diagonals | bit) << 1 & full, (anti_diagonals | bit) >> 1):
                return True
            placement.pop()  # geri izle
        return False

    place(0, 0, 0)
    return solutions


def count_n_queens(n: int) -> int:
    """Çözüm sayısı (listeyi tutmadan)."""
    if n < 0:
        raise ValueError("n negatif olamaz")
    full = (1 << n) - 1

    def count(columns: int, diagonals: int, anti_diagonals: int) -> int:
        if columns == full:
            return 1
        total = 0
        free = full & ~(columns | diagonals | anti_diagonals)
        while free:
            bit = free & -free
            free ^= bit
            total += count(
                columns | bit, (diagonals | bit) << 1 & full, (anti_diagonals | bit) >> 1
            )
        return total

    return count(0, 0, 0)
