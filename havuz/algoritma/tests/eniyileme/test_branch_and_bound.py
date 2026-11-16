from __future__ import annotations

import itertools

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.eniyileme.branch_and_bound import knapsack_branch_and_bound


def test_hand_checked_example() -> None:
    # kargo uçağı: ondalık tonlar; DP tablosu kurulamaz ama dal-sınır kesin sonuç verir
    weights = [12.5, 7.25, 3.1, 9.9, 15.0, 4.4]
    values = [100, 62, 25, 80, 110, 38]
    best, chosen = knapsack_branch_and_bound(weights, values, 30.0)
    brute = max(
        sum(values[i] for i in combo)
        for r in range(7)
        for combo in itertools.combinations(range(6), r)
        if sum(weights[i] for i in combo) <= 30.0
    )
    assert best == brute and sum(weights[i] for i in chosen) <= 30.0


def test_edge_cases() -> None:
    assert knapsack_branch_and_bound([], [], 10) == (0, [])
    assert knapsack_branch_and_bound([5], [10], 4.99) == (0, [])
    assert knapsack_branch_and_bound([1, 1], [0, 0], 5) == (0, [])
    with pytest.raises(ValueError):
        knapsack_branch_and_bound([0], [1], 1)
    with pytest.raises(ValueError):
        knapsack_branch_and_bound([1, 2], [1], 1)
    many = [float(i % 7 + 1) for i in range(60)]  # 60 eşya: budama sayesinde hızlı
    best, chosen = knapsack_branch_and_bound(
        many, [w * 3 + (i % 5) for i, w in enumerate(many)], 50
    )
    assert sum(many[i] for i in chosen) <= 50 and best > 0


@given(
    st.lists(st.tuples(st.floats(0.5, 10, allow_nan=False), st.integers(0, 50)), max_size=9),
    st.floats(0, 25, allow_nan=False),
)
def test_matches_brute_force(items: list[tuple[float, int]], capacity: float) -> None:
    weights = [w for w, _ in items]
    values = [v for _, v in items]
    best, chosen = knapsack_branch_and_bound(weights, values, capacity)
    brute = max(
        sum(values[i] for i in combo)
        for r in range(len(items) + 1)
        for combo in itertools.combinations(range(len(items)), r)
        if sum(weights[i] for i in combo) <= capacity
    )
    assert best == brute
    assert sum(values[i] for i in chosen) == best and sum(weights[i] for i in chosen) <= capacity
