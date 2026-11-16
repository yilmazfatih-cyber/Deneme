"""Görev kümesinin hızlı denetimi (kurulum ve ağ gerekmez; temel kopyaları bağımlılıksız açılır).

Sınar: her görev tanımı geçerli; dağılım (zorluk ve tür) şartnameye uygun; görev metinleri çözümü ele
vermiyor; hazırlık betiği temelin ŞİMDİKİ hâline uygulanabiliyor (temel değişince hemen kırmızı olur); başlangıç
istemi doldurulabiliyor; gizli dosyalar mevcut.
"""

from __future__ import annotations

import re
import shutil
from collections import Counter
from pathlib import Path

import pytest

from exam import foundations, scripts
from exam.prompt import start_prompt
from exam.tasks import TURLER, ZORLUKLAR, Task, all_tasks
from exam.tree import build_manifest

TASKS = all_tasks()
IDS = [task.id for task in TASKS]
PLACEHOLDER = re.compile(r"\{(\w+)\}")


def test_gorev_sayisi_ve_dagilim() -> None:
    assert 12 <= len(TASKS) <= 18, "Şartname 12–18 görev ister."
    assert len(set(IDS)) == len(IDS)
    levels = Counter(task.difficulty for task in TASKS)
    for level in ZORLUKLAR:
        assert levels[level] >= len(TASKS) // 5, f"'{level}' görev sayısı az: {levels}"
    kinds = Counter(task.kind for task in TASKS)
    assert set(kinds) == set(TURLER), f"Her tür en az bir kez olmalı: {kinds}"
    assert kinds["okuma"] <= 3, "Okuma görevleri az sayıda olmalı."
    assert len({task.foundation for task in TASKS}) >= 6


@pytest.mark.parametrize("task", TASKS, ids=IDS)
def test_gorev_metni_cozumu_ele_vermez(task: Task) -> None:
    message = task.message_path.read_text(encoding="utf-8")
    assert 200 < len(message) < 2500, "Görev metni kısa ve tek işli olmalı."
    lowered = message.casefold()
    for word in ("gizli", "cozum.py", "hile", "sinav", "sınav"):
        assert word not in lowered, f"Görev metni '{word}' içermemeli (ajan sınandığını bilmez)."
    assert re.search(r"[çğıöşüİ]", message), "Görev metni Türkçe yazılmalı."
    assert "Denetim" in message or "denetim" in message or task.kind == "okuma"


@pytest.mark.parametrize("task", TASKS, ids=IDS)
def test_gizli_denetimler_tanimli(task: Task) -> None:
    for check in task.hidden:
        unknown = set(PLACEHOLDER.findall(check.command)) - {"python", "gizli", "gorev", "kopya"}
        assert not unknown, f"{check.name}: bilinmeyen yer tutucu {unknown}"
        for source in check.files:
            assert (task.hidden_dir / source).is_file()
    for name in ("cozum", "hazirla") + (("hile",) if task.has_cheat else ()):
        assert callable(scripts.load_function(task, name))


@pytest.mark.parametrize("task", TASKS, ids=IDS)
def test_hazirlik_temelin_simdiki_haline_uygulanir(task: Task, tmp_path: Path) -> None:
    foundation = foundations.find_foundation(task.foundation)
    copy_root = tmp_path / foundation.yol.name
    foundations.copy_foundation(foundation, copy_root)
    before = build_manifest(copy_root)
    scripts.apply(task, "hazirla", copy_root)
    changed = {
        rel for rel, digest in build_manifest(copy_root).items() if before.get(rel) != digest
    }
    if task.kind == "hata" or task.initial_check == "kirmizi":
        assert changed, (
            "Hata görevinin (ya da kırmızı başlayanın) başlangıcı temelden farklı olmalı."
        )
    copy = foundations.at_copy(foundation, copy_root)
    commands = foundations.check_commands(copy, task.check_commands)
    prompt = start_prompt(
        copy_root.name, foundations.check_text_for_agent(copy_root.name, commands)
    )
    assert f"Bu depoda {copy_root.name} içinde" in prompt
    shutil.rmtree(copy_root)
