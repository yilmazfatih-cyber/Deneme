from __future__ import annotations

import cmath

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.sayilar.fft import fft, multiply_polynomials_fft


def _naive(a: list[int], b: list[int]) -> list[int]:
    if not a or not b:
        return []
    out = [0] * (len(a) + len(b) - 1)
    for i, x in enumerate(a):
        for j, y in enumerate(b):
            out[i + j] += x * y
    return out


def test_hand_checked_example() -> None:
    assert multiply_polynomials_fft([1, 1], [1, 1]) == [1, 2, 1]  # (1 + x)²
    # büyük sayı çarpımı: 123 · 456 basamak evrişimiyle (küçükten büyüğe basamaklar)
    digits = multiply_polynomials_fft([3, 2, 1], [6, 5, 4])
    assert sum(d * 10**i for i, d in enumerate(digits)) == 123 * 456
    spectrum = fft([1, 0, 0, 0])
    assert all(cmath.isclose(x, 1) for x in spectrum)  # birim dürtünün spektrumu düz


def test_edge_cases() -> None:
    assert multiply_polynomials_fft([], [1]) == [] and multiply_polynomials_fft([5], [-3]) == [-15]
    with pytest.raises(ValueError):
        fft([1, 2, 3])
    values = [complex(i, -i) for i in range(8)]
    back = fft(fft(values), invert=True)
    assert all(cmath.isclose(x, y, abs_tol=1e-9) for x, y in zip(back, values))


@given(
    st.lists(st.integers(-1000, 1000), max_size=40), st.lists(st.integers(-1000, 1000), max_size=40)
)
def test_matches_naive_convolution(a: list[int], b: list[int]) -> None:
    assert multiply_polynomials_fft(a, b) == _naive(a, b)
