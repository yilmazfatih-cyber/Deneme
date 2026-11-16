"""Fixture çözümü: testin parametre adlarına göre kurulum/temizlik işlevlerini çağırır.

Test `def test_x(veritabani, tmp_dir)` diye yazılır; `veritabani` adlı `@fixture` aranır,
onun da parametreleri varsa önce onlar kurulur (bağımlılık zinciri, döngü denetimiyle). Üreteç
fixture'larda `yield` öncesi kurulum, sonrası temizliktir; temizlik test kalsa da çalışır ve kurulum
sırasının TERSİNE yürür. `scope="modul"` dosya başına bir kez kurulur. Yerleşik: `tmp_dir`.
Genişletme: yeni yerleşik fixture için `BUILTINS` sözlüğüne bir üreteç işlevi ekleyin.
"""

from __future__ import annotations

import inspect
import shutil
import tempfile
import types
from collections.abc import Callable, Generator, Iterator
from pathlib import Path
from typing import Any


class FixtureError(Exception):
    """Fixture bulunamadı, döngüsel bağımlı ya da kurulumu başarısız."""


def tmp_dir() -> Iterator[Path]:
    """Her test için boş, geçici bir klasör; test bitince silinir."""
    folder = Path(tempfile.mkdtemp(prefix="test_cercevesi_"))
    try:
        yield folder
    finally:
        shutil.rmtree(folder, ignore_errors=True)


# Ad -> yerleşik fixture. YENİ YERLEŞİK FIXTURE BURAYA.
BUILTINS: dict[str, Callable[..., Any]] = {"tmp_dir": tmp_dir}


class FixtureScope:
    """Bir kapsamda (test ya da modül) kurulmuş fixture'lar ve temizlik sırası."""

    def __init__(self) -> None:
        self.values: dict[str, Any] = {}
        self.finalizers: list[tuple[str, Generator[Any, None, None]]] = []

    def teardown(self) -> list[str]:
        """Temizlikleri ters sırayla çalıştırır; hata iletilerini toplar (hiçbiri ötekini engellemez)."""
        problems = []
        while self.finalizers:
            name, gen = self.finalizers.pop()
            try:
                next(gen)
            except StopIteration:
                pass
            except Exception as exc:
                problems.append(f"'{name}' temizliği hata verdi: {type(exc).__name__}: {exc}")
            else:
                problems.append(f"'{name}' fixture'ı birden çok yield içeriyor")
        self.values.clear()
        return problems


def available(module: types.ModuleType) -> dict[str, Callable[..., Any]]:
    found = dict(BUILTINS)
    for name, obj in vars(module).items():
        if callable(obj) and getattr(obj, "__tc_fixture__", None):
            found[name] = obj
    return found


class Resolver:
    def __init__(self, module: types.ModuleType, module_scope: FixtureScope, test_scope: FixtureScope):
        self.fixtures = available(module)
        self.module_scope = module_scope
        self.test_scope = test_scope

    def arguments(self, fn: Callable[..., Any], given: dict[str, Any]) -> dict[str, Any]:
        """Testin her parametresi için değer: önce parametrize değeri, sonra fixture."""
        args = {}
        for name in inspect.signature(fn).parameters:
            args[name] = given[name] if name in given else self.value(name, [])
        return args

    def value(self, name: str, chain: list[str]) -> Any:
        if name in chain:
            raise FixtureError("döngüsel fixture bağımlılığı: " + " → ".join([*chain, name]))
        if name not in self.fixtures:
            known = ", ".join(sorted(self.fixtures)) or "(yok)"
            raise FixtureError(f"'{name}' adlı fixture bulunamadı; mevcut: {known}")
        fn = self.fixtures[name]
        scope = self.module_scope if getattr(fn, "__tc_fixture__", "test") == "modul" else self.test_scope
        if name in scope.values:
            return scope.values[name]
        deps = {dep: self.value(dep, [*chain, name]) for dep in inspect.signature(fn).parameters}
        result = fn(**deps)
        if inspect.isgenerator(result):
            try:
                value = next(result)
            except StopIteration:
                raise FixtureError(f"'{name}' fixture'ı hiç yield etmedi") from None
            scope.finalizers.append((name, result))
            result = value
        scope.values[name] = result
        return result
