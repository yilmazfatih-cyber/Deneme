"""Farksal test (hypothesis): rastgele desen + metinlerde sonuç Python `re` ile aynı olmalı.

Desenler desteklenen alt kümeden üretilir: değişmezler, `.`, sınıflar, \\d \\w \\s, çapalar,
açgözlü/tembel niceleyiciler, {m,n}, almaşma, yakalayan/yakalamayan gruplar, boş dallar
(`(|a)*` gibi boş tur durumları dahil). Karşılaştırılanlar: search/match/fullmatch (konum +
tüm grupların konumları), findall ve sub. Metinler kısa tutulur ki `re`'nin üstel geri izlemesi
testi yavaşlatmasın.
"""

from __future__ import annotations

import re

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

import regex

ATOMS = ["a", "b", "c", "ç", "", ".", "[ab]", "[^a]", "[a-c]", r"\d", r"\w", r"\s", r"\W", "1"]
ANCHORS = ["^", "$", r"\b", r"\B", r"\A", r"\Z"]
QUANTIFIERS = ["*", "+", "?", "*?", "+?", "??", "{2}", "{1,2}", "{0,2}", "{2,}", "{,2}", "{1,3}?"]


def combine(children: st.SearchStrategy[str]) -> st.SearchStrategy[str]:
    return st.one_of(
        st.tuples(children, children).map(lambda t: t[0] + t[1]),
        st.tuples(children, children).map(lambda t: f"{t[0]}|{t[1]}"),
        children.map(lambda c: f"({c})"),
        children.map(lambda c: f"(?:{c})"),
        st.tuples(children, st.sampled_from(QUANTIFIERS)).map(lambda t: f"(?:{t[0]}){t[1]}"),
        st.tuples(children, st.sampled_from(QUANTIFIERS)).map(lambda t: f"({t[0]}){t[1]}"),
    )


PATTERNS = st.recursive(st.sampled_from(ATOMS + ANCHORS), combine, max_leaves=7)
TEXTS = st.text(alphabet="abcç1 _\n", max_size=8)


def full_summary(m: regex.Match | re.Match[str] | None, groups: int) -> object:
    if m is None:
        return None
    return [m.span(i) for i in range(groups + 1)]


def compare(pattern: str, text: str) -> None:
    if r"\B" in pattern and text == "":
        return  # Python ≤3.13'te \B boş metinde eşleşmez, 3.14+ eşleşir; bu motor 3.14 gibidir
    ref = re.compile(pattern)
    ours = regex.compile(pattern)
    assert ours.groups == ref.groups
    for name in ("search", "match", "fullmatch"):
        expected = full_summary(getattr(ref, name)(text), ref.groups)
        assert full_summary(getattr(ours, name)(text), ours.groups) == expected, name
    assert ours.findall(text) == ref.findall(text)
    template = "<\\g<0>" + "".join(f"\\{i}" for i in range(1, min(ref.groups, 3) + 1)) + ">"
    assert ours.sub(template, text) == ref.sub(template, text)


@given(PATTERNS, TEXTS)
def test_random_patterns_agree_with_re(pattern: str, text: str) -> None:
    compare(pattern, text)


@pytest.mark.yavas
@given(PATTERNS, TEXTS)
@settings(max_examples=5000)
def test_many_random_patterns_agree_with_re(pattern: str, text: str) -> None:
    compare(pattern, text)


@pytest.mark.parametrize(
    "pattern",
    ["(|a)*", "(a*)+", "(a|)+?b", "((a)|b)*?c", "(?:a|()){3}", "(a{0,2}){2,3}", "(a|){2,3}x"],
)
@pytest.mark.parametrize("text", ["", "a", "aa", "aab", "abbac", "aaaaa", "ax"])
def test_empty_iteration_corner_cases(pattern: str, text: str) -> None:
    compare(pattern, text)
