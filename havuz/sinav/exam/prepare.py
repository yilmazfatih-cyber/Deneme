"""`hazirla`: görev klasörünü kurar — temelin temiz kopyası + başlangıç durumu + GOREV.md + bağımlılıklar.

Sıra: kopyala → hazirla.py → GOREV.md → bağımlılıkları kur → başlangıç özetleri ve anlık görüntü
(kayıt, görev klasörünün dışında) → git deposu ve ilk kayıt (ajan `git diff` ile kendi işini görebilsin).
Görev klasörü deponun İÇİNDE açılamaz: ajan oradan gizli testlere ve çözümlere ulaşabilir.
Genişletme: hazırlığa yeni bir adım eklemek için `prepare` işlevinde uygun yere bir satır ekleyin.
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from exam import foundations, records, scripts
from exam.paths import records_dir, repo_root
from exam.prompt import digest, start_prompt, task_file
from exam.runner import run, run_quiet
from exam.tasks import Task, task_digest
from exam.tree import build_manifest, write_snapshot

Echo = Callable[[str], None]


class PrepareError(RuntimeError):
    """Görev klasörü hazırlanamadı (ileti ne yapılacağını söyler)."""


def _check_target(target: Path, allow_inside_repo: bool) -> None:
    if target.exists() and (not target.is_dir() or any(target.iterdir())):
        raise PrepareError(
            f"Hedef klasör boş değil: {target}\nYeni bir klasör adı verin (ör. {target}-2)."
        )
    root = repo_root().resolve()
    if not allow_inside_repo and (target == root or root in target.parents):
        raise PrepareError(
            f"Görev klasörü deponun içinde ({root}) açılamaz: ajan oradan gizli testlere ve çözümlere "
            "ulaşabilir. Deponun dışında bir klasör verin, ör. ~/sinav/<görev>-1"
        )


def _git_init(target: Path, echo: Echo) -> bool:
    ident = [
        "-c",
        "user.name=sinav",
        "-c",
        "user.email=sinav@example.invalid",
        "-c",
        "commit.gpgsign=false",
    ]
    for command in (
        ["git", "init", "-q"],
        ["git", "add", "-A"],
        ["git", *ident, "commit", "-q", "-m", "Başlangıç durumu (sınav)"],
    ):
        code, output = run_quiet(command, target)
        if code != 0:
            echo(f"UYARI: git adımı başarısız ({' '.join(command)}): {output[:300]}")
            return False
    return True


def prepare(
    task: Task,
    target: Path,
    *,
    install: bool = True,
    git: bool = True,
    allow_inside_repo: bool = False,
    echo: Echo = print,
    now: Callable[[], datetime] = lambda: datetime.now().astimezone(),
) -> records.Record:
    """Görev klasörünü hazırlar ve kaydı döndürür."""
    target = target.expanduser().resolve()
    _check_target(target, allow_inside_repo)
    foundation = foundations.find_foundation(task.foundation)
    copy_name = foundation.yol.name
    copy_root = target / copy_name
    run_id = records.new_run_id(task.id, now())
    record_dir = records_dir() / run_id

    echo(f"[1/5] {foundation.goreli} kopyalanıyor → {copy_root}")
    target.mkdir(parents=True, exist_ok=True)
    foundations.copy_foundation(foundation, copy_root)
    foundation_digest = hashlib.sha256(repr(sorted(build_manifest(copy_root).items())).encode())

    echo(f"[2/5] Başlangıç durumu hazırlanıyor ({task.id}/hazirla.py)")
    scripts.apply(task, "hazirla", copy_root)

    echo("[3/5] GOREV.md yazılıyor")
    copy = foundations.at_copy(foundation, copy_root)
    check_text = foundations.check_text_for_agent(
        copy_name, foundations.check_commands(copy, task.check_commands)
    )
    prompt = start_prompt(copy_name, check_text)
    message = task.message_path.read_text(encoding="utf-8")
    (target / "GOREV.md").write_text(
        task_file(task.title, prompt, message, str(target), task.id), encoding="utf-8"
    )

    if install:
        echo("[4/5] Bağımlılıklar kuruluyor (ilk seferde birkaç dakika sürebilir)")
        env = foundations.command_env(copy, venv=False)
        for index, (command, cwd) in enumerate(foundations.install_commands(copy), start=1):
            result = run(command, cwd, record_dir / f"kurulum-{index}.log", env=env, timeout_s=1800)
            if not result.ok:
                raise PrepareError(
                    f"Kurulum başarısız: {command}\n{result.tail()}\nGünlük: {result.log}\n"
                    f"Sorunu giderdikten sonra yarım kalan klasörü silip yeniden hazırlayın: {target}"
                )
    else:
        echo("[4/5] Bağımlılık kurulumu atlandı (--kurma)")

    echo("[5/5] Başlangıç özetleri ve anlık görüntü kaydediliyor")
    manifest = build_manifest(copy_root)
    record = records.Record(
        run_id=run_id,
        task_id=task.id,
        foundation=task.foundation,
        folder=str(target),
        copy_name=copy_name,
        prepared_at=now().isoformat(timespec="seconds"),
        prompt_digest=digest(prompt),
        task_digest=task_digest(task),
        foundation_digest=foundation_digest.hexdigest()[:16],
        manifest=manifest,
        installed=install,
    )
    record.save()
    write_snapshot(copy_root, manifest, record.dir / "baslangic.tar.gz")
    (target / records.POINTER).write_text(run_id + "\n", encoding="utf-8")
    if git:
        _git_init(target, echo)
    return record
