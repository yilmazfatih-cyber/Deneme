"""Sınavın sınavı (tam): her görev gerçek hazırla/puanla yoluyla doğrulanır (exam/verify.py).

(1) başlangıç kalır, (2) başvuru çözümü geçer, (3) hileler geçersiz sayılır. Bağımlılık kurar ve temellerin
denetimlerini koşar: uzun sürer (görev başına ~1–3 dk). Yalnız `SINAV_TAM=1` ile koşar:
    SINAV_TAM=1 python -m pytest tests/test_dogrulama.py      ya da      python scripts/check.py --tam
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from exam.tasks import Task, all_tasks
from exam.verify import verify_task

TASKS = all_tasks()

pytestmark = [
    pytest.mark.tam,
    pytest.mark.skipif(
        os.environ.get("SINAV_TAM") != "1", reason="tam doğrulama SINAV_TAM=1 ile koşar"
    ),
]


@pytest.mark.parametrize("task", TASKS, ids=[task.id for task in TASKS])
def test_gorev_dogrulanir(task: Task, tmp_path: Path) -> None:
    outcome = verify_task(task, tmp_path, echo=print)
    assert outcome.ok, "; ".join(outcome.problems)
