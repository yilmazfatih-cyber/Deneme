"""Kural testleri: dizinin değişmez kurallarını korur (STANDARTLAR.md §6–7).

Her kural bir test; kalan testin iletisi NEYİN ve NASIL düzeltileceğini söyler.
Yeni mini sistem eklerken `SYSTEMS` listesine adını yazın (pyproject.toml'daki listeyle aynı).
"""

from __future__ import annotations

import ast
import json
import re
import sys
import tomllib
import unicodedata
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
# YENİ MİNİ SİSTEM BURAYA (pyproject.toml [tool.setuptools.packages.find] ile aynı sıra).
SYSTEMS = [
    "yorumlayici",
    "sanal_makine",
    "regex",
    "json_ayristirici",
    "sablon",
    "markdown",
    "hesap",
    "fark",
    "test_cercevesi",
]
# İzin verilen paketler arası bağımlılıklar (paket -> içe aktarabileceği kardeşler).
ALLOWED_SIBLINGS = {"sanal_makine": {"yorumlayici"}}
MAX_LINES = 320  # yumuşak sınır ~300; aşan dosyayı bölün
README_SECTIONS = ["## Nasıl çalışır", "## Dosya haritası", "## Sınırlar", "## Buradan nereye"]
CASE_CALLS = {"upper", "lower", "capitalize", "title", "casefold", "swapcase"}
EXEC_ALLOWED = {"test_cercevesi/rewrite.py"}


def source_files() -> list[Path]:
    files = []
    for system in SYSTEMS:
        for path in sorted((ROOT / system).rglob("*.py")):
            if "ornekler" not in path.relative_to(ROOT).parts[1]:
                files.append(path)
    return files


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def test_systems_list_matches_pyproject() -> None:
    config = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    include = config["tool"]["setuptools"]["packages"]["find"]["include"]
    assert [name.rstrip("*") for name in include] == SYSTEMS, (
        "pyproject.toml include listesi ile tests/test_kurallar.py SYSTEMS listesi aynı olmalı"
    )
    assert config["project"]["dependencies"] == [], "çalışma zamanı bağımlılığı eklenmemeli"


@pytest.mark.parametrize("system", SYSTEMS)
def test_each_system_has_readme_sections_and_tests(system: str) -> None:
    readme = ROOT / system / "README.md"
    assert readme.is_file(), f"{system}/README.md eksik: ne yapar, nasıl çalışır, sınırlar…"
    text = readme.read_text(encoding="utf-8")
    for section in README_SECTIONS:
        assert section in text, f"{system}/README.md içinde '{section}' bölümü eksik"
    assert (ROOT / system / "__init__.py").is_file()
    assert list((ROOT / "tests" / system).glob("test_*.py")), f"tests/{system}/ altında test yok"


