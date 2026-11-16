from __future__ import annotations

import random
from collections.abc import Iterable

import pytest

from algoritma.eniyileme.hill_climbing import (
    hill_climb,
    queen_neighbors,
    queen_score,
    random_restart_hill_climb,
)

# İki tepeli tek boyutlu arazi: x = 3'te yerel tepe (5), x = 15'te küresel tepe (9)
LANDSCAPE = [0, 2, 4, 5, 3, 1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 7, 4]


def _neighbors(x: int) -> Iterable[int]:
    return [y for y in (x - 1, x + 1) if 0 <= y < len(LANDSCAPE)]


def _height(x: int) -> float:
    return LANDSCAPE[x]


def test_gets_stuck_on_local_peak_without_restarts() -> None:
    assert hill_climb(1, _neighbors, _height) == (3, 5)  # yerel tepede takıldı
    assert hill_climb(9, _neighbors, _height) == (15, 9)


def test_random_restarts_find_global_peak() -> None:
    best = random_restart_hill_climb(
        lambda rng: rng.randrange(len(LANDSCAPE)),
        _neighbors,
        _height,
        random.Random(2),
        restarts=10,
    )
    assert best == (15, 9)


@pytest.mark.parametrize("n", [4, 6, 8])
def test_n_queens_min_conflicts(n: int) -> None:
    state, score = random_restart_hill_climb(
        lambda rng: [rng.randrange(n) for _ in range(n)],
        queen_neighbors,
        queen_score,
        random.Random(n),
        restarts=200,
        good_enough=0,
    )
    assert score == 0 and queen_score(state) == 0


def test_edge_cases() -> None:
    assert queen_score([0, 0]) == -1 and queen_score([0, 2, 4, 1, 3]) == 0
    assert len(list(queen_neighbors([0, 1, 2]))) == 6
    with pytest.raises(ValueError):
        random_restart_hill_climb(lambda rng: 0, _neighbors, _height, random.Random(0), restarts=0)
    assert hill_climb(15, _neighbors, _height) == (15, 9)  # zaten tepede
