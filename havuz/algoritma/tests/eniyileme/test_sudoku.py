from __future__ import annotations

import random

import pytest

from algoritma.eniyileme.sudoku import count_solutions, is_valid_solution, solve_sudoku


def _parse(rows: list[str]) -> list[list[int]]:
    return [[int(c) for c in row] for row in rows]


EASY = _parse([
    "530070000", "600195000", "098000060", "800060003", "400803001",
    "700020006", "060000280", "000419005", "000080079",
])  # fmt: skip
HARD = _parse([  # "dünyanın en zor sudokusu" olarak bilinen bulmaca (Arto Inkala, 2012)
    "800000000", "003600000", "070090200", "050007000", "000045700",
    "000100030", "001000068", "008500010", "090000400",
])  # fmt: skip


def test_hand_checked_examples() -> None:
    for puzzle in (EASY, HARD):
        solution = solve_sudoku(puzzle)
        assert solution is not None and is_valid_solution(solution)
        assert all(puzzle[r][c] in (0, solution[r][c]) for r in range(9) for c in range(9))
    assert count_solutions(HARD) == 1  # tek çözümlü


def test_edge_cases() -> None:
    empty = [[0] * 9 for _ in range(9)]
    solved = solve_sudoku(empty)
    assert solved is not None and is_valid_solution(solved)
    assert count_solutions(empty, limit=5) == 5
    contradiction = [row[:] for row in EASY]
    contradiction[0][2] = 5  # aynı satırda iki 5
    assert solve_sudoku(contradiction) is None and count_solutions(contradiction) == 0
    # ipuçları çelişkisiz ama çözümsüz: (0, 8) karesine yalnız 9 kalır, 9 ise o sütunda var
    unsolvable = _parse(["123456780", "000000009"] + ["000000000"] * 7)
    assert solve_sudoku(unsolvable) is None and count_solutions(unsolvable) == 0
    with pytest.raises(ValueError):
        solve_sudoku([[0] * 9] * 8)
    with pytest.raises(ValueError):
        solve_sudoku([[10] + [0] * 8] + [[0] * 9 for _ in range(8)])
    assert not is_valid_solution(EASY) and not is_valid_solution([])


def test_random_puzzles_from_solutions() -> None:
    rng = random.Random(9)
    base = solve_sudoku([[0] * 9 for _ in range(9)])
    assert base is not None
    for _ in range(5):
        puzzle = [[v if rng.random() < 0.35 else 0 for v in row] for row in base]
        solution = solve_sudoku(puzzle)
        assert solution is not None and is_valid_solution(solution)
        assert all(puzzle[r][c] in (0, solution[r][c]) for r in range(9) for c in range(9))
