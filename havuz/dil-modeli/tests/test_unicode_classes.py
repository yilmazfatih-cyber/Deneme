"""Unicode sınıf tabloları: Python ve tarayıcı kopyası aynı, `tokenizers` ile tutarlı."""

from __future__ import annotations

import itertools
import random
import re
from pathlib import Path

import pytest

from dil_modeli import unicode_classes
from dil_modeli.bytelevel import parse_ranges, pretokenize

JS_FILE = Path(__file__).resolve().parent.parent / "tarayici" / "unicode_classes.js"
NAMES = ("LETTER", "NUMBER", "WHITESPACE")


def _js_tables() -> dict[str, str]:
    source = JS_FILE.read_text(encoding="utf-8")
    tables: dict[str, str] = {}
    for name in NAMES:
        match = re.search(rf"export const {name} = \[(.*?)\]\.join", source, re.S)
        assert match, f"{name} tablosu {JS_FILE} içinde yok: python scripts/unicode_tablolari.py"
        tables[name] = " ".join(re.findall(r"'([^']*)'", match.group(1)))
    return tables


def test_python_and_browser_tables_are_identical() -> None:
    js = _js_tables()
    for name in NAMES:
        assert js[name].split() == getattr(unicode_classes, name).split(), (
            f"{name} tabloları farklı. Birlikte yeniden üretin: python scripts/unicode_tablolari.py"
        )


def test_tables_are_sorted_and_disjoint() -> None:
    seen: list[tuple[int, int]] = []
    for name in NAMES:
        ranges = parse_ranges(getattr(unicode_classes, name))
        assert all(lo <= hi for lo, hi in ranges)
        assert all(a[1] < b[0] for a, b in itertools.pairwise(ranges)), name
        seen.extend(ranges)
    seen.sort()
    assert all(a[1] < b[0] for a, b in itertools.pairwise(seen)), "sınıflar çakışıyor"


def _check_code_points(codes: list[int]) -> None:
    tokenizers = pytest.importorskip("tokenizers")
    split = tokenizers.pre_tokenizers.ByteLevel(add_prefix_space=False, use_regex=True)
    for code in codes:
        for text in (f"a{chr(code)}b", f" {chr(code)}{chr(code)}1", f"!{chr(code)} x"):
            expected = [piece for piece, _ in split.pre_tokenize_str(text)]
            assert len(pretokenize(text)) == len(expected), f"U+{code:04X}"


def test_tables_agree_with_tokenizers_on_common_and_random_code_points() -> None:
    rng = random.Random(0)
    common = [c for c in range(0x3100) if not 0xD800 <= c <= 0xDFFF]
    sampled = [c for c in rng.sample(range(0x3100, 0x110000), 20_000) if not 0xD800 <= c <= 0xDFFF]
    _check_code_points(common + sampled)


@pytest.mark.uzun
def test_tables_agree_with_tokenizers_on_every_code_point() -> None:
    _check_code_points([c for c in range(0x110000) if not 0xD800 <= c <= 0xDFFF])
