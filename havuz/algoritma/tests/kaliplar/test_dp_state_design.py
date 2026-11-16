from __future__ import annotations

import itertools

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.kaliplar.dp_state_design import paint_signs, stair_ways, work_plan


def test_hand_checked_examples() -> None:
    assert [stair_ways(n, set()) for n in range(7)] == [1, 1, 2, 3, 5, 8, 13]  # Fibonacci
    assert stair_ways(4, {1, 2}) == 0  # iki ardışık kırık basamak aşılamaz
    assert paint_signs([[1, 9], [1, 9], [1, 9]]) == (11, [0, 1, 0])
    assert work_plan([3, 3, 3], max_streak=0) == (0, [False, False, False])


def test_edge_cases() -> None:
    assert stair_ways(0, set()) == 1 and paint_signs([]) == (0, [])
    assert work_plan([], 2) == (0, [])
    with pytest.raises(ValueError):
        stair_ways(-1, set())
    with pytest.raises(ValueError):
        paint_signs([[1], [2]])  # tek renkle komşular farklı olamaz


@given(st.integers(0, 14), st.sets(st.integers(1, 14), max_size=4))
def test_stairs_match_enumeration(n: int, broken: set[int]) -> None:
    count = sum(1 for k in range(n + 1) for steps in itertools.product((1, 2), repeat=k)
                if sum(steps) == n and not set(itertools.accumulate(steps)) & broken)  # fmt: skip
    assert stair_ways(n, broken) == count


@given(st.integers(1, 5), st.integers(2, 3), st.data())
def test_paint_matches_enumeration(n: int, k: int, data: st.DataObject) -> None:
    costs = [[data.draw(st.integers(0, 20)) for _ in range(k)] for _ in range(n)]
    valid = [p for p in itertools.product(range(k), repeat=n)
             if all(p[i] != p[i + 1] for i in range(n - 1))]  # fmt: skip
    best = min(sum(costs[i][p[i]] for i in range(n)) for p in valid)
    total, plan = paint_signs(costs)
    assert total == best and sum(costs[i][c] for i, c in enumerate(plan)) == best
    assert all(plan[i] != plan[i + 1] for i in range(n - 1))


@given(st.lists(st.integers(0, 20), max_size=9), st.integers(0, 3))
def test_work_plan_matches_enumeration(earnings: list[int], max_streak: int) -> None:
    def ok(plan: tuple[bool, ...]) -> bool:
        streak = 0
        for day in plan:
            streak = streak + 1 if day else 0
            if streak > max_streak:
                return False
        return True

    plans = [p for p in itertools.product((False, True), repeat=len(earnings)) if ok(p)]
    best = max(sum(e for e, d in zip(earnings, p) if d) for p in plans)
    total, plan = work_plan(earnings, max_streak)
    assert total == best and ok(tuple(plan)) and sum(e for e, d in zip(earnings, plan) if d) == best
