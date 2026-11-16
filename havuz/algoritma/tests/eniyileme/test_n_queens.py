from __future__ import annotations

import itertools

import pytest

from algoritma.eniyileme.n_queens import count_n_queens, n_queens_solutions

KNOWN_COUNTS = [1, 1, 0, 0, 2, 10, 4, 40, 92, 352, 724]  # OEIS A000170, n = 0 … 10


def _is_valid(columns: list[int]) -> bool:
    n = len(columns)
    return len(set(columns)) == n and all(
        abs(columns[i] - columns[j]) != j - i for i in range(n) for j in range(i + 1, n)
    )


def test_known_counts() -> None:
    assert [count_n_queens(n) for n in range(11)] == KNOWN_COUNTS


def test_edge_cases() -> None:
    assert n_queens_solutions(0) == [[]] and n_queens_solutions(2) == []
    assert n_queens_solutions(1) == [[0]] and len(n_queens_solutions(8, limit=3)) == 3
    with pytest.raises(ValueError):
        n_queens_solutions(-1)
    with pytest.raises(ValueError):
        count_n_queens(-1)


@pytest.mark.parametrize("n", range(1, 8))
def test_matches_permutation_brute_force(n: int) -> None:
    brute = sorted(list(p) for p in itertools.permutations(range(n)) if _is_valid(list(p)))
    solutions = n_queens_solutions(n)
    assert solutions == brute  # aynı çözümler, sözlük sırasıyla
    assert all(_is_valid(s) for s in solutions)
