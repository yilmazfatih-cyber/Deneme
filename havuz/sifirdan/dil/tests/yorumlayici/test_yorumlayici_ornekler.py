"""Örnek programlar: her `ornekler/*.tohum` çıktısı yanındaki `.beklenen` ile aynı olmalı."""

from __future__ import annotations

from pathlib import Path

import pytest

from yorumlayici import run

EXAMPLES = sorted((Path(__file__).parents[2] / "yorumlayici" / "ornekler").glob("*.tohum"))


def test_there_are_ten_to_fifteen_examples() -> None:
    assert 10 <= len(EXAMPLES) <= 15


@pytest.mark.parametrize("path", EXAMPLES, ids=[p.stem for p in EXAMPLES])
def test_example_output_matches_expected(path: Path) -> None:
    expected = path.with_suffix(".beklenen").read_text(encoding="utf-8")
    assert run(path.read_text(encoding="utf-8")) == expected
