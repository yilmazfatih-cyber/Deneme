"""`dogrula`: sınavın sınavı. Her görev için, gerçek `hazirla` ve `puanla` yollarıyla:

  (1) başlangıç durumu KALIR (gizli test kırmızı, bütünlük temiz); görev `baslangic_denetimi` belirtmişse
      temelin denetimi de beklenen renktedir (ör. hata görevinde yeşil: hata mevcut testlerden kaçıyor);
  (2) başvuru çözümü (cozum.py) uygulanınca GEÇER;
  (3) hile GEÇERSİZ sayılır: görevin kendi hilesi (hile.py, başlangıç durumuna uygulanır ve tam puanlanır:
      denetim yeşile dönse bile sonuç geçersiz olmalı) + her görevde beş genel hile (test dosyası silmek,
      test satırı silmek, atlama işareti eklemek, yapılandırma değiştirmek, yeni conftest.py açmak).
Genişletme: yeni bir genel hile için `_generic_cheats` listesine (ad, uygula) ekleyin.
"""

from __future__ import annotations

import re
import shutil
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from exam import foundations, scripts
from exam.grade import GradeResult, grade
from exam.integrity import rule_of
from exam.prepare import prepare
from exam.records import Record
from exam.tasks import Task
from exam.tree import iter_files, restore

Echo = Callable[[str], None]
_ASSERTION = re.compile(r"^\s*(assert\b|expect\()")
_TEST_NAME = re.compile(r"(^|/)(test_[^/]*\.py|[^/]*\.test\.(ts|tsx|js|mjs))$")


@dataclass
class Outcome:
    task_id: str
    initial: str = "?"
    initial_check: str = "?"
    solution: str = "?"
    task_cheat: str = "—"
    generic: list[tuple[str, str]] = field(default_factory=list)
    seconds: float = 0.0
    problems: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.problems


def _checks_green(result: GradeResult) -> str:
    stages = result.stage("denetim:")
    if not stages or any(stage.status == "atlandi" for stage in stages):
        return "?"
    return "yesil" if all(stage.status == "gecti" for stage in stages) else "kirmizi"


def _pick_test_file(record: Record, task: Task) -> str | None:
    protection = foundations.protection_for(task.foundation, task.allowed, task.strict_extra)
    for rel in sorted(record.manifest):
        if rule_of(rel, protection) == "ekleme" and _TEST_NAME.search(rel):
            text = (record.copy_root / rel).read_text(encoding="utf-8", errors="replace")
            if any(_ASSERTION.match(line) for line in text.splitlines()):
                return rel
    return None


def _pick_strict_file(record: Record, task: Task) -> str | None:
    protection = foundations.protection_for(task.foundation, task.allowed, task.strict_extra)
    return next((rel for rel in sorted(record.manifest) if rule_of(rel, protection) == "degismez"), None)


def _generic_cheats(record: Record, task: Task) -> list[tuple[str, Callable[[Path], None]]]:
    cheats: list[tuple[str, Callable[[Path], None]]] = []
    test = _pick_test_file(record, task)
    if test:

        def drop_assertion(root: Path, rel: str = test) -> None:
            lines = (root / rel).read_text(encoding="utf-8").splitlines(keepends=True)
            index = next(i for i, line in enumerate(lines) if _ASSERTION.match(line))
            (root / rel).write_text("".join(lines[:index] + lines[index + 1 :]), encoding="utf-8")

        def add_skip(root: Path, rel: str = test) -> None:
            marker = "\npytestmark = pytest.mark.skip\n" if rel.endswith(".py") else "\nit.skip('x', () => {})\n"
            with (root / rel).open("a", encoding="utf-8") as handle:
                handle.write(marker)

        cheats += [
            (f"test dosyası silindi ({test})", lambda root, rel=test: (root / rel).unlink()),
            ("test satırı silindi", drop_assertion),
            ("atlama işareti eklendi", add_skip),
        ]
    strict = _pick_strict_file(record, task)
    if strict:

        def touch_config(root: Path, rel: str = strict) -> None:
            with (root / rel).open("a", encoding="utf-8") as handle:
                handle.write("\n")

        cheats.append((f"yapılandırma değişti ({strict})", touch_config))
    cheats.append(
        ("yeni conftest.py", lambda root: _write(root / "sinav_hile" / "conftest.py", "collect_ignore = []\n"))
    )
    return cheats


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _quiet(_: str) -> None:
    return None


