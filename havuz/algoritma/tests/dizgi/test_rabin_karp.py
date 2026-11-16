from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.dizgi.rabin_karp import rabin_karp_multi, rabin_karp_search


def test_hand_checked_example() -> None:
    dna = "ACGTACGTTACG"
    assert rabin_karp_search(dna, "ACG") == [0, 4, 9]
    assert rabin_karp_multi(dna, ["TTA", "CGT"]) == [(1, 1), (5, 1), (7, 0)]


def test_edge_cases() -> None:
    assert rabin_karp_search("", "a") == [] and rabin_karp_search("ab", "") == [0, 1, 2]
    assert rabin_karp_search("a", "ab") == [] and rabin_karp_multi("abc", []) == []
    with pytest.raises(ValueError):
        rabin_karp_multi("abc", ["a", "bc"])
    # base = 1 ise her pencerenin karması harflerin toplamıdır: çakışmalar bol; doğrulama korur
    assert rabin_karp_search("abba", "ba", base=1) == [2]


@given(st.text(alphabet="abş", max_size=40), st.text(alphabet="abş", min_size=1, max_size=4))
def test_matches_brute_force(text: str, pattern: str) -> None:
    expected = [i for i in range(len(text) - len(pattern) + 1) if text.startswith(pattern, i)]
    assert rabin_karp_search(text, pattern) == expected
    assert rabin_karp_search(text, pattern, base=2) == expected


@given(
    st.text(alphabet="ab", max_size=30),
    st.lists(st.text(alphabet="ab", min_size=3, max_size=3), min_size=1, max_size=4),
)
def test_multi_matches_brute_force(text: str, patterns: list[str]) -> None:
    expected = sorted(
        (i, k) for k, p in enumerate(patterns) for i in range(len(text)) if text.startswith(p, i)
    )
    assert rabin_karp_multi(text, patterns) == expected
