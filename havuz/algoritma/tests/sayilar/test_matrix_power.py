from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.sayilar.matrix_power import fibonacci, linear_recurrence, mat_mult, mat_pow


def _naive(coefficients: list[int], initial: list[int], n: int) -> int:
    values = list(initial)
    while len(values) <= n:
        values.append(sum(c * values[-1 - j] for j, c in enumerate(coefficients)))
    return values[n]


def test_hand_checked_example() -> None:
    assert [fibonacci(i) for i in range(10)] == [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
    # 2×n tahtayı 1×2 dominolarla döşeme sayısı da Fibonacci'dir; yol sayısı = komşuluk üssü
    triangle = [[0, 1, 1], [1, 0, 1], [1, 1, 0]]
    assert mat_pow(triangle, 3)[0][0] == 2  # 0'dan 0'a tam 3 adımlı yürüyüş: 0-1-2-0, 0-2-1-0
    assert mat_mult([[1, 2]], [[3], [4]]) == [[11]]


def test_edge_cases() -> None:
    assert mat_pow([[5]], 0) == [[1]] and fibonacci(0) == 0 and fibonacci(1, mod=1) == 0
    with pytest.raises(ValueError):
        mat_pow([[1]], -1)
    with pytest.raises(ValueError):
        linear_recurrence([1, 1], [0], 5)
    assert linear_recurrence([2], [3], 0) == 3 and linear_recurrence([2], [3], 4) == 48


@given(
    st.lists(st.integers(-3, 3), min_size=1, max_size=4),
    st.data(),
    st.integers(0, 60),
    st.sampled_from([0, 7, 1_000_000_007]),
)
def test_matches_naive_iteration(
    coefficients: list[int], data: st.DataObject, n: int, mod: int
) -> None:
    initial = data.draw(
        st.lists(st.integers(-5, 5), min_size=len(coefficients), max_size=len(coefficients))
    )
    expected = _naive(coefficients, initial, n)
    assert linear_recurrence(coefficients, initial, n, mod) == (expected % mod if mod else expected)
