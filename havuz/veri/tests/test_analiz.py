"""docs/ANALIZ_TARIFLERI.md içindeki her SQL tarifinin çıktısı belgedekiyle aynı mı? (DuckDB ister)"""

from __future__ import annotations

import pytest

from verihavuzu.analiz import DOC, recipes, run_sql
from verihavuzu.paths import root_dir

pytest.importorskip("duckdb")
RECIPES = recipes((root_dir() / DOC).read_text(encoding="utf-8"))


def test_document_has_enough_recipes() -> None:
    assert 10 <= len(RECIPES) <= 15


@pytest.mark.parametrize(
    ("sql", "expected"), RECIPES, ids=[f"tarif{i}" for i in range(1, len(RECIPES) + 1)]
)
def test_recipe_output_matches_document(sql: str, expected: str) -> None:
    assert run_sql(sql, root_dir()) == expected, (
        "Bilerek değiştiyse: python -m verihavuzu.analiz --yaz"
    )
