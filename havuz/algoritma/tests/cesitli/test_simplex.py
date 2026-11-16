from __future__ import annotations

import itertools
from fractions import Fraction

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.cesitli.simplex import simplex


def _solve_square(m: list[list[Fraction]], rhs: list[Fraction]) -> list[Fraction] | None:
    """Kare sistemi Gauss ile çöz (kesin); tekilse None."""
    n = len(m)
    rows = [[*row, r] for row, r in zip(m, rhs)]
    for c in range(n):
        pivot = next((i for i in range(c, n) if rows[i][c] != 0), None)
        if pivot is None:
            return None
        rows[c], rows[pivot] = rows[pivot], rows[c]
        for i in range(n):
            if i != c and rows[i][c] != 0:
                f = rows[i][c] / rows[c][c]
                rows[i] = [x - f * y for x, y in zip(rows[i], rows[c])]
    return [rows[i][n] / rows[i][i] for i in range(n)]


def _vertex_optimum(a: list[list[int]], b: list[int], c: list[int]) -> Fraction | None:
    """Kaba kuvvet: n kısıtı eşitlik yapan her köşe; uygun olanların en iyisi (yoksa None)."""
    n = len(c)
    constraints = [([Fraction(x) for x in row], Fraction(r)) for row, r in zip(a, b)]
    constraints += [
        ([Fraction(-(j == k)) for k in range(n)], Fraction(0)) for j in range(n)
    ]  # x ≥ 0
    best = None
    for chosen in itertools.combinations(constraints, n):
        x = _solve_square([row for row, _ in chosen], [r for _, r in chosen])
        if x is None or any(sum(p * q for p, q in zip(row, x)) > r for row, r in constraints):
            continue
        value = sum((Fraction(ci) * xi for ci, xi in zip(c, x)), Fraction(0))
        best = value if best is None else max(best, value)
    return best


def test_hand_checked_examples() -> None:
    # karışım: en ucuz yem; en küçükleme = −c'yi en büyükleme; "≥" kısıtları −1 ile çarpılır
    # en küçük 3x + 4y; 2x + y ≥ 8, x + 3y ≥ 9 → köşeler (0, 8): 32, (9, 0): 27, (3, 2): 17
    assert simplex([[-2, -1], [-1, -3]], [-8, -9], [-3, -4]) == (
        "optimal", Fraction(-17), [Fraction(3), Fraction(2)],
    )  # fmt: skip
    assert simplex([[1, -1]], [1], [1, 1])[0] == "unbounded"
    assert simplex([[1], [-1]], [1, -2], [1])[0] == "infeasible"  # x ≤ 1 ve x ≥ 2


def test_edge_cases() -> None:
    assert simplex([], [], [1, 2]) == ("unbounded", None, None)  # kısıtsız, artan amaç
    assert simplex([], [], [-1]) == ("optimal", Fraction(0), [Fraction(0)])
    assert simplex([[1, 1]], [0], [1, 1]) == ("optimal", Fraction(0), [Fraction(0), Fraction(0)])
    with pytest.raises(ValueError):
        simplex([[1, 2]], [1, 2], [1, 1])


@given(st.integers(1, 3), st.integers(1, 3), st.data())
def test_matches_vertex_enumeration(n: int, m: int, data: st.DataObject) -> None:
    a = [[data.draw(st.integers(-3, 4)) for _ in range(n)] for _ in range(m)]
    b = [data.draw(st.integers(-4, 8)) for _ in range(m)]
    a += [[int(j == k) for k in range(n)] for j in range(n)]  # x_j ≤ 6: bölge sınırlı
    b += [6] * n
    c = [data.draw(st.integers(-3, 3)) for _ in range(n)]
    expected = _vertex_optimum(a, b, c)
    status, value, x = simplex(a, b, c)
    if expected is None:
        assert status == "infeasible"
    else:
        assert status == "optimal" and value == expected and x is not None
        assert all(xi >= 0 for xi in x)
        assert all(sum(p * q for p, q in zip(row, x)) <= r for row, r in zip(a, b))
        assert sum(ci * xi for ci, xi in zip(c, x)) == value
