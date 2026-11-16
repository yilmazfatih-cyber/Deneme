from __future__ import annotations

import re
from functools import cache

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.dp.matrix_chain import matrix_chain_order


def _all_costs(dims: list[int]) -> set[int]:
    """Başvuru: TÜM parantezlemelerin maliyetleri (Catalan sayısı kadar)."""

    @cache
    def go(i: int, j: int) -> frozenset[int]:
        if i == j:
            return frozenset([0])
        out = set()
        for k in range(i, j):
            for left in go(i, k):
                for right in go(k + 1, j):
                    out.add(left + right + dims[i - 1] * dims[k] * dims[j])
        return frozenset(out)

    return set(go(1, len(dims) - 1))


def _evaluate(expression: str, dims: list[int]) -> int:
    """Parantezli ifadenin maliyetini yığınla hesaplar (çıktının tutarlılığı için)."""
    stack: list[tuple[int, int, int] | str] = []
    for token in re.findall(r"A\d+|\(|\)", expression):
        if token == "(":
            stack.append(token)
        elif token == ")":
            right, left = stack.pop(), stack.pop()
            stack.pop()  # "("
            assert isinstance(left, tuple) and isinstance(right, tuple)
            stack.append((left[0], right[1], left[2] + right[2] + left[0] * left[1] * right[1]))
        else:
            k = int(token[1:])
            stack.append((dims[k - 1], dims[k], 0))
    result = stack.pop()
    assert isinstance(result, tuple)
    return result[2]


def test_hand_checked_example() -> None:
    dims = [30, 35, 15, 5, 10, 20, 25]  # CLRS örneği
    assert matrix_chain_order(dims) == (15125, "((A1(A2A3))((A4A5)A6))")


def test_edge_cases() -> None:
    assert matrix_chain_order([5, 7]) == (0, "A1")
    with pytest.raises(ValueError):
        matrix_chain_order([5])


@given(st.lists(st.integers(1, 30), min_size=2, max_size=8))
def test_matches_all_parenthesizations(dims: list[int]) -> None:
    cost, expression = matrix_chain_order(dims)
    assert cost == min(_all_costs(dims))
    assert _evaluate(expression, dims) == cost
