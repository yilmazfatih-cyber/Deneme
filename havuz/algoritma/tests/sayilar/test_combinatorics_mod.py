from __future__ import annotations

import math

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.sayilar.combinatorics_mod import BinomialMod, lucas_binomial

P = 1_000_000_007


def test_hand_checked_example() -> None:
    table = BinomialMod(1000, P)
    assert table.binomial(52, 5) == 2_598_960  # 52 kartlık desteden 5'li el
    assert table.factorial(20) == math.factorial(20) % P
    catalan_10 = table.binomial(20, 10) * pow(11, -1, P) % P
    assert catalan_10 == 16796
    assert lucas_binomial(10, 3, 7) == math.comb(10, 3) % 7 == 1


def test_edge_cases() -> None:
    table = BinomialMod(10, 13)
    assert table.binomial(10, -1) == 0 and table.binomial(10, 11) == 0 and table.binomial(0, 0) == 1
    with pytest.raises(ValueError):
        BinomialMod(13, 13)  # p ≤ max_n: n! ≡ 0 olur
    with pytest.raises(ValueError):
        table.binomial(11, 2)
    assert lucas_binomial(5, 7, 3) == 0


@given(st.integers(0, 300), st.integers(-5, 305))
def test_matches_math_comb(n: int, k: int) -> None:
    expected = math.comb(n, k) % P if 0 <= k <= n else 0
    assert BinomialMod(300, P).binomial(n, k) == expected


@given(st.integers(0, 3000), st.integers(0, 3000), st.sampled_from([2, 3, 5, 7, 13]))
def test_lucas_matches_math_comb(n: int, k: int, p: int) -> None:
    expected = math.comb(n, k) % p if k <= n else 0
    assert lucas_binomial(n, k, p) == expected
