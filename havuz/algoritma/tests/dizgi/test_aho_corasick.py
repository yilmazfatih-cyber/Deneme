from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.dizgi.aho_corasick import AhoCorasick


def test_hand_checked_example() -> None:
    banned = ["kötü", "söz", "kötü söz"]
    found = AhoCorasick(banned).search("bu kötü söz değil")
    assert found == [(3, 0), (3, 2), (8, 1)]
    assert AhoCorasick(["a", "aa"]).search("aaa") == [(0, 0), (0, 1), (1, 0), (1, 1), (2, 0)]


def test_edge_cases() -> None:
    assert AhoCorasick([]).search("metin") == []
    assert AhoCorasick(["x"]).search("") == []
    assert AhoCorasick(["ab", "ab"]).search("ab") == [(0, 0), (0, 1)]  # yinelenen desen
    with pytest.raises(ValueError):
        AhoCorasick(["a", ""])


@given(
    st.text(alphabet="abç", max_size=40),
    st.lists(st.text(alphabet="abç", min_size=1, max_size=4), max_size=6),
)
def test_matches_brute_force(text: str, patterns: list[str]) -> None:
    expected = sorted(
        (i, k) for k, p in enumerate(patterns) for i in range(len(text)) if text.startswith(p, i)
    )
    assert AhoCorasick(patterns).search(text) == expected
