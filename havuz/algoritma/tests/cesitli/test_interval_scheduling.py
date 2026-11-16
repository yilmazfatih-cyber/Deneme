from __future__ import annotations

import itertools

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.cesitli.interval_scheduling import assign_rooms, max_non_overlapping, min_rooms

INTERVAL = st.tuples(st.integers(0, 20), st.integers(1, 6)).map(lambda t: (t[0], t[0] + t[1]))


def _overlap(a: tuple[int, int], b: tuple[int, int]) -> bool:
    return a[0] < b[1] and b[0] < a[1]  # yarı açık aralıklar


def test_hand_checked_example() -> None:
    lectures = [(8, 10), (9, 12), (10, 11), (11, 13), (12, 14)]
    chosen = max_non_overlapping(lectures)
    assert len(chosen) == 3 and chosen == [0, 2, 3]
    assert min_rooms(lectures) == 2


def test_edge_cases() -> None:
    assert max_non_overlapping([]) == [] and min_rooms([]) == 0 and assign_rooms([]) == []
    assert min_rooms([(1, 2), (2, 3), (3, 4)]) == 1  # uç uca eklenen aralıklar çakışmaz
    assert min_rooms([(5, 5), (5, 5)]) == 1  # sıfır uzunluklu
    with pytest.raises(ValueError):
        assign_rooms([(3, 1)])


@given(st.lists(INTERVAL, max_size=10))
def test_matches_brute_force(intervals: list[tuple[int, int]]) -> None:
    def disjoint(group: tuple[int, ...]) -> bool:
        return all(
            not _overlap(intervals[i], intervals[j]) for i, j in itertools.combinations(group, 2)
        )

    indices = range(len(intervals))
    best = max(
        (size for size in range(len(intervals) + 1)
         if any(disjoint(g) for g in itertools.combinations(indices, size))),
        default=0,
    )  # fmt: skip
    chosen = max_non_overlapping(intervals)
    assert len(chosen) == best
    assert all(
        not _overlap(intervals[i], intervals[j]) for i, j in itertools.combinations(chosen, 2)
    )
    depth = max((sum(s <= t < e for s, e in intervals) for t in range(0, 30)), default=0)
    assert min_rooms(intervals) == depth  # salon sayısı = en büyük örtüşme
    rooms = assign_rooms(intervals)
    for i, j in itertools.combinations(range(len(intervals)), 2):
        if _overlap(intervals[i], intervals[j]):
            assert rooms[i] != rooms[j]
