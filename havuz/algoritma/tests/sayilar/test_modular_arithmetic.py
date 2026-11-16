from __future__ import annotations

import math

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.sayilar.modular_arithmetic import mod_inverse, mod_pow


def test_hand_checked_example() -> None:
    assert mod_pow(2, 10, 1000) == 24  # 1024 mod 1000
    assert mod_pow(7, 0, 13) == 1 and mod_inverse(7, 26) == 15  # 7·15 = 105 = 4·26 + 1
    # RSA oyuncağı: p=61, q=53, n=3233, e=17, d=2753
    message = 65
    cipher = mod_pow(message, 17, 3233)
    assert cipher == 2790 and mod_pow(cipher, mod_inverse(17, 60 * 52), 3233) == message


def test_edge_cases() -> None:
    assert mod_pow(5, 3, 1) == 0 and mod_inverse(5, 1) == 0
    assert mod_pow(-2, 3, 5) == 2  # (−8) mod 5
    with pytest.raises(ValueError, match="tersi yok"):
        mod_inverse(6, 9)
    with pytest.raises(ValueError):
        mod_pow(2, -1, 5)
    with pytest.raises(ValueError):
        mod_pow(2, 3, 0)


@given(st.integers(-(10**20), 10**20), st.integers(0, 10**6), st.integers(1, 10**12))
def test_mod_pow_matches_builtin(base: int, exponent: int, modulus: int) -> None:
    assert mod_pow(base, exponent, modulus) == pow(base, exponent, modulus)


@given(st.integers(-(10**20), 10**20), st.integers(2, 10**12))
def test_mod_inverse_matches_builtin(a: int, modulus: int) -> None:
    if math.gcd(a, modulus) == 1:
        assert mod_inverse(a, modulus) == pow(a, -1, modulus)
    else:
        with pytest.raises(ValueError):
            mod_inverse(a, modulus)
