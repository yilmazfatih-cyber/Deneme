from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.sayilar.ntt import MOD, multiply_polynomials_ntt, ntt


def _naive(a: list[int], b: list[int]) -> list[int]:
    if not a or not b:
        return []
    out = [0] * (len(a) + len(b) - 1)
    for i, x in enumerate(a):
        for j, y in enumerate(b):
            out[i + j] = (out[i + j] + x * y) % MOD
    return out


def test_hand_checked_example() -> None:
    assert multiply_polynomials_ntt([1, 1], [1, 1]) == [1, 2, 1]
    big = [MOD - 1] * 3  # FFT'de yuvarlama hatası verecek büyüklükte katsayılar
    assert multiply_polynomials_ntt(big, big) == [1, 2, 3, 2, 1]  # (−1)² = 1 …


def test_edge_cases() -> None:
    assert multiply_polynomials_ntt([], [1]) == []
    with pytest.raises(ValueError):
        ntt([1, 2, 3])
    values = [5, 0, 7, 1]
    assert ntt(ntt(values), invert=True) == values


@given(
    st.lists(st.integers(0, MOD - 1), max_size=40), st.lists(st.integers(0, MOD - 1), max_size=40)
)
def test_matches_naive_convolution(a: list[int], b: list[int]) -> None:
    assert multiply_polynomials_ntt(a, b) == _naive(a, b)
