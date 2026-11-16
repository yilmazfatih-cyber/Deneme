"""`puanla`: ajanın bitirdiği görev klasörünü ölçer.

Aşamalar (sırayla):
  1. bütünlük — korunan dosyalar başlangıçla karşılaştırılır (integrity.py); ihlal → GEÇERSİZ;
  2. gizli denetimler — gizli test dosyaları kopyaya konur, koşulur, SİLİNİR;
  3. temelin denetimi — havuz.json → `denetle` komutları (ör. `npm run check`).
Sonuç: ihlal varsa "gecersiz"; bütün aşamalar geçtiyse "gecti"; yoksa "kaldi".
`stop_early=True` ilk başarısız aşamada durur (dogrula hız için kullanır).
Genişletme: yeni bir aşama türü için `grade` içinde `stages` listesine ekleyen bir blok yazın.
"""

from __future__ import annotations

import shlex
import shutil
import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from exam import foundations, records
from exam.diffstat import DiffStats, diff_stats
from exam.integrity import IntegrityResult, check_integrity
from exam.runner import run
from exam.tasks import HiddenCheck, Task, find_task, task_digest

Echo = Callable[[str], None]


@dataclass
class Stage:
    name: str
    status: str  # gecti | kaldi | atlandi
    seconds: float = 0.0
    log: str = ""
    tail: str = ""


@dataclass
class GradeResult:
    record: records.Record
    task: Task
    verdict: str
    stages: list[Stage]
    integrity: IntegrityResult
    diff: DiffStats
    minutes: float
    graded_at: str
    notes: list[str] = field(default_factory=list)

    @property
    def failed(self) -> list[str]:
        return [stage.name for stage in self.stages if stage.status == "kaldi"]

    def stage(self, prefix: str) -> list[Stage]:
        return [stage for stage in self.stages if stage.name.startswith(prefix)]


def _placeholders(command: str, task: Task, task_root: Path, copy_root: Path) -> str:
    values = {
        "python": shlex.quote(sys.executable),
        "gizli": shlex.quote(str(task.hidden_dir)),
        "gorev": shlex.quote(str(task_root)),
        "kopya": shlex.quote(str(copy_root)),
    }
    for key, value in values.items():
        command = command.replace("{" + key + "}", value)
    return command


def _run_hidden(
    check: HiddenCheck, task: Task, task_root: Path, copy: foundations.Temel, log: Path
) -> Stage:
    copy_root = copy.yol
    placed: list[tuple[Path, bytes | None]] = []
    try:
        for source, target in check.files.items():
            path = copy_root / target
            placed.append((path, path.read_bytes() if path.exists() else None))
            path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(task.hidden_dir / source, path)
        base = copy_root if check.where == "kopya" else task_root
        env = foundations.command_env(copy, {"PYTHONDONTWRITEBYTECODE": "1", **check.env})
        command = _placeholders(check.command, task, task_root, copy_root)
        result = run(command, base / check.folder, log, env=env, timeout_s=check.timeout_s)
    finally:
        for path, original in reversed(placed):
            if original is None:
                path.unlink(missing_ok=True)
            else:
                path.write_bytes(original)
            cache = path.parent / "__pycache__"
            for stale in cache.glob(f"{path.stem}.*.pyc") if cache.is_dir() else []:
                stale.unlink()
    status = "gecti" if result.ok else "kaldi"
    return Stage(
        f"gizli:{check.name}", status, result.seconds, str(log), "" if result.ok else result.tail()
    )


def _minutes_since(prepared_at: str, now: datetime) -> float:
    try:
        start = datetime.fromisoformat(prepared_at)
    except ValueError:
        return 0.0
    return round(max(0.0, (now - start).total_seconds()) / 60, 1)


def grade(
    folder: Path,
    *,
    stop_early: bool = False,
    echo: Echo = print,
    now: Callable[[], datetime] = lambda: datetime.now().astimezone(),
) -> GradeResult:
    folder = folder.expanduser().resolve()
    record = records.find_for_folder(folder)
    task = find_task(record.task_id)
    foundation = foundations.find_foundation(task.foundation)
    copy = foundations.at_copy(foundation, folder / record.copy_name)
    if not copy.yol.is_dir():
        raise records.RecordError(f"Temel kopyası bulunamadı: {copy.yol}")
    logs = record.dir / f"puanlama-{len(list(record.dir.glob('puanlama-*'))) + 1}"
    notes: list[str] = []
    if task_digest(task) != record.task_digest:
        notes.append(
            "Görev tanımı hazırlıktan sonra değişmiş; sonuç eski sürümle karşılaştırılamayabilir."
        )

    snapshot = record.snapshot()
    try:
        protection = foundations.protection_for(task.foundation, task.allowed, task.strict_extra)
        integrity = check_integrity(copy.yol, record.manifest, snapshot, protection)
        diff = diff_stats(copy.yol, record.manifest, snapshot)
    finally:
        snapshot.close()
    stages = [Stage("butunluk", "gecti" if integrity.ok else "kaldi")]
    echo(
        f"  bütünlük ............ {'✓' if integrity.ok else '✗ (ihlal: ' + str(len(integrity.violations)) + ')'}"
    )
    stop = stop_early and not integrity.ok

    for check in task.hidden:
        if stop:
            stages.append(Stage(f"gizli:{check.name}", "atlandi"))
            continue
        stage = _run_hidden(check, task, folder, copy, logs / f"gizli-{check.name}.log")
        stages.append(stage)
        echo(
            f"  gizli: {check.name:<12} {'✓' if stage.status == 'gecti' else '✗'} ({stage.seconds:.0f} sn)"
        )
        stop = stop_early and stage.status == "kaldi"

    env = foundations.command_env(copy)
    for index, command in enumerate(foundations.check_commands(copy, task.check_commands), start=1):
        name = f"denetim:{command}"
        if stop:
            stages.append(Stage(name, "atlandi"))
            continue
        result = run(command, copy.yol, logs / f"denetim-{index}.log", env=env, timeout_s=1800)
        status = "gecti" if result.ok else "kaldi"
        stages.append(
            Stage(name, status, result.seconds, str(result.log), "" if result.ok else result.tail())
        )
        echo(f"  denetim: {command} {'✓' if result.ok else '✗'} ({result.seconds:.0f} sn)")
        stop = stop_early and not result.ok

    if not integrity.ok:
        verdict = "gecersiz"
    elif all(stage.status == "gecti" for stage in stages):
        verdict = "gecti"
    else:
        verdict = "kaldi"
    moment = now()
    return GradeResult(
        record=record,
        task=task,
        verdict=verdict,
        stages=stages,
        integrity=integrity,
        diff=diff,
        minutes=_minutes_since(record.prepared_at, moment),
        graded_at=moment.isoformat(timespec="seconds"),
        notes=notes,
    )
