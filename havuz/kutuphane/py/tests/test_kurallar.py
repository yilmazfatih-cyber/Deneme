"""Kural testleri: kütüphanenin değişmez kurallarını korur. Bir test kırılırsa iletisi ne yapılacağını söyler.

1. Her modül tek dosyadır, yalnız standart kütüphaneyi içe aktarır.   6. Görünmez karakter yok.
2. Her modülün testi vardır.                                         7. upper()/lower() çağrıları gerekçeli.
3. README dizininde her modül doğru TS/Py işaretiyle listelidir.      8. Vektör dosyaları modüllerle eşleşir.
4. İki dilde olan modüllerin dışa açtığı adlar eşleşir.               9. Kopyalama yardımcısı çalışır (kopya test koşar).
5. Her modülün başlığında Kullanım, Sınırlar ve Genişletme: vardır.  10. havuz.json doğru.
"""

from __future__ import annotations

import ast
import importlib
import json
import re
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

import pytest

PY_ROOT = Path(__file__).resolve().parents[1]
ROOT = PY_ROOT.parent
TS_SRC = ROOT / "ts" / "src"
PY_SRC = PY_ROOT / "kutuphane"
sys.path.insert(0, str(PY_ROOT))
kopyala = importlib.import_module("kopyala")

TS_MODULES = sorted(p.stem for p in TS_SRC.glob("*.ts"))
PY_MODULES = sorted(p.stem for p in PY_SRC.glob("*.py") if p.stem != "__init__")
TS_ONLY_MODULES = {"geri_al", "olay", "renk", "zamanlama"}
TURKISH_MODULES = ["turkce", "ek", "sayi_yazi", "para", "tarih", "dogrulama", "maske"]

# İzinli istisnalar: modül → içe aktarabileceği kütüphane-içi modüller. Şu an hiçbir modül başkasına bağlı değil.
ALLOWED_LOCAL_IMPORTS: dict[str, set[str]] = {}

# Bilinçli dil farkları (gerekçe ts/test/kurallar.test.ts'de aynı listede yazılı).
LANGUAGE_DIFFERENCES: dict[str, dict[str, set[str]]] = {
    "csv": {"ts_only": {"parse_csv_stream"}, "py_only": {"iter_csv"}},
    "derin": {"ts_only": {"deep_freeze"}, "py_only": set()},
    "yeniden_dene": {"ts_only": set(), "py_only": {"retry_async", "RetryCancelledError"}},
}


def _snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower() if name[:1].islower() else name


def _ts_exports(source: str) -> set[str]:
    patterns = [
        r"^export (?:async )?function\*? ?(\w+)",
        r"^export (?:abstract )?class (\w+)",
        r"^export const (\w+)",
        r"^export (?:interface|type) (\w+)",
    ]
    return {
        _snake(name) for pattern in patterns for name in re.findall(pattern, source, re.MULTILINE)
    }


