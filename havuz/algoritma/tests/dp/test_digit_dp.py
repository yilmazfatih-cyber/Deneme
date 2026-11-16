from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.dp.digit_dp import count_with_digit_sum, digit_sum, kth_with_digit_sum


def test_hand_checked_example() -> None:
    assert digit_sum(2026) == 10
    assert count_with_digit_sum(10**18, 1) == 19  # 1, 10, 100, …, 10^18
    assert kth_with_digit_sum(3, 1) == 100
    # 10^18'e kadar basamak toplamı 81 olan sayılar: dokuz basamağı 9 olanlar vb. — sayım hızlıdır
    assert count_with_digit_sum(10**18 - 1, 162) == 1  # yalnız 999…9 (18 tane 9)


def test_edge_cases() -> None:
    assert count_with_digit_sum(0, 0) == 1 and count_with_digit_sum(-1, 0) == 0
    assert count_with_digit_sum(5, -1) == 0 and count_with_digit_sum(9, 10) == 0
    assert kth_with_digit_sum(1, 0) == 0
    with pytest.raises(ValueError):
        kth_with_digit_sum(2, 0)
    with pytest.raises(ValueError):
        kth_with_digit_sum(0, 5)


@given(st.integers(0, 3000), st.integers(0, 30))
def test_count_matches_brute_force(limit: int, target: int) -> None:
    expected = sum(1 for x in range(limit + 1) if digit_sum(x) == target)
    assert count_with_digit_sum(limit, target) == expected


# Küçük toplamlarda k. sayı çok büyür (toplam 1 için 10^(k−1)); kaba kuvvet yetişsin diye 5 … 25.
@given(st.integers(1, 40), st.integers(5, 25))
def test_kth_matches_brute_force(k: int, target: int) -> None:
    found: list[int] = []
    x = 0
    while len(found) < k:
        if digit_sum(x) == target:
            found.append(x)
        x += 1
    assert kth_with_digit_sum(k, target) == found[-1]
