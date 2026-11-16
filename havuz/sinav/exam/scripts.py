"""Görev betiklerini yükler ve çalıştırır: hazirla.py → `hazirla(kopya)`, cozum.py → `coz(kopya)`,
hile.py → `hile(kopya)`. `kopya` temelin görev klasöründeki kopyasının yoludur; okuma görevlerinde
yanıt dosyası bir üst klasöre (`kopya.parent / "YANIT.md"`) yazılır.

Betikler `exam.edit` yardımcılarını içe aktarabilir (sınav klasörü yol listesindedir).
Genişletme: yeni bir betik türü için `FUNCTIONS` sözlüğüne (dosya adı → işlev adı) satır ekleyin.
"""

from __future__ import annotations

import importlib.util
from collections.abc import Callable
from pathlib import Path

from exam.tasks import Task

FUNCTIONS = {"hazirla": "hazirla", "cozum": "coz", "hile": "hile"}


class ScriptError(RuntimeError):
    """Görev betiği yüklenemedi ya da beklenen işlevi içermiyor."""


def load_function(task: Task, name: str) -> Callable[[Path], None]:
    path = task.script(name)
    spec = importlib.util.spec_from_file_location(f"gorev_{task.id.replace('-', '_')}_{name}", path)
    if spec is None or spec.loader is None:
        raise ScriptError(f"{task.id}/{name}.py yüklenemedi.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    function = getattr(module, FUNCTIONS[name], None)
    if not callable(function):
        raise ScriptError(f"{task.id}/{name}.py içinde `{FUNCTIONS[name]}(kopya)` işlevi yok.")
    return function  # type: ignore[no-any-return]


def apply(task: Task, name: str, copy_root: Path) -> None:
    """Betiği kopya üzerinde çalıştırır."""
    load_function(task, name)(copy_root)
