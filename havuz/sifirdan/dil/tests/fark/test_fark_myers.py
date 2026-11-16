"""Myers algoritması testleri: en kısa düzenleme (kaba kuvvet LCS ile), difflib ile karşılaştırma.

difflib.SequenceMatcher en kısa farkı garanti ETMEZ (Ratcliff/Obershelp sezgiseli); bu yüzden
farksal ölçüt: bizim D'miz kaba kuvvet en iyisine EŞİT ve difflib'in D'sinden KÜÇÜK YA DA EŞİT.
"""

from __future__ import annotations

import difflib
import itertools
import time
from collections.abc import Sequence

from hypothesis import given
from hypothesis import strategies as st

from fark import edit_distance, matches, opcodes
from fark.myers import matching_blocks

SEQS = st.lists(st.sampled_from("abcd"), max_size=14)


def brute_force_lcs(a: list[str], b: list[str]) -> int:
    table = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(len(a) - 1, -1, -1):
        for j in range(len(b) - 1, -1, -1):
            if a[i] == b[j]:
                table[i][j] = table[i + 1][j + 1] + 1
            else:
                table[i][j] = max(table[i + 1][j], table[i][j + 1])
    return table[0][0]


def distance_of(codes: Sequence[tuple[str, int, int, int, int]]) -> int:
    return sum((i2 - i1) + (j2 - j1) for tag, i1, i2, j1, j2 in codes if tag != "equal")


@given(SEQS, SEQS)
def test_matches_are_a_longest_common_subsequence(a: list[str], b: list[str]) -> None:
    pairs = matches(a, b)
    assert all(a[i] == b[j] for i, j in pairs)
    assert all(p[0] < q[0] and p[1] < q[1] for p, q in itertools.pairwise(pairs))
    assert len(pairs) == brute_force_lcs(a, b)


@given(SEQS, SEQS)
def test_opcodes_rebuild_b_and_are_minimal(a: list[str], b: list[str]) -> None:
    rebuilt: list[str] = []
    for tag, i1, i2, j1, j2 in opcodes(a, b):
        if tag == "equal":
            assert a[i1:i2] == b[j1:j2]
            rebuilt += a[i1:i2]
        elif tag in ("replace", "insert"):
            rebuilt += b[j1:j2]
    assert rebuilt == b
    assert (
        distance_of(opcodes(a, b))
        == edit_distance(a, b)
        == len(a) + len(b) - 2 * brute_force_lcs(a, b)
    )


@given(SEQS, SEQS)
def test_never_longer_than_difflib(a: list[str], b: list[str]) -> None:
    ours = distance_of(opcodes(a, b))
    theirs = distance_of(difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes())
    assert ours <= theirs


def test_known_example_from_myers_paper() -> None:
    assert edit_distance(list("ABCABBA"), list("CBABAC")) == 5
    assert distance_of(opcodes(list("ABCABBA"), list("CBABAC"))) == 5


def test_matching_blocks_format() -> None:
    blocks = matching_blocks(list("abxcd"), list("abcd"))
    assert blocks == [(0, 0, 2), (3, 2, 2), (5, 4, 0)]


def test_edge_cases() -> None:
    assert opcodes([], []) == []
    assert opcodes(["a"], []) == [("delete", 0, 1, 0, 0)]
    assert opcodes([], ["a"]) == [("insert", 0, 0, 0, 1)]
    assert opcodes(["a", "b"], ["a", "b"]) == [("equal", 0, 2, 0, 2)]


def test_large_input_with_few_changes_is_fast() -> None:
    a = [f"satır {i}\n" for i in range(20_000)]
    b = list(a)
    b[100] = "değişti\n"
    del b[15_000]
    b.insert(7_000, "eklendi\n")
    started = time.perf_counter()
    assert edit_distance(a, b) == distance_of(opcodes(a, b)) == 4
    assert time.perf_counter() - started < 10