@pytest.mark.parametrize("path", source_files(), ids=rel)
def test_source_file_rules(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    tree = ast.parse(text)
    doc = ast.get_docstring(tree)
    assert doc, f"{rel(path)}: dosya Türkçe bir başlık yorumuyla (docstring) açılmalı"
    assert "Genişletme:" in doc, f"{rel(path)}: başlık yorumuna 'Genişletme:' satırı ekleyin"
    lines = text.count("\n")
    assert lines <= MAX_LINES, f"{rel(path)}: {lines} satır; ~300'ü aşan dosyayı bölün"
    assert "TODO" not in text and "FIXME" not in text, f"{rel(path)}: yarım iş işareti bırakmayın"


@pytest.mark.parametrize("path", source_files(), ids=rel)
def test_only_stdlib_and_allowed_sibling_imports(path: Path) -> None:
    system = rel(path).split("/")[0]
    allowed = set(sys.stdlib_module_names) | {system} | ALLOWED_SIBLINGS.get(system, set())
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        names: list[str] = []
        if isinstance(node, ast.Import):
            names = [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            names = [node.module]
        for name in names:
            top = name.split(".")[0]
            assert top in allowed, (
                f"{rel(path)}: '{name}' içe aktarılamaz — paketler yalnız standart kitaplığı "
                f"kullanır (izinli kardeşler: {sorted(ALLOWED_SIBLINGS.get(system, set()))})"
            )


@pytest.mark.parametrize("path", source_files(), ids=rel)
def test_no_eval_exec_and_no_unsafe_case_calls(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    tree = ast.parse(text)
    bound = {  # modülün kendi tanımladığı adlar (ör. regex'in kendi `compile` işlevi)
        name
        for node in ast.walk(tree)
        for name in (
            [node.name]
            if isinstance(node, ast.FunctionDef)
            else [a.asname or a.name for a in node.names]
            if isinstance(node, ast.ImportFrom)
            else []
        )
    }
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if isinstance(func, ast.Name) and func.id not in bound:
            if func.id in ("eval", "exec", "compile", "__import__"):
                assert rel(path) in EXEC_ALLOWED, f"{rel(path)}:{node.lineno}: {func.id}() yasak"
        if isinstance(func, ast.Attribute) and func.attr in CASE_CALLS and not node.args:
            line = lines[node.lineno - 1]
            assert "tr-güvenli" in line, (
                f"{rel(path)}:{node.lineno}: .{func.attr}() Türkçe'de yanlış (i/İ, ı/I). "
                "upper_tr/lower_tr kullanın ya da güvenliyse satıra '# tr-güvenli: neden' ekleyin"
            )


def invisible(ch: str) -> bool:
    """Görünmez/birleşen karakter mi (BOM, sıfır genişlikli/bölünmez boşluk, yön, birleşen)?"""
    category = unicodedata.category(ch)
    if category in ("Cf", "Zl", "Zp", "Mn") or (category == "Zs" and ch != " "):
        return True
    return category == "Cc" and ch not in "\n\t\r"


def text_files() -> list[Path]:
    suffixes = {".py", ".md", ".tohum", ".beklenen", ".toml", ".json"}
    skip = {".venv", "__pycache__", ".mypy_cache", ".ruff_cache", ".pytest_cache", ".hypothesis"}
    return [
        p
        for p in sorted(ROOT.rglob("*"))
        if p.suffix in suffixes and p.is_file() and not skip.intersection(p.parts)
    ]


def test_no_invisible_characters_in_sources() -> None:
    """STANDARTLAR §6.11: görünmez/birleşen karakter kaçış dizisiyle yazılır ("\\u200b")."""
    for path in text_files():
        text = path.read_text(encoding="utf-8")
        for index, ch in enumerate(text):
            if invisible(ch):
                line = text.count("\n", 0, index) + 1
                raise AssertionError(
                    f"{rel(path)}:{line}: görünmez karakter U+{ord(ch):04X} "
                    f'({unicodedata.name(ch, "?")}); kaçış dizisi yazın, ör. "\\u{ord(ch):04x}". '
                    "Düzeltici: depo kökünden `python3 havuz/araclar/kacis.py havuz/sifirdan/dil`"
                )


def test_module_names_do_not_shadow_stdlib() -> None:
    for path in source_files():
        stem = path.stem
        if stem in ("__init__", "__main__"):
            continue
        assert stem not in sys.stdlib_module_names, (
            f"{rel(path)}: '{stem}' standart kitaplıkta da var; dosyayı başka adla adlandırın"
        )


def test_no_function_with_only_pass() -> None:
    for path in source_files():
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                body = [n for n in node.body if not isinstance(n, ast.Expr)]
                assert not (len(body) == 1 and isinstance(body[0], ast.Pass)), (
                    f"{rel(path)}:{node.lineno}: '{node.name}' boş gövdeli; yazın ya da silin"
                )


def test_test_file_names_are_unique() -> None:
    names = [p.name for p in (ROOT / "tests").rglob("test_*.py")]
    duplicates = {n for n in names if names.count(n) > 1}
    assert not duplicates, f"aynı adlı test dosyaları: {duplicates}; başına sistem adını ekleyin"


def test_havuz_json_is_valid() -> None:
    data = json.loads((ROOT / "havuz.json").read_text(encoding="utf-8"))
    for key in ("ad", "baslik", "ozet", "tur", "gereksinim", "python", "denetle", "kopyalamaHaric"):
        assert key in data, f"havuz.json: '{key}' alanı eksik"
    assert data["tur"] == "python"
    assert data["denetle"] == ["python scripts/check.py"]


def test_readme_index_lists_every_system() -> None:
    index = (ROOT / "README.md").read_text(encoding="utf-8")
    for system in SYSTEMS:
        assert f"[{system}]" in index, f"README.md dizininde {system} satırı eksik"
    assert re.search(r"## Sınırlar", index)
