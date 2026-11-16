from __future__ import annotations

from hypothesis import given
from hypothesis import strategies as st

from algoritma.dizgi.longest_common_substring import longest_common_substring


def test_hand_checked_example() -> None:
    assert longest_common_substring("kalemlik", "silgilik") == "lik"
    assert longest_common_substring("abcXdef", "defYabc") == "abc"  # eşitlikte a'da önce biten


def test_edge_cases() -> None:
    assert longest_common_substring("", "abc") == "" and longest_common_substring("abc", "") == ""
    assert longest_common_substring("aaaa", "aa") == "aa"


@given(st.text(alphabet="abş", max_size=15), st.text(alphabet="abş", max_size=15))
def test_matches_brute_force(a: str, b: str) -> None:
    common = [a[i:j] for i in range(len(a)) for j in range(i + 1, len(a) + 1) if a[i:j] in b]
    best = max((len(s) for s in common), default=0)
    result = longest_common_substring(a, b)
    assert len(result) == best and result in a and result in b
    first_end = min((j for j in range(len(a) + 1) if j >= best and a[j - best : j] in b), default=0)
    assert result == a[first_end - best : first_end]
