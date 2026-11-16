"""Kural testleri: temelin kendi kurallarını korur (STANDARTLAR.md §7). İleti düzeltme adımını söyler."""

from __future__ import annotations

import ast
import json
import string
import tomllib
from pathlib import Path

import pytest
from pydantic import BaseModel

from ince_ayar.config import PRESETS, load_config
from ince_ayar.messages import MESSAGES, REPORT_FIELDS
from ince_ayar.registry import MODEL_TASKS, TASKS
from ince_ayar.tasks.chat.config import ChatConfig
from ince_ayar.tasks.classification.config import ClassificationConfig
from ince_ayar.tasks.embedding.config import EmbeddingConfig
from ince_ayar.tasks.ner.config import NerConfig
from tests.conftest import EXAMPLES, ROOT

PACKAGE = ROOT / "ince_ayar"
SOURCES = sorted(p for p in PACKAGE.rglob("*.py") if "__pycache__" not in p.parts)
SCHEMAS: dict[str, type[BaseModel]] = {
    "sohbet": ChatConfig,
    "siniflandirma": ClassificationConfig,
    "gomme": EmbeddingConfig,
    "varlik": NerConfig,
}
LINE_LIMIT = 300
LINE_LIMIT_EXEMPT = {"messages.py"}  # sözlük dosyası veridir
CASE_CALLS = {"lower", "upper", "casefold", "capitalize", "title", "swapcase"}


def _calls(name: str) -> list[tuple[Path, ast.Call]]:
    found = []
    for path in SOURCES:
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == name
            ):
                found.append((path, node))
    return found


def _used_message_keys() -> dict[str, list[tuple[Path, ast.Call]]]:
    used: dict[str, list[tuple[Path, ast.Call]]] = {}
    for function in ("t", "headers"):
        for path, call in _calls(function):
            if call.args and isinstance(call.args[0], ast.Constant):
                used.setdefault(str(call.args[0].value), []).append((path, call))
    for path in SOURCES:
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if (
                isinstance(node, ast.Constant)
                and isinstance(node.value, str)
                and node.value.startswith("yardim.")
            ):
                used.setdefault(node.value, [])
    return used


def test_kullanilan_her_ileti_sozlukte_var() -> None:
    missing = sorted(set(_used_message_keys()) - set(MESSAGES))
    assert not missing, (
        f"Sözlükte olmayan anahtarlar: {missing}. `ince_ayar/messages.py` içine ekleyin."
    )


def test_sozlukte_kullanilmayan_ileti_yok() -> None:
    unused = sorted(set(MESSAGES) - set(_used_message_keys()))
    assert not unused, f"Kullanılmayan anahtarlar: {unused}. Silin ya da kodda kullanın."


def test_ileti_yer_tutuculari_cagriyla_uyumlu() -> None:
    problems = []
    for key, uses in _used_message_keys().items():
        fields = {name for _, name, _, _ in string.Formatter().parse(MESSAGES.get(key, "")) if name}
        for path, call in uses:
            if call.func.id != "t" or any(k.arg is None for k in call.keywords):  # type: ignore[attr-defined]
                continue  # **sözlük açılımı: statik denetlenemez
            given = {str(k.arg) for k in call.keywords}
            if given != fields:
                problems.append(
                    f"{path.name}:{call.lineno} {key}: verilen {sorted(given)} ≠ beklenen {sorted(fields)}"
                )
    assert not problems, "Yer tutucu uyuşmazlığı (iletiyi ya da çağrıyı düzeltin):\n" + "\n".join(
        problems
    )


def test_python_buyuk_kucuk_harf_cagrisi_yasak() -> None:
    offenders = []
    for path in SOURCES:
        if path.name == "text_tr.py":
            continue
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr in CASE_CALLS
            ):
                offenders.append(f"{path.relative_to(ROOT)}:{node.lineno} .{node.func.attr}()")
    assert not offenders, (
        f"Türkçe'de yanlış sonuç verir; `ince_ayar/text_tr.py` kullanın: {offenders}"
    )


