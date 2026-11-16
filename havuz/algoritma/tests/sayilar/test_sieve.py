from __future__ import annotations

import math

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.sayilar.sieve import (
    factorize_with_spf,
    primes_up_to,
    segmented_primes,
    smallest_prime_factors,
)


def _is_prime(n: int) -> bool:
    return n >= 2 and all(n % d for d in range(2, math.isqrt(n) + 1))


def test_hand_checked_example() -> None:
    assert len(primes_up_to(1000)) == 168 and len(primes_up_to(10**6)) == 78_498
    assert smallest_prime_factors(12) == [0, 0, 2, 3, 2, 5, 2, 7, 2, 3, 2, 11, 2]
    assert segmented_primes(10**12, 10**12 + 40) == [1000000000039]


def test_edge_cases() -> None:
    assert primes_up_to(1) == [] and primes_up_to(2) == [2]
    assert segmented_primes(0, 10) == [2, 3, 5, 7] and segmented_primes(20, 20) == []
    assert factorize_with_spf(1, smallest_prime_factors(5)) == []
    with pytest.raises(ValueError):
        factorize_with_spf(6, smallest_prime_factors(5))


@given(st.integers(0, 3000))
def test_primes_match_trial_division(n: int) -> None:
    assert primes_up_to(n) == [p for p in range(n + 1) if _is_prime(p)]


@given(st.integers(0, 10**6), st.integers(0, 2000))
def test_segment_matches_trial_division(lo: int, width: int) -> None:
    assert segmented_primes(lo, lo + width) == [p for p in range(lo, lo + width) if _is_prime(p)]


@given(st.integers(1, 5000))
def test_factorization_matches_product(x: int) -> None:
    factors = factorize_with_spf(x, smallest_prime_factors(5000))
    assert math.prod(factors) == x and factors == sorted(factors)
    assert all(_is_prime(p) for p in factors)
