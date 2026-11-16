from __future__ import annotations

import itertools

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.dp.bitmask_dp import min_cost_assignment


def test_hand_checked_example() -> None:
    # 2 usta, 3 iş (dakika): usta 0 → iş 2, usta 1 → iş 0 en ucuzu
    assert min_cost_assignment([[8, 6, 1], [2, 9, 9]]) == (3, [2, 0])


def test_edge_cases() -> None:
    assert min_cost_assignment([]) == (0, [])
    assert min_cost_assignment([[5]]) == (5, [0])
    with pytest.raises(ValueError):
        min_cost_assignment([[1], [2]])  # 2 kişi, 1 iş


@given(st.integers(1, 5), st.integers(0, 2), st.data())
def test_matches_permutations(n: int, extra_jobs: int, data: st.DataObject) -> None:
    m = n + extra_jobs
    cost = [[data.draw(st.integers(-5, 20)) for _ in range(m)] for _ in range(n)]
    total, assignment = min_cost_assignment(cost)
    best = min(sum(cost[i][p[i]] for i in range(n)) for p in itertools.permutations(range(m), n))
    assert total == best
    assert len(set(assignment)) == n and sum(cost[i][assignment[i]] for i in range(n)) == best
