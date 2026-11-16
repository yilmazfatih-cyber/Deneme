from __future__ import annotations

import itertools
from fractions import Fraction

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.cesitli.simplex import simplex
from algoritma.kaliplar.greedy_exchange import best_spice_mix, max_profit_jobs, min_total_waiting


def test_hand_checked_examples() -> None:
    assert min_total_waiting([5]) == ([0], 0)
    assert max_profit_jobs([(1, 10), (1, 20), (1, 5)]) == 20  # tek gün: en kârlısı
    assert best_spice_mix([(10, 5)], 2) == 4  # 5 gramlık stoktan 2 gram


def test_edge_cases() -> None:
    assert min_total_waiting([]) == ([], 0) and max_profit_jobs([]) == 0
    assert best_spice_mix([], 10) == 0 and best_spice_mix([(5, 1)], 0) == 0
    with pytest.raises(ValueError):
        max_profit_jobs([(0, 5)])


@given(st.lists(st.integers(1, 20), max_size=6))
def test_waiting_matches_all_orders(durations: list[int]) -> None:
    def total(order: tuple[int, ...]) -> int:
        return sum(sum(durations[j] for j in order[:k]) for k in range(len(order)))

    order, value = min_total_waiting(durations)
    assert value == min(total(p) for p in itertools.permutations(range(len(durations))))
    assert value == total(tuple(order))


@given(st.lists(st.tuples(st.integers(1, 4), st.integers(0, 30)), max_size=7))
def test_jobs_match_brute_force(jobs: list[tuple[int, int]]) -> None:
    def schedulable(chosen: tuple[int, ...]) -> bool:  # son güne göre sıralayıp yerleştir
        deadlines = sorted(jobs[i][0] for i in chosen)
        return all(day + 1 <= d for day, d in enumerate(deadlines))

    best = max(
        sum(jobs[i][1] for i in chosen)
        for r in range(len(jobs) + 1)
        for chosen in itertools.combinations(range(len(jobs)), r)
        if schedulable(chosen)
    )
    assert max_profit_jobs(jobs) == best


@given(st.lists(st.tuples(st.integers(1, 50), st.integers(1, 10)), max_size=4), st.integers(0, 25))
def test_spice_mix_matches_linear_program(spices: list[tuple[int, int]], capacity: int) -> None:
    # LP: en büyük Σ (değer_i / gram_i) · x_i; Σ x_i ≤ kapasite, 0 ≤ x_i ≤ gram_i
    n = len(spices)
    a = [[1] * n] + [[int(i == j) for j in range(n)] for i in range(n)]
    b = [capacity] + [grams for _, grams in spices]
    c = [Fraction(value, grams) for value, grams in spices]
    status, value, _ = simplex(a, b, c) if n else ("optimal", Fraction(0), [])
    assert status == "optimal" and best_spice_mix(spices, capacity) == value
