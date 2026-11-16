from __future__ import annotations

import math
from fractions import Fraction

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.sayilar.lu_decomposition import LUResult, lu_decompose


def _det(m: list[list[Fraction]]) -> Fraction:
    """Başvuru: ilk satıra göre açılım (kesin, küçük n)."""
    if len(m) == 1:
        return m[0][0]
    total = Fraction(0)
    for j in range(len(m)):
        minor = [row[:j] + row[j + 1 :] for row in m[1:]]
        total += (-1) ** j * m[0][j] * _det(minor)
    return total


def _cramer(a: list[list[Fraction]], b: list[Fraction]) -> list[Fraction]:
    d = _det(a)
    return [
        _det([[*row[:j], b[i], *row[j + 1 :]] for i, row in enumerate(a)]) / d
        for j in range(len(a))
    ]


def test_hand_checked_example() -> None:
    lu = lu_decompose(
        [[0.0, 2.0, 1.0], [1.0, 1.0, 0.0], [3.0, 0.0, 1.0]]
    )  # ilk pivot 0: takas şart
    assert isinstance(lu, LUResult) and lu.permutation[0] == 2
    x = lu.solve([5.0, 3.0, 4.0])
    assert all(math.isclose(v, w) for v, w in zip(x, [1.0, 2.0, 1.0]))
    assert math.isclose(lu.determinant(), -5.0)


def test_edge_cases() -> None:
    with pytest.raises(ValueError, match="tekil"):
        lu_decompose([[1.0, 2.0], [2.0, 4.0]])
    with pytest.raises(ValueError):
        lu_decompose([[1.0, 2.0]])
    lu = lu_decompose([[4.0]])
    assert lu.solve([2.0]) == [0.5] and lu.determinant() == 4.0
    with pytest.raises(ValueError):
        lu.solve([1.0, 2.0])


@given(st.integers(1, 4), st.data())
def test_matches_exact_solution(n: int, data: st.DataObject) -> None:
    a = [[data.draw(st.integers(-9, 9)) for _ in range(n)] for _ in range(n)]
    b = [data.draw(st.integers(-9, 9)) for _ in range(n)]
    exact_a = [[Fraction(x) for x in row] for row in a]
    exact_det = _det(exact_a)
    try:
        lu = lu_decompose([[float(x) for x in row] for row in a])
    except ValueError:
        assert exact_det == 0  # yalnız gerçekten tekil matrisler reddedilir
        return
    assert exact_det != 0 and math.isclose(lu.determinant(), float(exact_det), rel_tol=1e-9)
    exact = _cramer(exact_a, [Fraction(v) for v in b])
    for got, want in zip(lu.solve([float(v) for v in b]), exact):
        assert math.isclose(got, float(want), rel_tol=1e-9, abs_tol=1e-9)
    for i in range(n):  # P·A = L·U
        for j in range(n):
            product = sum(lu.lower[i][k] * lu.upper[k][j] for k in range(n))
            assert math.isclose(product, a[lu.permutation[i]][j], abs_tol=1e-9)
