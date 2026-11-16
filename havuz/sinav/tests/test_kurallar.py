"""Sınavın kendi kuralları: başlık yorumu, dosya boyu, yarım iş yok, yalnız standart kütüphane, belgeler güncel.

Genişletme: yeni bir kural → buraya bir test; iletisi ne yapılacağını söylesin.
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

import pytest

from exam.cli import COMMANDS
from exam.paths import SINAV
from exam.tasks import all_tasks

SOURCES = sorted(
    [
        *SINAV.glob("exam/*.py"),
        SINAV / "sinav.py",
        *SINAV.glob("scripts/*.py"),
        *SINAV.glob("gorevler/*/*.py"),
    ]
)
ALLOWED_IMPORTS = set(sys.stdlib_module_names) | {"exam", "denetle", "ortak", "yeni_proje"}


@pytest.mark.parametrize("path", SOURCES, ids=[p.relative_to(SINAV).as_posix() for p in SOURCES])
def test_baslik_yorumu_boy_ve_yarim_is(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    body = text.split("\n", 1)[1] if text.startswith("#!") else text
    assert body.startswith('"""'), f"{path.name}: dosya Türkçe bir başlık yorumuyla açılmalı."
    header = body.split('"""')[1]
    assert "Genişletme:" in header, f"{path.name}: başlıkta 'Genişletme:' satırı olmalı."
    assert len(text.splitlines()) <= 300, f"{path.name}: 300 satırı aşmayın; dosyayı bölün."
    assert not re.search(r"\b(TODO|FIXME|XXX)\b", text), (
        f"{path.name}: yarım iş işareti bırakmayın."
    )


@pytest.mark.parametrize("path", SOURCES, ids=[p.relative_to(SINAV).as_posix() for p in SOURCES])
def test_yalniz_standart_kutuphane(path: Path) -> None:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        names = []
        if isinstance(node, ast.Import):
            names = [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            names = [node.module]
        for name in names:
            assert name.split(".")[0] in ALLOWED_IMPORTS, (
                f"{path.name}: '{name}' standart kütüphanede değil. Sınav yalnız Python standart "
                "kütüphanesiyle çalışır (README → Sınırlar); gerekiyorsa docs/KARARLAR.md'ye gerekçe yazın."
            )


def test_belgeler_komutlari_ve_gorevleri_anar() -> None:
    readme = (SINAV / "README.md").read_text(encoding="utf-8")
    agents = (SINAV / "AGENTS.md").read_text(encoding="utf-8")
    for command in COMMANDS:
        assert f"sinav.py {command}" in readme, f"README.md '{command}' komutunu anlatmalı."
        assert command in agents, f"AGENTS.md '{command}' komutunu anmalı."
    for task in all_tasks():
        assert task.id in readme, f"README.md görev tablosunda {task.id} yok: tabloyu güncelleyin."
    assert "Sınırlar" in readme