def _py_exports(module: str) -> set[str]:
    tree = ast.parse((PY_SRC / f"{module}.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            getattr(t, "id", "") == "__all__" for t in node.targets
        ):
            assert isinstance(node.value, ast.List)
            return {str(ast.literal_eval(element)).rstrip("_") for element in node.value.elts}
    raise AssertionError(f"{module}.py içinde __all__ yok: dışa açılan adları listeleyin.")


def test_module_lists_match() -> None:
    expected = [m for m in TS_MODULES if m not in TS_ONLY_MODULES]
    assert expected == PY_MODULES, (
        "py/kutuphane ile ts/src modül listeleri uyuşmuyor; eksik eşi yazın ya da TS_ONLY_MODULES'e ekleyin."
    )


@pytest.mark.parametrize("module", PY_MODULES)
def test_only_stdlib_imports(module: str) -> None:
    tree = ast.parse((PY_SRC / f"{module}.py").read_text(encoding="utf-8"))
    allowed = ALLOWED_LOCAL_IMPORTS.get(module, set())
    for node in ast.walk(tree):
        names: list[str] = []
        if isinstance(node, ast.Import):
            names = [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom):
            assert node.level == 0, f"{module}.py göreli içe aktarma yapıyor; modüller bağımsızdır."
            names = [node.module or ""]
        for name in names:
            top = name.split(".")[0]
            if top == "kutuphane":
                local = name.split(".")[1] if "." in name else ""
                assert local in allowed, (
                    f"{module}.py başka modülü içe aktarıyor ({name}). Gereken kodu dosyaya kopyalayın ya da "
                    "ALLOWED_LOCAL_IMPORTS'a gerekçesiyle ekleyin."
                )
            else:
                assert top == "__future__" or top in sys.stdlib_module_names, (
                    f"{module}.py standart kütüphane dışı paket kullanıyor: {name}. Kütüphane bağımlılıksızdır."
                )


@pytest.mark.parametrize("module", PY_MODULES)
def test_has_test_and_full_header(module: str) -> None:
    assert (PY_ROOT / "tests" / f"test_{module}.py").exists(), (
        f"tests/test_{module}.py yok: testini yazın."
    )
    docstring = (
        ast.get_docstring(ast.parse((PY_SRC / f"{module}.py").read_text(encoding="utf-8"))) or ""
    )
    for word in ("Kullanım", "Sınırlar", "Genişletme:"):
        assert word in docstring, f'{module}.py başlığında "{word}" bölümü yok.'


def test_readme_lists_every_module() -> None:
    readme = (ROOT / "README.md").read_text(encoding="utf-8").splitlines()
    for module in sorted(set(TS_MODULES) | set(PY_MODULES)):
        row = next((line for line in readme if line.startswith(f"| `{module}`")), None)
        assert row is not None, (
            f'README.md dizininde "{module}" satırı yok: | `{module}` | … | ✓ | ✓ | … |'
        )
        cells = [cell.strip() for cell in row.split("|")]
        assert cells[3] == ("✓" if module in TS_MODULES else "—"), (
            f"README: {module} TS sütunu yanlış."
        )
        assert cells[4] == ("✓" if module in PY_MODULES else "—"), (
            f"README: {module} Py sütunu yanlış."
        )


@pytest.mark.parametrize("module", PY_MODULES)
def test_exports_match_typescript(module: str) -> None:
    ts = _ts_exports((TS_SRC / f"{module}.ts").read_text(encoding="utf-8"))
    py = _py_exports(module)
    allowed = LANGUAGE_DIFFERENCES.get(module, {"ts_only": set(), "py_only": set()})
    only_py = py - ts - allowed["py_only"]
    assert not only_py, f"{module}: Python'da olup TS'de olmayan: {sorted(only_py)}. Eşini ekleyin."
    ts_functions = {n for n in ts if n[:1].islower() or n.endswith("Error")}
    only_ts = (ts_functions - py) - allowed["ts_only"]
    assert not only_ts, (
        f"{module}: TS'de olup Python'da olmayan işlev/hata: {sorted(only_ts)}. Eşini ekleyin."
    )


def _source_files() -> list[Path]:
    return [
        *PY_SRC.glob("*.py"),
        *(PY_ROOT / "tests").glob("*.py"),
        *(PY_ROOT / "scripts").glob("*.py"),
        PY_ROOT / "kopyala.py",
        *(ROOT / "vektorler").glob("*.json"),
        *(ROOT / "docs").glob("*.md"),
        ROOT / "README.md",
        ROOT / "AGENTS.md",
    ]


def test_no_invisible_characters() -> None:
    for path in _source_files():
        bad = [
            f"U+{ord(ch):04X}"
            for ch in path.read_text(encoding="utf-8")
            if unicodedata.category(ch) in ("Mn", "Me", "Cf", "Co", "Zl", "Zp")
            or (unicodedata.category(ch) == "Zs" and ch != " ")
        ]
        assert not bad, f"{path}: görünmez karakter {bad}. Kaçışla yazın (\\u0307, \\N{{...}})."


def test_case_conversion_is_justified() -> None:
    """Gerçek .upper()/.lower() çağrıları (belge metnindeki örnekler değil) gerekçeli satırda olmalı."""
    for path in PY_SRC.glob("*.py"):
        source = path.read_text(encoding="utf-8")
        lines = source.splitlines()
        for node in ast.walk(ast.parse(source)):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr in ("upper", "lower")
            ):
                line_number = node.func.end_lineno or node.lineno
                assert "harf:" in lines[line_number - 1], (
                    f"{path.name}:{line_number} gerekçesiz upper()/lower(). Türkçe metinde i→İ hatası olur: "
                    'turkce.upper_tr/lower_tr kullanın ya da satır sonuna "# harf: neden" yazın.'
                )


def test_vector_files_are_linked() -> None:
    vectors = sorted(p.stem for p in (ROOT / "vektorler").glob("*.json"))
    for module in TURKISH_MODULES:
        assert module in vectors, (
            f"vektorler/{module}.json yok (Türkçe modüller ortak vektörle sınanır)."
        )
    for name in vectors:
        data = json.loads((ROOT / "vektorler" / f"{name}.json").read_text(encoding="utf-8"))
        assert data["modul"] == name
        assert name in PY_MODULES
        assert name in TS_MODULES
        assert f'"{name}"' in (PY_ROOT / "tests" / f"test_{name}.py").read_text(encoding="utf-8")
        if name == "sema":
            continue
        exported = _py_exports(name)
        for function in data["islevler"]:
            assert _snake(function) in exported, (
                f'vektorler/{name}.json: "{function}" Python modülünde yok.'
            )


def test_copy_helper_produces_runnable_copies() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        target = Path(tmp)
        assert kopyala.copy_module("turkce", target) == [
            "turkce.py",
            "test_turkce.py",
            "vektorler/turkce.json",
        ]
        assert kopyala.copy_module("csv", target) == [
            "csv_tr.py",
            "test_csv.py",
            "vektorler/csv.json",
        ]
        assert "from turkce import" in (target / "test_turkce.py").read_text(encoding="utf-8")
        with pytest.raises(FileExistsError):
            kopyala.copy_module("turkce", target)
        result = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", str(target)],
            cwd=target,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        assert result.returncode == 0, f"Kopyalanan testler koşmadı:\n{result.stdout[-2000:]}"
        package = Path(tmp) / "paketli"
        kopyala.copy_module("para", package, package="uygulama.araclar")
        assert "from uygulama.araclar.para import" in (package / "test_para.py").read_text(
            encoding="utf-8"
        )


def test_havuz_json() -> None:
    data = json.loads((ROOT / "havuz.json").read_text(encoding="utf-8"))
    assert data["ad"] == "kutuphane"
    assert data["tur"] == "karma"
    assert any("npm run check" in command for command in data["denetle"])
    assert any("scripts/check.py" in command for command in data["denetle"])
