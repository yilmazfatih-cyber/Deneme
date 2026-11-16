from __future__ import annotations

import math
import random

from hypothesis import given
from hypothesis import strategies as st

from algoritma.sayilar.miller_rabin import is_prime


def _trial(n: int) -> bool:
    return n >= 2 and all(n % d for d in range(2, math.isqrt(n) + 1))


def test_hand_checked_example() -> None:
    carmichael = [561, 1105, 1729, 2465, 2821, 6601, 8911, 41041, 825265]
    strong_pseudoprimes = [2047, 1373653, 25326001, 3215031751, 2152302898747, 3474749660383]
    assert not any(is_prime(n) for n in carmichael + strong_pseudoprimes)
    mersenne = [2**p - 1 for p in (31, 61, 89, 107, 127, 521)]  # bilinen Mersenne asalları
    assert all(is_prime(m) for m in mersenne)
    assert not is_prime(2**67 - 1)  # = 193707721 · 761838257287 (Cole, 1903)


def test_edge_cases() -> None:
    assert [n for n in range(-5, 12) if is_prime(n)] == [2, 3, 5, 7, 11]
    big_prime = 2**127 - 1
    assert not is_prime(big_prime * (2**89 - 1), rng=random.Random(1))  # 3.3·10²⁴ üstü
    assert is_prime(2**521 - 1, rounds=5, rng=random.Random(2))


@given(st.integers(-10, 200_000))
def test_matches_trial_division(n: int) -> None:
    assert is_prime(n) == _trial(n)


@given(st.integers(2, 10**6), st.integers(2, 10**6))
def test_products_are_composite(a: int, b: int) -> None:
    assert not is_prime(a * b)
