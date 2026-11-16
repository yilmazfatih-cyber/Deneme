"""Sabit katlama testleri: katlanan/katlanmayan ifadeler; anlam değişmez (örnek programlar)."""

from __future__ import annotations

from pathlib import Path

import pytest

from yorumlayici import Interpreter, dump, parse
from yorumlayici.natives import make_builtins
from yorumlayici.optimize import fold_constants
from yorumlayici.resolver import resolve

EXAMPLES = sorted((Path(__file__).parents[2] / "yorumlayici" / "ornekler").glob("*.tohum"))


def folded(source: str) -> tuple[str, int]:
    program = parse(source)
    resolve(program, set(make_builtins()) | {"x", "f"})
    result, count = fold_constants(program)
    return " ".join(dump(s) for s in result.body), count


@pytest.mark.parametrize(
    ("source", "expected", "count"),
    [
        ("2 * 3 + x", "(+ 6 x)", 1),
        ("60 * 60 * 24", "86400", 2),
        ('"Mer" + "haba"', "'Merhaba'", 1),
        ("-(2 ** 3)", "-8", 2),
        ("değil (1 < 2)", "yanlış", 2),
        ("yanlış ve f()", "yanlış", 1),
        ("yok veya x", "(veya yok x)", 0),
        ("yok veya 7", "7", 1),
        ("1 / 0", "(/ 1 0)", 0),
        ('"a" + 1', "(+ 'a' 1)", 0),
        ("x + 1 + 2", "(+ (+ x 1) 2)", 0),
        ("işlev() { döndür 2 * 21 }", "(işlev <adsız> () (blok (döndür 42)))", 1),
        ("[1 + 1, {3 * 3: 4 - 4}]", "(liste 2 (sözlük (9 0)))", 3),
    ],
)
def test_folding(source: str, expected: str, count: int) -> None:
    assert folded(source) == (expected, count)


def test_original_tree_is_not_changed() -> None:
    program = parse("yazdır(1 + 2)")
    before = dump(program)
    fold_constants(program)
    assert dump(program) == before


def test_errors_inside_dead_branch_are_still_reported_statically() -> None:
    out: list[str] = []
    with pytest.raises(Exception, match="tanımlı değil"):
        Interpreter(out.append, optimize=True).run("yazdır(yanlış ve tanimsiz_ad)")


@pytest.mark.parametrize("path", EXAMPLES, ids=[p.stem for p in EXAMPLES])
def test_examples_unchanged_by_folding(path: Path) -> None:
    out: list[str] = []
    Interpreter(out.append, optimize=True).run(path.read_text(encoding="utf-8"))
    assert "".join(out) == path.with_suffix(".beklenen").read_text(encoding="utf-8")
