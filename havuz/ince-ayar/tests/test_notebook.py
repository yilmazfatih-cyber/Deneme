"""Colab defteri: geçerli nbformat 4 JSON'u; içindeki her `python -m ince_ayar` komutu bu sürümün
komut satırında var, hazır ayarları ve `-D` değişiklikleri şemadan geçiyor."""

from __future__ import annotations

import json
import shlex
from typing import Any

import pytest

from ince_ayar.actions import load_task_config
from ince_ayar.cli import build_parser
from tests.conftest import ROOT
from tests.test_rules import SCHEMAS

NOTEBOOK = ROOT / "defterler" / "ince_ayar_colab.ipynb"


def _notebook() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(NOTEBOOK.read_text(encoding="utf-8"))
    return data


def _commands() -> list[list[str]]:
    found = []
    for cell in _notebook()["cells"]:
        if cell["cell_type"] != "code":
            continue
        for line in "".join(cell["source"]).splitlines():
            if line.startswith("!python -m ince_ayar "):
                found.append(shlex.split(line.removeprefix("!python -m ince_ayar ")))
    return found


def test_defter_gecerli_nbformat() -> None:
    data = _notebook()
    assert data["nbformat"] == 4 and data["metadata"]["kernelspec"]["language"] == "python"
    ids = [cell["id"] for cell in data["cells"]]
    assert len(ids) == len(set(ids))
    for cell in data["cells"]:
        assert cell["cell_type"] in {"code", "markdown"} and isinstance(cell["source"], list)
        if cell["cell_type"] == "code":
            assert cell["outputs"] == [] and cell["execution_count"] is None  # temiz defter


def test_defter_temel_klasorunu_dogru_cekiyor() -> None:
    pool = json.loads((ROOT / "havuz.json").read_text(encoding="utf-8"))
    placeholders = {item["ara"] for item in pool["yerTutucular"]}
    source = "".join("".join(cell["source"]) for cell in _notebook()["cells"])
    assert all(
        value in source for value in placeholders if value.startswith(("https://", "havuz/"))
    )


@pytest.mark.parametrize("argv", _commands(), ids=lambda argv: " ".join(argv[:2]))
def test_defterdeki_komutlar_var_ve_ayarlari_gecerli(
    argv: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(ROOT)
    args = build_parser().parse_args(argv)
    if getattr(args, "hazir", None):
        load_task_config(args, args.gorev, SCHEMAS[args.gorev])


def test_defter_her_gorevi_kapsiyor() -> None:
    tasks = {argv[0] for argv in _commands()}
    assert {"sohbet", "siniflandirma", "gomme"} <= tasks
    actions = {(argv[0], argv[1]) for argv in _commands()}
    assert ("sohbet", "birlestir") in actions and ("sohbet", "disa-aktar") in actions
