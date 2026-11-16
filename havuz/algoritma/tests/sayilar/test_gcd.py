from __future__ import annotations

import math

from hypothesis import given
from hypothesis import strategies as st

from algoritma.sayilar.gcd import extended_gcd, gcd, lcm


def test_hand_checked_example() -> None:
    assert gcd(1071, 462) == 21  # Öklid'in kendi örneği
    g, x, y = extended_gcd(35, 15)
    assert g == 5 and 35 * x + 15 * y == 5
    assert lcm(21, 6) == 42


def test_edge_cases() -> None:
    assert gcd(0, 0) == 0 and gcd(0, 7) == 7 and gcd(-12, 18) == 6
    assert lcm(0, 5) == 0 and lcm(-4, 6) == 12
    assert extended_gcd(0, 0) == (0, 1, 0) and extended_gcd(0, -5)[0] == 5
    big = 2**521 - 1  # büyük tam sayılar da kesin
    assert gcd(big * 3, big * 7) == big


@given(st.integers(-(10**30), 10**30), st.integers(-(10**30), 10**30))
def test_matches_math_module(a: int, b: int) -> None:
    assert gcd(a, b) == math.gcd(a, b) and lcm(a, b) == math.lcm(a, b)
    g, x, y = extended_gcd(a, b)
    assert g == math.gcd(a, b) and a * x + b * y == g
