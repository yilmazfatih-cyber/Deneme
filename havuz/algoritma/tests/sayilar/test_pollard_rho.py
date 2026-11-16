from __future__ import annotations

import math
import random

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.sayilar.pollard_rho import factorize


def _trial_factors(n: int) -> list[int]:
    factors, d = [], 2
    while d * d <= n:
        while n % d == 0:
            factors.append(d)
            n //= d
        d += 1
    return factors + ([n] if n > 1 else [])


def test_hand_checked_example() -> None:
    assert factorize(2**67 - 1) == [193707721, 761838257287]
    p, q = 1_000_000_007, 998_244_353
    assert factorize(p * q) == [q, p]
    assert factorize(p * p) == [p, p]  # tam kare
    assert factorize(2**10 * 3**5 * 7) == [2] * 10 + [3] * 5 + [7]


def test_edge_cases() -> None:
    assert factorize(1) == [] and factorize(2) == [2] and factorize(997) == [997]
    with pytest.raises(ValueError):
        factorize(0)
    semiprime = 1_000_000_000_039 * 999_999_999_989  # ~10²⁴, iki büyük asal
    assert factorize(semiprime, rng=random.Random(5)) == [999_999_999_989, 1_000_000_000_039]


@given(st.integers(1, 10**9))
def test_matches_trial_division(n: int) -> None:
    assert factorize(n) == _trial_factors(n)


@given(st.lists(st.sampled_from([1009, 10007, 65537, 1000003, 2147483647]), min_size=1, max_size=4))
def test_products_of_known_primes(primes: list[int]) -> None:
    n = math.prod(primes)
    assert factorize(n) == sorted(primes)
