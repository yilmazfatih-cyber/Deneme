"""Test keşfi: dosyaları bulur, yükler (assert yeniden yazımıyla) ve test durumlarını çıkarır.

Kurallar: `test_*.py` ya da `*_test.py` dosyaları; içlerinde `test_` ile başlayan işlevler (tanım
sırasıyla). `@parametrize` her değer satırını ayrı bir duruma çevirir (`test_topla[1-2-3]`).
Yükleme hatası (sözdizimi hatası, içe aktarma hatası) testleri durdurmaz: dosya "toplama hatası"
olarak raporlanır. Test dosyasının klasörü yükleme süresince `sys.path`'e eklenir.
Genişletme: sınıf içi testleri (`class TestX`) toplamak için `collect_module`'a bir dal ekleyin.
"""

from __future__ import annotations

import inspect
import itertools
import sys
import traceback
import types
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .rewrite import load_module

SKIP_DIRS = {".venv", "venv", "__pycache__", ".git", "node_modules", ".mypy_cache", ".ruff_cache"}


@dataclass
class TestCase:
    id: str  # "dosya.py::test_ad[parametre]"
    function: Callable[..., Any]
    module: types.ModuleType
    params: dict[str, Any] = field(default_factory=dict)

    __test__ = False  # pytest bu sınıfı test sanmasın


@dataclass
class CollectionError:
    path: Path
    message: str


_LOWER = str.maketrans({"I": "ı", "İ": "i"})


def matches_keyword(test_id: str, keyword: str) -> bool:
    """`-k` süzgeci: büyük/küçük harf duyarsız, Türkçe kurallı (İ→i, I→ı)."""
    fold = lambda text: text.translate(_LOWER).lower()  # noqa: E731  # tr-güvenli: önce çevrildi
    return fold(keyword) in fold(test_id)


def find_files(paths: list[Path]) -> list[Path]:
    found: list[Path] = []
    for path in paths:
        if path.is_file():
            found.append(path)
            continue
        for candidate in sorted(path.rglob("*.py")):
            if any(part in SKIP_DIRS for part in candidate.parts):
                continue
            if candidate.name.startswith("test_") or candidate.name.endswith("_test.py"):
                found.append(candidate)
    return found


@contextmanager
def on_sys_path(folder: Path) -> Iterator[None]:
    entry = str(folder.resolve())
    added = entry not in sys.path
    if added:
        sys.path.insert(0, entry)
    try:
        yield
    finally:
        if added and entry in sys.path:
            sys.path.remove(entry)


def param_id(values: tuple[Any, ...]) -> str:
    parts = []
    for value in values:
        text = str(value) if isinstance(value, (int, float, str, bool, type(None))) else type(value).__name__
        parts.append(text if len(text) <= 20 else text[:19] + "…")
    return "-".join(parts)


def expand(fn: Callable[..., Any]) -> list[tuple[str, dict[str, Any]]]:
    """Parametreli testi (ek, değerler) çiftlerine açar; birden çok `@parametrize` çarpılır."""
    layers = getattr(fn, "__tc_params__", [])
    if not layers:
        return [("", {})]
    options: list[list[tuple[str, dict[str, Any]]]] = []
    for keys, rows, ids in layers:
        options.append(
            [(ids[i] if ids else param_id(row), dict(zip(keys, row, strict=True))) for i, row in enumerate(rows)]
        )
    cases = []
    for combo in itertools.product(*reversed(options)):
        label = "-".join(part for part, _ in combo)
        merged: dict[str, Any] = {}
        for _, values in combo:
            merged.update(values)
        cases.append((f"[{label}]", merged))
    return cases


def collect_module(module: types.ModuleType, display: str) -> list[TestCase]:
    cases = []
    for name, obj in list(vars(module).items()):
        if not name.startswith("test_") or not inspect.isfunction(obj):
            continue
        if obj.__module__ != module.__name__:
            continue  # başka modülden içe aktarılmış işlev
        for suffix, params in expand(obj):
            cases.append(TestCase(f"{display}::{name}{suffix}", obj, module, params))
    return cases


def collect(paths: list[Path], base: Path | None = None) -> tuple[list[TestCase], list[CollectionError]]:
    cases: list[TestCase] = []
    errors: list[CollectionError] = []
    for path in find_files(paths):
        display = str(path.relative_to(base)) if base and path.is_relative_to(base) else path.name
        try:
            with on_sys_path(path.parent):
                module = load_module(path)
        except Exception:
            errors.append(CollectionError(path, traceback.format_exc(limit=-3)))
            continue
        cases += collect_module(module, display)
    return cases, errors
