from __future__ import annotations

import itertools
import random

import pytest

from algoritma.eniyileme.genetic_algorithm import genetic_algorithm, knapsack_fitness


def test_onemax_reaches_optimum() -> None:
    best, fitness = genetic_algorithm(40, sum, random.Random(1), generations=150)
    assert fitness == 40 and best == [1] * 40


def test_knapsack_matches_brute_force_optimum() -> None:
    weights = [12, 7, 19, 4, 15, 9, 22, 6, 11, 17]  # özgün küçük örnek; en iyiyi kaba kuvvet bulur
    values = [30, 14, 41, 9, 33, 22, 45, 10, 26, 35]
    capacity = 60
    score = knapsack_fitness(weights, values, capacity)
    brute = max(score([int(i in combo) for i in range(10)])
                for r in range(11) for combo in itertools.combinations(range(10), r))  # fmt: skip
    best, fitness = genetic_algorithm(10, score, random.Random(3), population_size=80,
                                      generations=120)  # fmt: skip
    assert fitness == brute and score(best) == fitness


def test_edge_cases_and_reproducibility() -> None:
    with pytest.raises(ValueError):
        genetic_algorithm(0, sum, random.Random(0))
    with pytest.raises(ValueError):
        genetic_algorithm(5, sum, random.Random(0), population_size=1)
    first = genetic_algorithm(12, sum, random.Random(9), generations=10)
    assert genetic_algorithm(12, sum, random.Random(9), generations=10) == first
    assert knapsack_fitness([5], [7], 4)([1]) == 0.0  # kapasite aşımı cezalandırılır