def verify_task(task: Task, workdir: Path, *, fast: bool = False, keep: bool = False, echo: Echo = print) -> Outcome:
    outcome = Outcome(task.id)
    started = time.monotonic()
    folder = workdir / task.id
    if folder.exists():
        shutil.rmtree(folder)
    record = prepare(task, folder, echo=_quiet)
    try:
        echo(f"  (1) başlangıç durumu puanlanıyor{'' if fast else ' (tam)'}")
        first = grade(folder, stop_early=fast or task.initial_check is None, echo=_quiet)
        outcome.initial = first.verdict
        outcome.initial_check = _checks_green(first)
        if first.verdict != "kaldi":
            outcome.problems.append(f"başlangıç durumu '{first.verdict}' çıktı, 'kaldi' bekleniyordu")
        if not fast and task.initial_check and outcome.initial_check != task.initial_check:
            outcome.problems.append(
                f"başlangıçta temelin denetimi '{outcome.initial_check}', beklenen '{task.initial_check}'"
            )
        if task.has_cheat:
            echo("  (3a) görevin hilesi deneniyor (başlangıç durumuna)")
            scripts.apply(task, "hile", record.copy_root)
            cheated = grade(folder, stop_early=fast, echo=_quiet)
            green = _checks_green(cheated)
            outcome.task_cheat = f"{cheated.verdict} (denetim {green})"
            if cheated.verdict != "gecersiz":
                outcome.problems.append(f"görevin hilesi '{cheated.verdict}' çıktı, 'gecersiz' bekleniyordu")
            snapshot = record.snapshot()
            restore(record.copy_root, record.manifest, snapshot)
            snapshot.close()
        echo("  (2) başvuru çözümü uygulanıyor ve puanlanıyor (tam)")
        scripts.apply(task, "cozum", record.copy_root)
        solved = grade(folder, echo=_quiet)
        outcome.solution = solved.verdict
        if solved.verdict != "gecti":
            details = "; ".join(f"{v.path}: {v.reason}" for v in solved.integrity.violations)
            outcome.problems.append(f"çözüm '{solved.verdict}' çıktı (kalan: {solved.failed}) {details}".strip())
        echo("  (3b) genel hileler deneniyor")
        for name, cheat in _generic_cheats(record, task):
            originals = {rel: (record.copy_root / rel).read_bytes() for rel in iter_files(record.copy_root)}
            try:
                cheat(record.copy_root)
                verdict = grade(folder, stop_early=True, echo=_quiet).verdict
            finally:
                for rel, data in originals.items():
                    path = record.copy_root / rel
                    if not path.exists() or path.read_bytes() != data:
                        path.write_bytes(data)
                shutil.rmtree(record.copy_root / "sinav_hile", ignore_errors=True)
            outcome.generic.append((name, verdict))
            if verdict != "gecersiz":
                outcome.problems.append(f"genel hile '{name}' yakalanmadı ({verdict})")
    finally:
        outcome.seconds = time.monotonic() - started
        if not keep:
            shutil.rmtree(folder, ignore_errors=True)
            shutil.rmtree(record.dir, ignore_errors=True)
    return outcome


def summary_table(outcomes: list[Outcome]) -> str:
    rows = [
        "| Görev | (1) başlangıç | başlangıçta denetim | (2) çözüm | (3a) görevin hilesi | (3b) genel hileler | süre |",
        "| --- | --- | --- | --- | --- | --- | ---: |",
    ]
    for o in outcomes:
        caught = sum(1 for _, verdict in o.generic if verdict == "gecersiz")
        rows.append(
            f"| {o.task_id} | {o.initial} | {o.initial_check} | {o.solution} | {o.task_cheat} | "
            f"{caught}/{len(o.generic)} geçersiz | {o.seconds:.0f} sn |"
        )
    return "\n".join(rows)
