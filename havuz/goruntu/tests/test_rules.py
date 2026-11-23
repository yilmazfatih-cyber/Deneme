"""Kural testleri: temelin kendi kurallarını korur (STANDARTLAR.md §7). İleti düzeltme adımını söyler.
Kaynak: `havuz/ince-ayar/tests/test_rules.py` (uyarlandı)."""

from __future__ import annotations

import ast
import json
import string
import tomllib
from pathlib import Path

import pytest

from goruntu.commands import COMMANDS
from goruntu.config import PRESET_DIR, PRESETS, TINY_MODEL, load_config
from goruntu.messages import MESSAGES
from goruntu.siniflandirma.config import ClassifierConfig
from tests.conftest import ROOT

PACKAGE = ROOT / "goruntu"
SOURCES = sorted(p for p in PACKAGE.rglob("*.py") if "__pycache__" not in p.parts)
LINE_LIMIT = 300
LINE_LIMIT_EXEMPT = {"messages.py"}  # sözlük dosyası veridir
CASE_CALLS = {"lower", "upper", "casefold", "capitalize", "title", "swapcase"}
HEAVY = {
    "torch",
    "torchvision",
    "timm",
    "transformers",
    "onnx",
    "onnxruntime",
    "onnxscript",
    "safetensors",
    "sklearn",
    "uvicorn",
}


def _trees() -> list[tuple[Path, ast.Module]]:
    return [(path, ast.parse(path.read_text(encoding="utf-8"))) for path in SOURCES]


def _message_calls() -> list[tuple[Path, ast.Call]]:
    calls = []
    for path, tree in _trees():
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "t"
            ):
                calls.append((path, node))
    return calls


def _used_keys() -> set[str]:
    used = {
        str(c.args[0].value)
        for _, c in _message_calls()
        if c.args and isinstance(c.args[0], ast.Constant)
    }
    for _, tree in _trees():
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Constant)
                and isinstance(node.value, str)
                and node.value.startswith("yardim.")
            ):
                used.add(node.value)
    return used


def test_kullanilan_her_ileti_sozlukte_var() -> None:
    missing = sorted(_used_keys() - set(MESSAGES))
    assert not missing, (
        f"Sözlükte olmayan anahtarlar: {missing}. `goruntu/messages.py` içine ekleyin."
    )


def test_sozlukte_kullanilmayan_ileti_yok() -> None:
    unused = sorted(set(MESSAGES) - _used_keys())
    assert not unused, f"Kullanılmayan anahtarlar: {unused}. Silin ya da kodda kullanın."


def test_ileti_yer_tutuculari_cagriyla_uyumlu() -> None:
    problems = []
    for path, call in _message_calls():
        if (
            not call.args
            or not isinstance(call.args[0], ast.Constant)
            or any(k.arg is None for k in call.keywords)
        ):
            continue
        key = str(call.args[0].value)
        expected = {
            name for _, name, _, _ in string.Formatter().parse(MESSAGES.get(key, "")) if name
        }
        given = {str(k.arg) for k in call.keywords}
        if given != expected:
            problems.append(
                f"{path.name}:{call.lineno} {key}: verilen {sorted(given)} ≠ beklenen {sorted(expected)}"
            )
    assert not problems, "Yer tutucu uyuşmazlığı (iletiyi ya da çağrıyı düzeltin):\n" + "\n".join(
        problems
    )


def test_python_buyuk_kucuk_harf_cagrisi_yasak() -> None:
    offenders = [
        f"{path.relative_to(ROOT)}:{node.lineno} .{node.func.attr}()"
        for path, tree in _trees()
        if path.name != "text_tr.py"
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in CASE_CALLS
    ]
    assert not offenders, (
        f"Türkçe'de yanlış sonuç verir; `goruntu/text_tr.py` kullanın: {offenders}"
    )


def test_image_open_yalniz_guvenli_yukleyicide() -> None:
    offenders = [
        f"{path.relative_to(ROOT)}:{node.lineno}"
        for path, tree in _trees()
        if path.name != "loader.py"
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "open"
        and isinstance(node.func.value, ast.Name)
        and node.func.value.id == "Image"
    ]
    assert not offenders, f"Görüntüyü `hazirlik.loader.load_rgb/open_checked` ile açın: {offenders}"


def test_agir_kutuphane_modul_basinda_ice_aktarilmaz() -> None:
    offenders = []
    for path, tree in _trees():
        for node in tree.body:
            names = []
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = [node.module]
            offenders += [
                f"{path.relative_to(ROOT)}: {n}" for n in names if n.split(".")[0] in HEAVY
            ]
    assert not offenders, (
        f"Ağır içe aktarmayı işlevin içine taşıyın (yardım anında açılsın): {offenders}"
    )


@pytest.mark.parametrize("path", SOURCES, ids=lambda p: str(p.relative_to(ROOT)))
def test_kaynak_dosya_basligi_ve_uzunlugu(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    docstring = ast.get_docstring(ast.parse(text)) or ""
    assert "Genişletme:" in docstring, f"{path}: başlık yorumuna 'Genişletme:' satırı ekleyin"
    assert path.name.isascii(), f"{path}: kaynak dosya adı İngilizce/ASCII olmalı"
    if path.name not in LINE_LIMIT_EXEMPT:
        lines = len(text.splitlines())
        assert lines <= LINE_LIMIT, (
            f"{path}: {lines} satır; {LINE_LIMIT} satırı aşmayın, dosyayı bölün"
        )


def test_yarim_is_yok() -> None:
    for path, tree in _trees():
        text = path.read_text(encoding="utf-8")
        assert "TODO" not in text and "FIXME" not in text, f"{path}: yarım iş bırakmayın"
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                body = [
                    n
                    for n in node.body
                    if not (isinstance(n, ast.Expr) and isinstance(n.value, ast.Constant))
                ]
                assert not (len(body) == 1 and isinstance(body[0], ast.Pass)), (
                    f"{path}:{node.lineno} boş işlev"
                )


@pytest.mark.parametrize("preset", PRESETS)
def test_hazir_ayarlar_gecerli(preset: str) -> None:
    path = PRESET_DIR / f"{preset}.toml"
    assert path.is_file(), f"{path} eksik: en yakın hazır ayarı kopyalayıp uyarlayın"
    config = load_config(path, ClassifierConfig)
    assert (
        not Path(config.veri.klasor).is_absolute() and not Path(config.egitim.cikti).is_absolute()
    )
    assert config.egitim.cikti == f"ciktilar/{preset}"
    assert (config.model.taban == TINY_MODEL) == (preset == "cpu-deneme")


def test_komut_adlari_ascii_ve_yardimli() -> None:
    for name, command in COMMANDS.items():
        assert name.isascii() and name == name.strip()
        assert command.help_key in MESSAGES


def test_pyproject_ekstralari_ve_havuz_json() -> None:
    project = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"]
    assert {"egitim", "gomme", "onnx", "cikarim", "sunucu", "dev"} <= set(
        project["optional-dependencies"]
    )
    assert {d.split(">")[0] for d in project["dependencies"]} >= {"numpy", "pillow", "pydantic"}
    pool = json.loads((ROOT / "havuz.json").read_text(encoding="utf-8"))
    assert pool["ad"] == "goruntu" and pool["tur"] == "python"
    assert all(
        (ROOT / command.split()[1]).is_file() for command in pool["denetle"] + pool["uzunDenetim"]
    )
