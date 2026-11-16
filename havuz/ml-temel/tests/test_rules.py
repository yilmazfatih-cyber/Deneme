"""Kural testleri: temelin kendi kurallarını korur (STANDARTLAR §7). Kırmızıysa iletiyi okuyun:
ne yapılacağı yazar.
"""

from __future__ import annotations

import ast
import importlib
import inspect
import pkgutil
import re
import tomllib
from pathlib import Path

import pytest

import ml_temel
from ml_temel.ortak.base import BaseEstimator
from ml_temel.registry import SAVEABLE
from ml_temel.tablo.messages import METIN

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "ml_temel"
SOURCES = sorted(PACKAGE.rglob("*.py")) + sorted((ROOT / "scripts").glob("*.py"))
EXAMPLES = sorted((ROOT / "ornekler").glob("0*.py"))  # numaralı örnek betikler
CASE_METHODS = {"lower", "upper", "casefold", "title", "capitalize", "swapcase"}
ALLOWED_IMPORTS = {"numpy", "ml_temel", "__future__"}


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT))


HELPERS = sorted((ROOT / "ornekler").glob("_*.py"))


@pytest.mark.parametrize("path", SOURCES + EXAMPLES + HELPERS, ids=relative)
def test_every_file_opens_with_a_turkish_header(path: Path) -> None:
    docstring = ast.get_docstring(ast.parse(path.read_text(encoding="utf-8")))
    assert docstring, f"{relative(path)}: dosya 3-10 satırlık Türkçe bir başlık yorumuyla açılmalı."
    assert len(docstring.splitlines()) >= 2 or path.name == "__main__.py", relative(path)
    if path.parent != ROOT / "ornekler" and path.name not in (
        "__init__.py",
        "__main__.py",
        "types.py",
    ):
        assert "Genişletme" in docstring, (
            f"{relative(path)}: başlık yorumunda 'Genişletme:' satırı yok; dosyanın nasıl "
            "genişletileceğini bir cümleyle yazın."
        )


@pytest.mark.parametrize("path", SOURCES, ids=relative)
def test_files_stay_small(path: Path) -> None:
    lines = len(path.read_text(encoding="utf-8").splitlines())
    assert lines <= 400, f"{relative(path)} {lines} satır: ~300 satırı aşan dosyayı ikiye bölün."


def test_no_locale_blind_case_conversion() -> None:
    offenders = []
    for path in SOURCES:
        text = path.read_text(encoding="utf-8")
        lines = text.splitlines()
        for node in ast.walk(ast.parse(text)):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr in CASE_METHODS
                and "kural-izni: tr" not in lines[node.lineno - 1]
            ):
                offenders.append(f"{relative(path)}:{node.lineno}")
    assert not offenders, (
        f"Türkçe'yi bozan büyük/küçük harf çağrısı: {offenders}. `ml_temel.ortak.lower_tr` / "
        "`upper_tr` (Türkçe metin) ya da `lower_ascii` (İngilizce anahtar sözcük) kullanın."
    )


def test_only_numpy_and_standard_library_at_runtime() -> None:
    import sys

    stdlib = set(sys.stdlib_module_names)
    offenders = []
    for path in PACKAGE.rglob("*.py"):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            names = []
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                names = [node.module]
            for name in names:
                top = name.split(".")[0]
                if top not in stdlib and top not in ALLOWED_IMPORTS:
                    offenders.append(f"{relative(path)}: {name}")
    assert not offenders, f"Paket yalnız numpy'a bağımlı olmalı (KARARLAR K01): {offenders}"
    project = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"]
    assert [dep.split(">")[0] for dep in project["dependencies"]] == ["numpy"]


def test_no_unfinished_work_markers() -> None:
    pattern = re.compile(r"\b(TODO|FIXME|XXX)\b")
    for path in SOURCES + EXAMPLES:
        text = path.read_text(encoding="utf-8")
        assert not pattern.search(text), f"{relative(path)}: yarım iş işareti bırakılmış."
        for node in ast.walk(ast.parse(text)):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                body = [n for n in node.body if not isinstance(n, ast.Expr)]
                assert not (len(body) == 1 and isinstance(body[0], ast.Pass)), (
                    f"{relative(path)}:{node.lineno} '{node.name}' gövdesi boş (pass)."
                )


def package_classes() -> list[type]:
    found: dict[str, type] = {}
    for module_info in pkgutil.walk_packages(ml_temel.__path__, "ml_temel."):
        module = importlib.import_module(module_info.name)
        for _, cls in inspect.getmembers(module, inspect.isclass):
            if cls.__module__.startswith("ml_temel."):
                found[f"{cls.__module__}.{cls.__name__}"] = cls
    return list(found.values())


def test_every_estimator_is_registered_for_model_files() -> None:
    abstract = {"NamedSteps", "BaseEstimator"}
    missing = [
        cls.__name__
        for cls in package_classes()
        if issubclass(cls, BaseEstimator)
        and not cls.__name__.startswith("_")
        and cls.__name__ not in abstract
        and SAVEABLE.get(cls.__name__) is not cls
    ]
    assert not missing, (
        f"Model dosyasına yazılamayan tahminleyiciler: {missing}. ml_temel/registry.py içindeki "
        "listeye ekleyin (YENİ SINIF BURAYA)."
    )


def test_every_message_key_used_in_code_exists() -> None:
    from ml_temel.klasik.calibration import _make_calibrator  # noqa: F401 - adlar için
    from ml_temel.tablo.candidates import CANDIDATES
    from ml_temel.tablo.evaluation import METRICS

    used: set[str] = set()
    for path in (PACKAGE / "tablo").glob("*.py"):
        if path.name == "messages.py":  # başlığındaki örnek anahtarlar sayılmasın
            continue
        text = path.read_text(encoding="utf-8")
        used |= set(re.findall(r"""\bt\(\s*["']([a-z0-9_]+)["']""", text))
    dynamic = {f"model_{name}" for name in [*CANDIDATES, "taban"]}
    dynamic |= {f"{prefix}_{name}" for prefix in ("olcut", "anlam") for name in METRICS}
    methods = ("yok", "sigmoid", "isotonic")
    dynamic |= {f"{prefix}_{name}" for prefix in ("kalibrasyon", "yontem") for name in methods}
    dynamic |= {f"ayrim_{name}" for name in ("katmanli", "rastgele")}
    missing = sorted((used | dynamic) - set(METIN))
    assert not missing, f"ml_temel/tablo/messages.py'de olmayan metin anahtarları: {missing}"
    unused = sorted(set(METIN) - used - dynamic)
    assert not unused, f"Kullanılmayan metin anahtarları (silin ya da kullanın): {unused}"


def test_sample_csv_is_reproducible(tmp_path: Path) -> None:
    import runpy

    script = runpy.run_path(str(ROOT / "scripts" / "make_sample_data.py"), run_name="kural_testi")
    for written in script["write_all"](tmp_path):
        committed = ROOT / written.relative_to(tmp_path)
        assert committed.read_bytes() == written.read_bytes(), (
            f"{relative(committed)} üreteçle aynı değil: `python scripts/make_sample_data.py` "
            "çalıştırıp dosyayı güncelleyin."
        )


def test_every_example_has_an_expected_output() -> None:
    assert EXAMPLES, "ornekler/ boş olmamalı."
    for path in EXAMPLES:
        expected = ROOT / "ornekler" / "beklenen" / f"{path.stem}.txt"
        assert expected.exists(), (
            f"{relative(path)} için beklenen çıktı yok: `python {relative(path)} > "
            f"{relative(expected)}` ile üretip gözden geçirin."
        )