@pytest.mark.parametrize("path", SOURCES, ids=lambda p: str(p.relative_to(ROOT)))
def test_kaynak_dosya_basligi_ve_uzunlugu(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if path.name == "__init__.py" and not text.strip():
        return
    docstring = ast.get_docstring(ast.parse(text)) or ""
    assert "Genişletme:" in docstring, f"{path}: başlık yorumuna 'Genişletme:' satırı ekleyin"
    if path.name not in LINE_LIMIT_EXEMPT:
        lines = len(text.splitlines())
        assert lines <= LINE_LIMIT, (
            f"{path}: {lines} satır; {LINE_LIMIT} satırı aşmayın, dosyayı bölün"
        )


def test_yarim_is_yok() -> None:
    for path in SOURCES:
        text = path.read_text(encoding="utf-8")
        assert "TODO" not in text and "FIXME" not in text, f"{path}: yarım iş bırakmayın"
        for node in ast.walk(ast.parse(text)):
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                body = [
                    n
                    for n in node.body
                    if not (isinstance(n, ast.Expr) and isinstance(n.value, ast.Constant))
                ]
                assert not (len(body) == 1 and isinstance(body[0], ast.Pass)), (
                    f"{path}:{node.lineno} boş işlev"
                )


@pytest.mark.parametrize(("task", "preset"), [(t, p) for t in MODEL_TASKS for p in PRESETS])
def test_her_gorevin_uc_hazir_ayari_gecerli(task: str, preset: str) -> None:
    path = ROOT / "yapilandirma" / task / f"{preset}.toml"
    assert path.is_file(), (
        f"{path} eksik: en yakın görevin aynı adlı dosyasını kopyalayıp uyarlayın"
    )
    config = load_config(path, SCHEMAS[task])
    assert config.gorev == task  # type: ignore[attr-defined]
    assert (ROOT / config.veri.egitim).is_file()  # type: ignore[attr-defined]


def test_gorev_adlari_ascii_turkce() -> None:
    for name, spec in TASKS.items():
        assert name.isascii() and name == spec.name
        assert all(action.isascii() for action in spec.actions)


def test_rapor_alanlari_tanimli() -> None:
    for path, call in _calls("summary_rows"):
        keys = call.args[1]
        if isinstance(keys, ast.Tuple | ast.List):
            for element in keys.elts:
                assert isinstance(element, ast.Constant) and element.value in REPORT_FIELDS, (
                    f"{path}:{call.lineno}"
                )
        elif isinstance(keys, ast.Name):
            continue  # değişken: aynı dosyadaki demet `keys = (...)` aşağıda denetlenir
    for path in SOURCES:
        text = path.read_text(encoding="utf-8")
        if "summary_rows" not in text:
            continue
        for node in ast.walk(ast.parse(text)):
            is_keys = isinstance(node, ast.Assign) and any(
                isinstance(target, ast.Name) and target.id == "keys" for target in node.targets
            )
            if is_keys and isinstance(node.value, ast.Tuple):  # type: ignore[attr-defined]
                missing = [
                    e.value
                    for e in node.value.elts  # type: ignore[attr-defined]
                    if isinstance(e, ast.Constant) and e.value not in REPORT_FIELDS
                ]
                assert not missing, f"{path}: REPORT_FIELDS içine ekleyin: {missing}"


def test_ornek_veri_kaynak_kaydi_ve_boyutu() -> None:
    record = json.loads((EXAMPLES / "kaynaklar.json").read_text(encoding="utf-8"))["dosyalar"]
    for path in sorted(EXAMPLES.iterdir()):
        if path.name == "kaynaklar.json":
            continue
        assert path.name in record, (
            f"{path.name} için ornekler/kaynaklar.json içine kaynak ve lisans yazın"
        )
        lines = len(path.read_text(encoding="utf-8").splitlines())
        assert lines <= 50, f"{path.name}: örnek veri birkaç on satırı geçmemeli ({lines})"
        assert record[path.name]["lisans"] and record[path.name]["kaynak"]


def test_pyproject_ekstralari_ve_havuz_json() -> None:
    project = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"]
    assert {"dev", "egitim", "gomme", "onnx"} <= set(project["optional-dependencies"])
    pool = json.loads((ROOT / "havuz.json").read_text(encoding="utf-8"))
    assert pool["ad"] == "ince-ayar" and pool["tur"] == "python"
    assert all((ROOT / command.split()[1]).is_file() for command in pool["denetle"])
