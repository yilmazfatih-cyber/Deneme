from __future__ import annotations

import itertools

from hypothesis import given
from hypothesis import strategies as st

from algoritma.dp.lcs import diff, longest_common_subsequence


def _is_subsequence(small: list[str], big: str) -> bool:
    it = iter(big)
    return all(char in it for char in small)


def _brute_force_length(a: str, b: str) -> int:
    for size in range(min(len(a), len(b)), -1, -1):
        for picked in itertools.combinations(a, size):
            if _is_subsequence(list(picked), b):
                return size
    return 0


def test_hand_checked_example() -> None:
    old = ["Merhaba", "dünya", "nasılsın", "?"]
    new = ["Merhaba", "güzel", "dünya", "?"]
    assert diff(old, new) == [
        (" ", "Merhaba"), ("+", "güzel"), (" ", "dünya"), ("-", "nasılsın"), (" ", "?"),
    ]  # fmt: skip
    assert "".join(longest_common_subsequence("çağrı", "çarşı")) == "çarı"


def test_edge_cases() -> None:
    assert longest_common_subsequence("", "abc") == [] and diff([], []) == []
    assert diff("ab", "") == [("-", "a"), ("-", "b")] and diff("", "x") == [("+", "x")]
    assert longest_common_subsequence([1, 2, 3], [1, 2, 3]) == [1, 2, 3]


@given(st.text(alphabet="abc", max_size=8), st.text(alphabet="abc", max_size=8))
def test_matches_brute_force(a: str, b: str) -> None:
    common = longest_common_subsequence(a, b)
    assert len(common) == _brute_force_length(a, b)
    assert _is_subsequence(common, a) and _is_subsequence(common, b)
    script = diff(a, b)
    assert "".join(x for op, x in script if op != "+") == a  # eski metin geri kurulur
    assert "".join(x for op, x in script if op != "-") == b  # yeni metin geri kurulur
    assert sum(op == " " for op, _ in script) == len(common)  # en az değişiklik
