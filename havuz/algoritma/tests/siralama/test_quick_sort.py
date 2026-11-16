from __future__ import annotations

import random

from hypothesis import given
from hypothesis import strategies as st

from algoritma.siralama.quick_sort import partition3, quick_sort


def test_hand_checked_partition() -> None:
    a = [4, 9, 4, 1, 7, 4, 2]
    lt, gt = partition3(a, 0, len(a) - 1, 4)
    assert (
        sorted(a[:lt]) == [1, 2] and a[lt : gt + 1] == [4, 4, 4] and sorted(a[gt + 1 :]) == [7, 9]
    )


def test_edge_cases() -> None:
    assert quick_sort([]) == [] and quick_sort([1]) == [1]
    assert quick_sort([5] * 10_000) == [5] * 10_000  # tümü eşit: üç yollu bölümleme tek tur
    already = list(range(20_000))
    assert quick_sort(already, rng=random.Random(1)) == already  # sıralı girdi kötü durum değil


@given(st.lists(st.integers(-20, 20), max_size=200), st.integers(0, 1000))
def test_matches_sorted(values: list[int], seed: int) -> None:
    assert quick_sort(values, rng=random.Random(seed)) == sorted(values)


@given(st.lists(st.text(max_size=3), max_size=50))
def test_strings_match_sorted(words: list[str]) -> None:
    assert quick_sort(words) == sorted(words)
