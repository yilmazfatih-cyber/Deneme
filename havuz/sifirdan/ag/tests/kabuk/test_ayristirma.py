"""Kabuk ayrıştırıcısı: sözcükler, tırnaklar, işleçler, AST, açılım kuralları ve rastgele girdi."""

from __future__ import annotations

from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st

from kabuk import Op, ParseError, Part, Word, expand_word, parse, tokenize


def words(line: str) -> list[str]:
    return [t.text if isinstance(t, Word) else f"<{t.value}>" for t in tokenize(line)]


@pytest.mark.parametrize(
    ("line", "expected"),
    [
        ("echo  merhaba   dünya", ["echo", "merhaba", "dünya"]),
        ("echo 'tek  tırnak' \"çift  tırnak\"", ["echo", "tek  tırnak", "çift  tırnak"]),
        ('a\\ b c\\"d', ["a b", 'c"d']),
        ("a|b||c&&d;e&", ["a", "<|>", "b", "<||>", "c", "<&&>", "d", "<;>", "e", "<&>"]),
        (
            "cmd >o >>a <i 2>e 2>>f 2>&1 &>h",
            [
                "cmd",
                "<>>",
                "o",
                "<>>>",
                "a",
                "<<>",
                "i",
                "<2>>",
                "e",
                "<2>>>",
                "f",
                "<2>&1>",
                "<&>>",
                "h",
            ],
        ),
        ("a2>b", ["a2", "<>>", "b"]),  # "2>" yalnız sözcük başında işleçtir
        ("echo a # yorum", ["echo", "a"]),
        ("echo a#b", ["echo", "a#b"]),
        ("echo ''", ["echo", ""]),
        ('echo "a\\$b\\\\c\\x"', ["echo", "a$b\\c\\x"]),
    ],
)
def test_sozcukler(line: str, expected: list[str]) -> None:
    assert words(line) == expected


def test_tirnak_bilgisi_korunur() -> None:
    (_, word) = tokenize("echo pre'$X'\"$Y\"")
    assert isinstance(word, Word)
    assert word.parts == (
        Part("pre"),
        Part("$X", quoted=True, expand=False),
        Part("$Y", quoted=True),
    )


@pytest.mark.parametrize(
    "line", ["echo 'açık", 'echo "açık', "| a", "a | | b", "a &&", "&& a", "a >", "a ; ; b", "a 2>"]
)
def test_sozdizimi_hatalari(line: str) -> None:
    with pytest.raises(ParseError):
        parse(line)


def test_agac_yapisi() -> None:
    (first, second) = parse("AD=x cat < a.txt | sort > b.txt && echo tamam || echo olmadı; uyu 1 &")
    pipeline = first.body.first
    assert len(pipeline.commands) == 2
    cat = pipeline.commands[0]
    assert [name for name, _ in cat.assignments] == ["AD"]
    assert [w.text for w in cat.words] == ["cat"]
    assert [(r.op, r.target.text if r.target else None) for r in cat.redirects] == [("<", "a.txt")]
    assert [op for op, _ in first.body.rest] == ["&&", "||"]
    assert not first.background and second.background
    assert parse("X=1")[0].body.first.commands[0].assignments[0][1].text == "1"
    assert parse("'X=1'")[0].body.first.commands[0].words[0].text == "X=1"  # tırnaklı: atama değil


VARIABLES = {"AD": "Ayşe", "BOSLUKLU": "a  b", "BOS": "", "BASTA": " x y "}


def expand(line: str, cwd: Path = Path("/")) -> list[str]:
    command = parse(line)[0].body.first.commands[0]
    return [arg for w in command.words for arg in expand_word(w, VARIABLES.get, cwd)]


@pytest.mark.parametrize(
    ("line", "expected"),
    [
        ("echo $AD ${AD}!", ["echo", "Ayşe", "Ayşe!"]),
        ('echo $BOSLUKLU "$BOSLUKLU"', ["echo", "a", "b", "a  b"]),
        ('echo $BOS "" "$BOS" $YOK', ["echo", "", ""]),
        ("echo ön$BASTA.son", ["echo", "ön", "x", "y", ".son"]),
        ("echo '$AD' \\$AD", ["echo", "$AD", "$AD"]),
        ("echo ${YOK:-varsayılan} ${AD:-kullanılmaz}", ["echo", "varsayılan", "Ayşe"]),
        ("echo $ tek$", ["echo", "$", "tek$"]),
    ],
)
def test_acilim(line: str, expected: list[str]) -> None:
    assert expand(line) == expected


def test_glob_ve_tirnakli_glob(tmp_path: Path) -> None:
    for name in ("b.txt", "a.txt", "c.md", ".gizli.txt"):
        (tmp_path / name).write_text("x")
    assert expand("ls *.txt", tmp_path) == ["ls", "a.txt", "b.txt"]  # sıralı, gizli dosya yok
    assert expand("ls '*.txt' \\*.txt", tmp_path) == ["ls", "*.txt", "*.txt"]
    assert expand("ls *.yok", tmp_path) == ["ls", "*.yok"]  # eşleşme yoksa olduğu gibi
    assert expand("ls ?.md [ab].txt", tmp_path) == ["ls", "c.md", "a.txt", "b.txt"]


def test_ev_dizini() -> None:
    command = parse("cd ~ ~/belgeler '~' a~")[0].body.first.commands[0]
    home = {"HOME": "/ev/ayse"}.get
    result = [arg for w in command.words for arg in expand_word(w, home, Path("/"))]
    assert result == ["cd", "/ev/ayse", "/ev/ayse/belgeler", "~", "a~"]


@given(st.text(max_size=80))
def test_rastgele_satir_cokertmez(line: str) -> None:
    try:
        for item in parse(line):
            for command in item.body.first.commands:
                for word in command.words:
                    expand_word(word, VARIABLES.get, Path("/nonexistent"))
    except ParseError:
        pass


def test_islec_nesnesi() -> None:
    assert tokenize("a;b")[1] == Op(";")
