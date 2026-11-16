from __future__ import annotations

import math
import random

import pytest

from algoritma.eniyileme.simulated_annealing import simulated_annealing


def _tour_length(points: list[tuple[float, float]], tour: list[int]) -> float:
    return sum(math.dist(points[tour[i - 1]], points[tour[i]]) for i in range(len(tour)))


def _two_opt_move(tour: list[int], rng: random.Random) -> list[int]:
    i, j = sorted(rng.sample(range(1, len(tour)), 2))
    return tour[:i] + tour[i : j + 1][::-1] + tour[j + 1 :]


def test_tsp_on_circle_reaches_optimum() -> None:
    # 10 şehir çember üstünde: en iyi tur çember sırasıdır (çevre uzunluğu)
    rng = random.Random(1)
    angles = sorted(rng.uniform(0, 2 * math.pi) for _ in range(10))
    points = [(math.cos(a), math.sin(a)) for a in angles]
    optimum = _tour_length(points, list(range(10)))
    start = list(range(10))
    rng.shuffle(start)
    best, cost = simulated_annealing(
        start,
        _two_opt_move,
        lambda t: _tour_length(points, t),
        random.Random(7),
        steps=20_000,
        start_temperature=1.0,
    )
    assert math.isclose(cost, optimum, rel_tol=1e-9) and sorted(best) == list(range(10))


def test_never_worse_than_start_and_reproducible() -> None:
    def cost(x: int) -> float:
        return math.sin(x / 3) * 10 + abs(x - 40) / 4

    def step(x: int, rng: random.Random) -> int:
        return x + rng.choice([-3, -1, 1, 3])

    best, value = simulated_annealing(0, step, cost, random.Random(5), steps=3000)
    assert value <= cost(0) and value == cost(best)
    assert simulated_annealing(0, step, cost, random.Random(5), steps=3000) == (best, value)


def test_edge_cases() -> None:
    with pytest.raises(ValueError):
        simulated_annealing(0, lambda x, rng: x, float, random.Random(0), steps=0)
    with pytest.raises(ValueError):
        simulated_annealing(0, lambda x, rng: x, float, random.Random(0), end_temperature=20.0)
    assert simulated_annealing(3, lambda x, rng: x, float, random.Random(0), steps=5) == (3, 3.0)
