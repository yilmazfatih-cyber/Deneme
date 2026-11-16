from __future__ import annotations

import itertools
from fractions import Fraction

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.sayilar.gaussian_elimination import determinant, rref, solve, solve_mod


def _leibniz(a: list[list[int]]) -> int:
    """Başvuru: permütasyonlar üstünden determinant tanımı."""
    n = len(a)
    total = 0
    for perm in itertools.permutations(range(n)):
        inversions = sum(perm[i] > perm[j] for i in range(n) for j in range(i + 1, n))
        product = 1
        for i in range(n):
            product *= a[i][perm[i]]
        total += -product if inversions % 2 else product
    return total


def test_hand_checked_example() -> None:
    # karışım problemi: 3 bilinmeyen, 3 denklem
    a = [[1, 1, 1], [2, -1, 1], [1, 2, -1]]
    assert solve(a, [6, 3, 2]) == [Fraction(1), Fraction(2), Fraction(3)]
    reduced, pivots = rref([[1, 2, 3], [2, 4, 6]])
    assert pivots == [0] and reduced[1] == [0, 0, 0]
    assert determinant([[2, 0, 0], [0, 3, 0], [0, 0, Fraction(1, 6)]]) == 1


def test_edge_cases() -> None:
    assert solve([[0, 0]], [0]) == [Fraction(0), Fraction(0)]  # her şey çözüm: serbestler 0
    assert solve([[0, 0]], [1]) is None
    assert solve_mod([[2]], [1], 2) is None and solve_mod([[3]], [1], 7) == [5]
    with pytest.raises(ValueError):
        determinant([[1, 2]])
    with pytest.raises(ValueError):
        solve([[1]], [1, 2])
    assert determinant([]) == 1


@given(st.integers(1, 4), st.data())
def test_determinant_matches_leibniz(n: int, data: st.DataObject) -> None:
    a = [[data.draw(st.integers(-6, 6)) for _ in range(n)] for _ in range(n)]
    assert determinant(a) == _leibniz(a)


@given(st.integers(1, 4), st.integers(1, 4), st.data())
def test_solution_satisfies_system(rows: int, cols: int, data: st.DataObject) -> None:
    a = [[data.draw(st.integers(-4, 4)) for _ in range(cols)] for _ in range(rows)]
    hidden = [data.draw(st.integers(-5, 5)) for _ in range(cols)]
    b = [sum(x * y for x, y in zip(row, hidden)) for row in a]  # çözümü olduğu kesin
    x = solve(a, b)
    assert x is not None and all(
        sum(p * q for p, q in zip(row, x)) == rhs for row, rhs in zip(a, b)
    )


@given(st.integers(1, 3), st.integers(1, 3), st.sampled_from([2, 3, 5]), st.data())
def test_solve_mod_matches_brute_force(rows: int, cols: int, p: int, data: st.DataObject) -> None:
    a = [[data.draw(st.integers(0, p - 1)) for _ in range(cols)] for _ in range(rows)]
    b = [data.draw(st.integers(0, p - 1)) for _ in range(rows)]
    solutions = [
        x for x in itertools.product(range(p), repeat=cols)
        if all(sum(u * v for u, v in zip(row, x)) % p == rhs for row, rhs in zip(a, b))
    ]  # fmt: skip
    result = solve_mod(a, b, p)
    assert (result is not None) == bool(solutions)
    if result is not None:
        assert tuple(result) in solutions
