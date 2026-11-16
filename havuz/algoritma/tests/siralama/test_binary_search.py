from __future__ import annotations

import bisect
import math

from hypothesis import given
from hypothesis import strategies as st

from algoritma.siralama.binary_search import (
    bisect_real,
    find_first,
    find_last,
    first_true,
    lower_bound,
    upper_bound,
)


def test_hand_checked_example() -> None:
    days = ["cmt", "cuma", "pazar", "pzt", "salı"]  # sıralı
    assert lower_bound(days, "pazar") == 2 and upper_bound(days, "pazar") == 3
    assert find_first(days, "çar") == -1  # "ç" kod noktası olarak "s"den sonra gelir
    # Yanıt üzerinde arama: 3 işçiyle en geç kaç saatte biter? (iş süreleri bölünmez, sıralı)
    jobs = [7, 2, 5, 10, 8]

    def fits(limit: int) -> bool:
        workers, current = 1, 0
        for job in jobs:
            if current + job > limit:
                workers, current = workers + 1, 0
            current += job
        return workers <= 3

    assert first_true(max(jobs), sum(jobs) + 1, fits) == 14  # [7,2,5] [10] [8] → 14


def test_edge_cases() -> None:
    assert lower_bound([], 5) == 0 and upper_bound([], 5) == 0
    assert find_first([], 1) == -1 and find_last([], 1) == -1
    assert first_true(0, 10, lambda i: False) == 10 and first_true(3, 3, lambda i: True) == 3
    assert first_true(-10, 10, lambda i: i >= -7) == -7  # negatif aralık
    assert math.isclose(bisect_real(0, 10, lambda x: x**3 >= 27), 3.0, rel_tol=1e-12)
    big = 10**18
    assert first_true(0, 2 * big, lambda i: i * i >= big) == 10**9


@given(st.lists(st.integers(-10, 10), max_size=60).map(sorted), st.integers(-12, 12))
def test_matches_bisect_module(values: list[int], x: int) -> None:
    assert lower_bound(values, x) == bisect.bisect_left(values, x)
    assert upper_bound(values, x) == bisect.bisect_right(values, x)
    first = values.index(x) if x in values else -1
    last = len(values) - 1 - values[::-1].index(x) if x in values else -1
    assert (find_first(values, x), find_last(values, x)) == (first, last)


@given(st.integers(-1000, 1000), st.integers(0, 500), st.integers(-1200, 1200))
def test_first_true_matches_linear_scan(lo: int, width: int, threshold: int) -> None:
    hi = lo + width
    expected = next((i for i in range(lo, hi) if i >= threshold), hi)
    assert first_true(lo, hi, lambda i: i >= threshold) == expected
