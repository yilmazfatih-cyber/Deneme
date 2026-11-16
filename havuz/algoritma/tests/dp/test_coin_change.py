from __future__ import annotations

import itertools

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.dp.coin_change import count_ways, min_coins


def _brute_force(coins: list[int], amount: int) -> tuple[int | None, int]:
    """(en az para sayısı, kombinasyon sayısı) — tüm adet vektörlerini dener."""
    distinct = sorted(set(coins))
    fewest: int | None = None
    ways = 0
    for counts in itertools.product(*[range(amount // c + 1) for c in distinct]):
        if sum(k * c for k, c in zip(counts, distinct)) == amount:
            ways += 1
            fewest = sum(counts) if fewest is None else min(fewest, sum(counts))
    return fewest, ways


def test_hand_checked_example() -> None:
    lira_coins = [1, 5, 10, 25, 50, 100]  # kuruş
    assert min_coins(lira_coins, 185) == [100, 50, 25, 10]
    assert min_coins([1, 3, 4], 6) == [3, 3]  # açgözlü yöntem 4+1+1 verirdi
    assert count_ways([2, 3], 7) == 2  # 2+2+3, 2+5? hayır: yalnız {2,2,3} ve {…} → 2+2+3 tek; 7=…


def test_edge_cases() -> None:
    assert min_coins([1], 0) == [] and count_ways([1], 0) == 1 and count_ways([], 0) == 1
    assert min_coins([], 3) is None and count_ways([4], 3) == 0
    with pytest.raises(ValueError):
        min_coins([0, 1], 3)
    with pytest.raises(ValueError):
        count_ways([1], -1)


@given(st.lists(st.integers(1, 7), min_size=1, max_size=4), st.integers(0, 25))
def test_matches_brute_force(coins: list[int], amount: int) -> None:
    fewest, ways = _brute_force(coins, amount)
    result = min_coins(coins, amount)
    assert (None if result is None else len(result)) == fewest
    if result is not None:
        assert sum(result) == amount and all(c in coins for c in result)
    assert count_ways(coins, amount) == ways
