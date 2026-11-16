"""Sudoku çözücü: geri izleme + kısıt yayılımı ("en az seçenekli kareyi önce doldur").

Fikir:
    Her satır, sütun ve 3×3 kutu için kullanılmış rakamlar 9 bitlik maskelerde tutulur; bir
    karenin adayları = 9 bitten bu üç maskenin birleşimini çıkarmak. Her adımda EN AZ adayı olan
    boş kare seçilir (MRV sezgiseli): adayı 0 olan kare varsa bu dal hemen ölür; 1 olan kare
    zorunlu hamledir. Böylece arama ağacı çok küçülür; zor bulmacalar bile milisaniyeler sürer.
    Rakam denenir, maskeler güncellenir, özyinelemeyle devam edilir; çıkmazda geri alınır.

Karmaşıklık: en kötü üstel (genel n²×n² sudoku NP-tamdır); 9×9'da pratikte milisaniyeler; yer O(81)
Ne zaman: sudoku ve benzeri kısıt bulmacaları (kakuro, zaman çizelgesi taslağı).
Ne zaman değil: büyük kısıt problemlerinde hazır CSP/SAT çözücüleri (OR-Tools, pysat) kullanın.
Bağımlılık: yok
Özyineleme: derinlik ≤ boş kare sayısı (≤ 81).
Genişletme: "tek çözüm mü?" sorusu için ikinci çözümü bulana dek aramayı sürdürün
    (`count_solutions` ile).

Örnek:
    >>> puzzle = [list(map(int, row)) for row in [
    ...     "530070000", "600195000", "098000060", "800060003", "400803001",
    ...     "700020006", "060000280", "000419005", "000080079"]]
    >>> solution = solve_sudoku(puzzle)
    >>> "".join(map(str, solution[0])) if solution else None, is_valid_solution(solution or [])
    ('534678912', True)
"""

from __future__ import annotations

from collections.abc import Sequence

_ALL = (1 << 9) - 1  # 1 … 9 rakamları: bit (r − 1)


def _box(r: int, c: int) -> int:
    return (r // 3) * 3 + c // 3


def _search(grid: list[list[int]], masks: list[list[int]], limit: int, found: list[int]) -> bool:
    """MRV'li geri izleme. masks = [satır, sütun, kutu]; found[0] = bulunan çözüm sayısı."""
    best: tuple[int, int, int] | None = None  # (aday sayısı, satır, sütun)
    for r in range(9):
        for c in range(9):
            if grid[r][c] == 0:
                options = _ALL & ~(masks[0][r] | masks[1][c] | masks[2][_box(r, c)])
                count = options.bit_count()
                if best is None or count < best[0]:
                    best = (count, r, c)
                    if count <= 1:
                        break
        if best is not None and best[0] <= 1:
            break
    if best is None:  # boş kare kalmadı: çözüm
        found[0] += 1
        return found[0] >= limit
    _, r, c = best
    options = _ALL & ~(masks[0][r] | masks[1][c] | masks[2][_box(r, c)])
    while options:
        bit = options & -options
        options ^= bit
        grid[r][c] = bit.bit_length()
        masks[0][r] |= bit
        masks[1][c] |= bit
        masks[2][_box(r, c)] |= bit
        if _search(grid, masks, limit, found):
            return True
        masks[0][r] ^= bit
        masks[1][c] ^= bit
        masks[2][_box(r, c)] ^= bit
    grid[r][c] = 0
    return False


def _prepare(puzzle: Sequence[Sequence[int]]) -> tuple[list[list[int]], list[list[int]]] | None:
    if len(puzzle) != 9 or any(len(row) != 9 for row in puzzle):
        raise ValueError("bulmaca 9×9 olmalı (boş kare: 0)")
    grid = [list(row) for row in puzzle]
    masks = [[0] * 9 for _ in range(3)]
    for r in range(9):
        for c in range(9):
            digit = grid[r][c]
            if not 0 <= digit <= 9:
                raise ValueError(f"geçersiz rakam {digit} ({r}, {c}) karesinde")
            if digit:
                bit = 1 << (digit - 1)
                if masks[0][r] & bit or masks[1][c] & bit or masks[2][_box(r, c)] & bit:
                    return None  # ipuçları kendi içinde çelişkili
                masks[0][r] |= bit
                masks[1][c] |= bit
                masks[2][_box(r, c)] |= bit
    return grid, masks


def solve_sudoku(puzzle: Sequence[Sequence[int]]) -> list[list[int]] | None:
    """Bir çözüm (yeni ızgara) ya da çözüm yoksa None. Girdi değişmez."""
    prepared = _prepare(puzzle)
    if prepared is None:
        return None
    grid, masks = prepared
    return grid if _search(grid, masks, 1, [0]) else None


def count_solutions(puzzle: Sequence[Sequence[int]], limit: int = 2) -> int:
    """Çözüm sayısı (en çok `limit`); "tek çözümlü mü?" için limit=2 yeter."""
    prepared = _prepare(puzzle)
    if prepared is None:
        return 0
    grid, masks = prepared
    found = [0]
    _search(grid, masks, limit, found)
    return found[0]


def is_valid_solution(grid: Sequence[Sequence[int]]) -> bool:
    """Tam doldurulmuş ve kurallara uyan bir ızgara mı?"""
    if len(grid) != 9 or any(len(row) != 9 for row in grid):
        return False
    digits = set(range(1, 10))
    rows = all(set(row) == digits for row in grid)
    cols = all({grid[r][c] for r in range(9)} == digits for c in range(9))
    boxes = all(
        {grid[r][c] for r in range(br, br + 3) for c in range(bc, bc + 3)} == digits
        for br in range(0, 9, 3)
        for bc in range(0, 9, 3)
    )
    return rows and cols and boxes
