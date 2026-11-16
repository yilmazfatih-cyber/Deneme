from __future__ import annotations

from hypothesis import given
from hypothesis import strategies as st

from algoritma.dizgi.z_algorithm import z_function, z_search


def _common_prefix(a: str, b: str) -> int:
    k = 0
    while k < min(len(a), len(b)) and a[k] == b[k]:
        k += 1
    return k


def test_hand_checked_example() -> None:
    assert z_function("aaaaa") == [5, 4, 3, 2, 1]
    assert z_search("x\x00y\x00", "\x00") == [1, 3]  # metindeki NUL karakter ayraçla karışmaz
    assert z_search("çaycı çay", "çay") == [0, 6]


def test_edge_cases() -> None:
    assert z_function("") == [] and z_search("", "a") == [] and z_search("ab", "") == [0, 1, 2]
    assert z_search("ab", "abc") == []


@given(st.text(alphabet="ab\x00", max_size=40))
def test_z_matches_definition(s: str) -> None:
    expected = [len(s)] + [_common_prefix(s, s[i:]) for i in range(1, len(s))] if s else []
    assert z_function(s) == expected


@given(st.text(alphabet="abğ", max_size=40), st.text(alphabet="abğ", min_size=1, max_size=4))
def test_search_matches_brute_force(text: str, pattern: str) -> None:
    expected = [i for i in range(len(text) - len(pattern) + 1) if text.startswith(pattern, i)]
    assert z_search(text, pattern) == expected
