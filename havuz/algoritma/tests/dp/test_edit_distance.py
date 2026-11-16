from __future__ import annotations

from functools import cache

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.dp.edit_distance import apply_edit_script, edit_script


def _recursive_distance(a: str, b: str) -> int:
    """Başvuru: tanımın doğrudan (önbellekli) özyinelemesi."""

    @cache
    def go(i: int, j: int) -> int:
        if i == 0 or j == 0:
            return i + j
        if a[i - 1] == b[j - 1]:
            return go(i - 1, j - 1)
        return 1 + min(go(i - 1, j), go(i, j - 1), go(i - 1, j - 1))

    return go(len(a), len(b))


def test_hand_checked_example() -> None:
    distance, script = edit_script("pazartesi", "perşembe")
    assert distance == 7 and apply_edit_script("pazartesi", script) == "perşembe"
    assert edit_script("ılık", "ilik")[0] == 1  # ı ve i farklı harfler


def test_edge_cases() -> None:
    assert edit_script("", "") == (0, []) and edit_script("ab", "")[0] == 2
    assert edit_script("", "ab") == (2, [("insert", "a"), ("insert", "b")])
    with pytest.raises(ValueError):
        apply_edit_script("ab", [("keep", "x"), ("keep", "b")])
    with pytest.raises(ValueError):
        apply_edit_script("ab", [("keep", "a")])  # metnin tamamı işlenmedi


@given(st.text(alphabet="abğ", max_size=9), st.text(alphabet="abğ", max_size=9))
def test_matches_recursive_definition(a: str, b: str) -> None:
    distance, script = edit_script(a, b)
    assert distance == _recursive_distance(a, b)
    assert apply_edit_script(a, script) == b
    assert sum(op != "keep" for op, _ in script) == distance  # betik en kısadır
