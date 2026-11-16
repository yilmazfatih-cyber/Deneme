from __future__ import annotations

import itertools

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.dp.knapsack import knapsack_01, knapsack_bounded, knapsack_unbounded


def _brute_force(weights: list[int], values: list[int], limits: list[int], cap: int) -> int:
    best = 0
    for counts in itertools.product(*[range(k + 1) for k in limits]):
        if sum(c * w for c, w in zip(counts, weights)) <= cap:
            best = max(best, sum(c * v for c, v in zip(counts, values)))
    return best


def test_hand_checked_example() -> None:
    # kamp çantası (kg, fayda): çadır, ocak, su, fener, kitap; kapasite 10 kg
    weights, values = [5, 3, 4, 1, 2], [10, 7, 8, 3, 2]
    assert knapsack_01(weights, values, 10) == (21, [0, 2, 3])
    assert knapsack_unbounded([3, 4], [5, 7], 10)[0] == 17  # 3+3+4 → 5+5+7
    assert knapsack_bounded([1, 2], [1, 3], [5, 1], 4) == (5, [2, 1])


def test_edge_cases() -> None:
    assert knapsack_01([], [], 5) == (0, []) and knapsack_unbounded([], [], 0) == (0, [])
    assert knapsack_01([3], [5], 2) == (0, []) and knapsack_bounded([1], [1], [0], 9) == (0, [0])
    with pytest.raises(ValueError):
        knapsack_01([1, 2], [1], 3)
    with pytest.raises(ValueError):
        knapsack_01([-1], [1], 3)
    with pytest.raises(ValueError):
        knapsack_bounded([1], [1], [1, 2], 3)


ITEMS = st.lists(st.tuples(st.integers(0, 6), st.integers(0, 9), st.integers(0, 3)), max_size=5)


@given(ITEMS, st.integers(0, 15))
def test_matches_brute_force(items: list[tuple[int, int, int]], capacity: int) -> None:
    weights = [w for w, _, _ in items]
    values = [v for _, v, _ in items]
    limits = [k for _, _, k in items]
    best, chosen = knapsack_01(weights, values, capacity)
    assert best == _brute_force(weights, values, [1] * len(items), capacity)
    assert sum(weights[i] for i in chosen) <= capacity and sum(values[i] for i in chosen) == best
    best, counts = knapsack_bounded(weights, values, limits, capacity)
    assert best == _brute_force(weights, values, limits, capacity)
    assert all(0 <= c <= k for c, k in zip(counts, limits))
    assert sum(c * w for c, w in zip(counts, weights)) <= capacity
    assert sum(c * v for c, v in zip(counts, values)) == best
    positive = [(w, v) for w, v in zip(weights, values) if w > 0]  # sıfır ağırlık sınırsızda sonsuz
    pw, pv = [w for w, _ in positive], [v for _, v in positive]
    best, counts = knapsack_unbounded(pw, pv, capacity)
    assert best == _brute_force(pw, pv, [capacity // w for w in pw], capacity)
    assert sum(c * w for c, w in zip(counts, pw)) <= capacity
    assert sum(c * v for c, v in zip(counts, pv)) == best
