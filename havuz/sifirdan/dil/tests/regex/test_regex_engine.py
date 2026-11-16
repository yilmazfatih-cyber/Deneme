"""Regex motoru örnek testleri: özellikler, Unicode, findall/sub kuralları, hatalar, doğrusallık."""

from __future__ import annotations

import re

import pytest

import regex
from regex.api import Pattern
from regex.compiler import MAX_PROGRAM


def summary(m: regex.Match | re.Match[str] | None) -> object:
    return None if m is None else (m.span(), m.groups())


@pytest.mark.parametrize(
    ("pattern", "text"),
    [
        (r"(\d+)-(\d+)", "tel: 0212-555"),
        (r"[a-zçğıöşü]+", "ÇOK güzel"),
        (r"\w+", "İşçi_3 ağaç"),
        (r"\d", "²٣"),
        (r"\s+", "a\u00a0\t b"),
        (r"[^\d\s]+", "12 ab3"),
        (r"a.c", "a\nc abc"),
        (r"colou?r", "color colour"),
        (r"a{2,3}", "aaaa"),
        (r"a{2,3}?", "aaaa"),
        (r"a{,2}b", "aaab"),
        (r"(a|ab)(c|bcd)(d*)", "abcd"),
        (r"(?:(a)|b)*", "ab"),
        (r"(a*)*", "aa"),
        (r"(|a)*b", "aab"),
        (r"(a*?)*?b", "aab"),
        (r"^ab$", "ab\n"),
        (r"\Aab\Z", "ab\n"),
        (r"\bkar\b", "kartal kar"),
        (r"\Bar\B", "kar kartal"),
        (r"(?P<yil>\d{4})-(?P<ay>\d\d)", "2026-11-16"),
        (r"[]a]+", "]a]b"),
        (r"[a-]+", "-a-b"),
        (r"\x41ç", "Aç"),
        (r"a{1", "a{1"),
        (r"x*", ""),
    ],
)
def test_search_matches_python_re(pattern: str, text: str) -> None:
    assert summary(regex.search(pattern, text)) == summary(re.search(pattern, text))


def test_match_and_fullmatch_anchor_differently() -> None:
    assert regex.match(r"a+", "baa") is None
    m = regex.match(r"a|ab", "ab")
    assert m is not None and m.group() == "a"
    full = regex.fullmatch(r"a|ab", "ab")
    assert full is not None and full.group() == "ab"


def test_match_object_api() -> None:
    m = regex.search(r"(?P<ad>\w+) (?P<soyad>\w+)?(x)?", "Ayşe Yılmaz")
    assert m is not None
    assert m.group() == "Ayşe Yılmaz" and m[1] == "Ayşe" and m["soyad"] == "Yılmaz"
    assert m.groups() == ("Ayşe", "Yılmaz", None)
    assert m.groups("") == ("Ayşe", "Yılmaz", "")
    assert m.groupdict() == {"ad": "Ayşe", "soyad": "Yılmaz"}
    assert m.span(2) == (5, 11) and m.start(3) == -1 and m.end() == 11
    with pytest.raises(IndexError):
        m.group(9)


@pytest.mark.parametrize(
    ("pattern", "text"),
    [
        (r"\b|:+", "a::bc"),
        (r"a|", "baa"),
        (r"a*?", "aa"),
        (r"(a)(b)?", "ab a"),
        (r"\d+", "1, 22 ve 333"),
        (r"$", "a\n"),
    ],
)
def test_findall_follows_re_empty_match_rules(pattern: str, text: str) -> None:
    assert regex.findall(pattern, text) == re.findall(pattern, text)


@pytest.mark.parametrize(
    ("pattern", "repl", "text"),
    [
        ("x*", "-", "abxd"),
        (r"(a)|b", r"[\1]", "ab"),
        (r"(?P<ad>\w+)", r"<\g<ad>>", "iyi gün"),
        (r"(x)", r"\1\0\\n\&\g<0>", "x"),
        (r"(x)", r"\101\n\t", "x"),
        (r"\s+", " ", "çok   boşluk \t var"),
    ],
)
def test_sub_matches_python_re(pattern: str, repl: str, text: str) -> None:
    assert regex.sub(pattern, repl, text) == re.sub(pattern, repl, text)


def test_sub_with_function_and_count() -> None:
    def double(m: regex.Match) -> str:
        return str(int(m.group() or "0") * 2)

    assert regex.sub(r"\d+", double, "3 elma, 12 armut") == "6 elma, 24 armut"
    assert regex.sub(r"a", "b", "aaa", count=2) == "bba"


def test_finditer_spans() -> None:
    assert [m.span() for m in regex.finditer(r"\w+", "bir iki")] == [(0, 3), (4, 7)]


@pytest.mark.parametrize(
    ("pattern", "message"),
    [
        ("*a", "tekrarlanacak bir şey yok"),
        ("{2}", "tekrarlanacak bir şey yok"),
        (r"^*", "tekrarlanacak bir şey yok"),
        ("a**", "üst üste iki niceleyici"),
        ("a*+", "iyelik niceleyicisi"),
        ("a{3,2}", "en az sayısı"),
        ("a{1001}", "tekrar sayısı çok büyük"),
        ("(ab", "grup kapanmadı"),
        ("ab)", "eşi olmayan ')'"),
        ("[ab", "karakter sınıfı kapanmadı"),
        ("[z-a]", "geçersiz aralık z-a"),
        (r"[\d-z]", "uçlar tek karakter"),
        (r"(a)\1", "geri başvuru"),
        ("(?=a)", "ileri/geri bakış"),
        ("(?>a)", "atomik grup"),
        ("(?i)a", "satır içi bayrak"),
        (r"\q", "bilinmeyen kaçış"),
        ("a\\", "ters bölüyle bitemez"),
        (r"\x4", "eksik"),
        ("(?P<1>a)", "geçersiz grup adı"),
        ("(?P<a>x)(?P<a>y)", "iki kez"),
    ],
)
def test_pattern_errors(pattern: str, message: str) -> None:
    with pytest.raises(regex.RegexError) as info:
        regex.compile(pattern)
    assert message in info.value.message
    assert "^" in info.value.render()


def test_pattern_size_is_limited() -> None:
    with pytest.raises(regex.RegexError, match="desen çok büyük"):
        Pattern("(?:(?:a{1000}){1000})")
    assert MAX_PROGRAM >= 10_000


def test_template_errors() -> None:
    with pytest.raises(regex.RegexError, match="geçersiz grup başvurusu"):
        regex.sub("(a)", r"\2", "a")
    with pytest.raises(regex.RegexError, match="bilinmeyen kaçış"):
        regex.sub("a", r"\q", "a")


def steps_for(pattern: str, text: str) -> int:
    compiled = Pattern(pattern)
    compiled.search(text)
    return compiled.stats.steps


def test_catastrophic_pattern_is_linear() -> None:
    small = steps_for(r"(a+)+b", "a" * 500)
    large = steps_for(r"(a+)+b", "a" * 5000)
    program = len(Pattern(r"(a+)+b").program)
    assert large <= 5000 * program  # adım sayısı ≤ metin × program
    assert large / small < 11  # 10 kat uzun metin ≈ 10 kat iş (üstel değil)


def test_nested_quantifiers_do_not_blow_up() -> None:
    assert regex.search(r"(a*)*b", "a" * 3000) is None
    assert regex.fullmatch(r"(?:a|aa)+", "a" * 3000) is not None
