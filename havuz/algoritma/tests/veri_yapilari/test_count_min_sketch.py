from __future__ import annotations

from collections import Counter

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.count_min_sketch import CountMinSketch


def test_hand_checked_sizes() -> None:
    cms = CountMinSketch.from_error(epsilon=0.01, delta=0.01)
    assert (cms.width, cms.depth) == (272, 5)  # ⌈e/ε⌉, ⌈ln(1/δ)⌉


def test_edge_cases() -> None:
    with pytest.raises(ValueError):
        CountMinSketch(0, 3)
    with pytest.raises(ValueError):
        CountMinSketch.from_error(0, 0.5)
    cms = CountMinSketch(4, 2)
    with pytest.raises(ValueError):
        cms.add("x", -1)
    cms.add(b"x", 0)
    assert cms.estimate(b"x") == 0 and cms.total == 0


def test_error_bound_on_skewed_stream() -> None:
    cms = CountMinSketch.from_error(epsilon=0.005, delta=0.01)
    truth: Counter[str] = Counter()
    for i in range(20_000):
        word = f"w{(i * i) % 997}"  # çarpık dağılım
        cms.add(word)
        truth[word] += 1
    bound = 0.005 * cms.total
    errors = [cms.estimate(w) - c for w, c in truth.items()]
    assert min(errors) >= 0  # asla az tahmin etmez
    assert sum(e > bound for e in errors) <= 0.01 * len(errors) + 1


@given(st.lists(st.tuples(st.text(alphabet="abc", max_size=3), st.integers(0, 5)), max_size=60))
def test_never_underestimates(stream: list[tuple[str, int]]) -> None:
    cms = CountMinSketch(width=8, depth=3)  # bilerek küçük: çok çakışma olsun
    truth: Counter[str] = Counter()
    for item, count in stream:
        cms.add(item, count)
        truth[item] += count
    assert all(cms.estimate(item) >= count for item, count in truth.items())
    assert cms.total == sum(truth.values())
