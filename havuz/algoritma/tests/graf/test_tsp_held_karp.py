from __future__ import annotations

import itertools
import math

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.graf.tsp_held_karp import held_karp


def _tour_cost(dist: list[list[int]], tour: list[int]) -> int:
    return sum(dist[tour[i - 1]][tour[i]] for i in range(len(tour)))


def test_hand_checked_example() -> None:
    # beş ilçe, simetrik uzaklıklar (km)
    d = [[0, 12, 10, 19, 8], [12, 0, 3, 7, 2], [10, 3, 0, 6, 20], [19, 7, 6, 0, 4],
         [8, 2, 20, 4, 0]]  # fmt: skip
    cost, tour = held_karp(d)
    assert cost == 32 and _tour_cost(d, tour) == 32 and tour[0] == 0


def test_edge_cases() -> None:
    assert held_karp([]) == (0, []) and held_karp([[0]]) == (0, [0])
    assert held_karp([[0, 5], [7, 0]]) == (12, [0, 1])  # simetrik olmayan
    inf_cost, _ = held_karp([[0, math.inf, 1], [1, 0, math.inf], [math.inf, 1, 0]])
    assert inf_cost == 3  # tek geçerli yön: 0→2→1→0


@pytest.mark.parametrize("n", [2, 3, 4, 5, 6, 7])
def test_matches_permutations_on_fixed_seeds(n: int) -> None:
    import random

    rng = random.Random(n)
    d = [[0 if i == j else rng.randint(1, 30) for j in range(n)] for i in range(n)]
    cost, tour = held_karp(d)
    best = min(_tour_cost(d, [0, *p]) for p in itertools.permutations(range(1, n)))
    assert cost == best == _tour_cost(d, tour) and sorted(tour) == list(range(n))


@given(st.integers(2, 6), st.data())
def test_matches_permutations(n: int, data: st.DataObject) -> None:
    d = [[0 if i == j else data.draw(st.integers(0, 20)) for j in range(n)] for i in range(n)]
    cost, tour = held_karp(d)
    best = min(_tour_cost(d, [0, *p]) for p in itertools.permutations(range(1, n)))
    assert cost == best == _tour_cost(d, tour)
