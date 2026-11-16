from __future__ import annotations

import itertools

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.dp.monotonic_queue_dp import max_score_path


def _brute_force(scores: list[int], k: int) -> int:
    """Başvuru: ara durakların her alt kümesini dene (2^(n−2) yol)."""
    n = len(scores)
    best = None
    for mask in range(1 << max(0, n - 2)):
        stops = (
            [0] + [i for i in range(1, n - 1) if mask >> (i - 1) & 1] + ([n - 1] if n > 1 else [])
        )
        if all(b - a <= k for a, b in itertools.pairwise(stops)):
            total = sum(scores[i] for i in stops)
            best = total if best is None else max(best, total)
    assert best is not None
    return best


def test_hand_checked_example() -> None:
    # dağ yürüyüşü: her durakta kazanılan (+) ya da kaybedilen (−) enerji; en çok 3 durak atla
    scores = [1, -10, -10, 5, -10, -10, -10, 2]
    total, path = max_score_path(scores, 3)
    assert (total, path) == (-2, [0, 3, 6, 7])  # 3'ten 7'ye tek adımda gidilemez (4 > 3)


def test_edge_cases() -> None:
    assert max_score_path([7], 1) == (7, [0])
    assert max_score_path([1, 2, 3], 1) == (6, [0, 1, 2])  # k=1: her durağa uğramak zorunlu
    with pytest.raises(ValueError):
        max_score_path([], 2)
    with pytest.raises(ValueError):
        max_score_path([1, 2], 0)
    n = 200_000
    total, path = max_score_path([-1] * n, n)  # tek atlayışta sona
    assert total == -2 and path == [0, n - 1]


@given(st.lists(st.integers(-20, 20), min_size=1, max_size=11), st.integers(1, 4))
def test_matches_brute_force(scores: list[int], k: int) -> None:
    total, path = max_score_path(scores, k)
    assert total == _brute_force(scores, k)
    assert path[0] == 0 and path[-1] == len(scores) - 1
    assert all(0 < b - a <= k for a, b in itertools.pairwise(path))
    assert sum(scores[i] for i in path) == total
