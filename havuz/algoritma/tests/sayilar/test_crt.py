from __future__ import annotations

import math

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.sayilar.crt import crt


def test_hand_checked_example() -> None:
    # Üç otobüs hattı: 4, 6 ve 9 dakikada bir; 1., 3. ve 3. dakikada kalkıyorlar
    assert crt([1, 3, 3], [4, 6, 9]) == (21, 36)
    assert crt([1, 1, 1, 1], [2, 3, 4, 5]) == (1, 60)


def test_edge_cases() -> None:
    assert crt([], []) == (0, 1)
    assert crt([5], [3]) == (2, 3) and crt([-1], [7]) == (6, 7)
    with pytest.raises(ValueError):
        crt([1], [0])
    with pytest.raises(ValueError):
        crt([1, 2], [3])


@given(st.lists(st.tuples(st.integers(-50, 50), st.integers(1, 12)), max_size=4))
def test_matches_brute_force(pairs: list[tuple[int, int]]) -> None:
    remainders = [r for r, _ in pairs]
    moduli = [m for _, m in pairs]
    period = math.lcm(*moduli) if moduli else 1
    solutions = [x for x in range(period) if all((x - r) % m == 0 for r, m in pairs)]
    assert crt(remainders, moduli) == ((solutions[0], period) if solutions else None)
