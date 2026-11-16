"""SQLite üstünde kalıcı iş kuyruğu: en az bir kez teslim, görünürlük zaman aşımı, üstel geri
çekilme, ölü mektup, idempotentlik anahtarı, gecikmeli/öncelikli/yinelenen işler.

Tek tablo `jobs`; her işin durumu: bekliyor → isleniyor → tamam | (hata) bekliyor (geri çekilmeyle)
| olu. `visible_at`: işin alınabileceği an. Bekleyen için "çalışma zamanı", işlenen için "kira
bitişi" demektir; kira biten iş (işçi çöktü ya da yavaş kaldı) yeniden alınabilir → EN AZ BİR KEZ
teslim.

Aynı işi iki işçi almaz: alma işlemi `BEGIN IMMEDIATE` ile yazma kilidini alıp TEK işlemde seçer ve
günceller. Her alma yeni bir kira jetonu üretir; ack/fail jetonu denetler → kirası düşmüş eski işçi
başkasının aldığı işi onaylayamaz (`LeaseLostError`).

Genişletme: yeni bir alan (ör. `progress`) → `_SCHEMA`'ya sütun + `Job`'a alan + `_job()`'a eşleme.
Şema değişince `SCHEMA_VERSION`'ı artırıp `_migrate`'e adım ekleyin.
"""

from __future__ import annotations

import json
import random
import sqlite3
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from .cron import Cron

SCHEMA_VERSION = 1
_SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY,
    queue TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL,              -- bekliyor | isleniyor | tamam | olu
    priority INTEGER NOT NULL DEFAULT 0,
    visible_at REAL NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL,
    idempotency_key TEXT UNIQUE,
    lease_token TEXT,
    worker TEXT,
    last_error TEXT,
    created_at REAL NOT NULL,
    finished_at REAL
);
CREATE INDEX IF NOT EXISTS jobs_ready ON jobs (queue, status, priority DESC, visible_at, id);
CREATE TABLE IF NOT EXISTS schedules (
    name TEXT PRIMARY KEY, cron TEXT NOT NULL, queue TEXT NOT NULL, payload TEXT NOT NULL,
    next_run REAL NOT NULL
);
"""

Clock = Callable[[], float]


class LeaseLostError(Exception):
    """İşin kirası düştü ve iş başka bir işçiye geçti; bu işçinin sonucu yok sayılmalı."""


@dataclass(frozen=True)
class Job:
    id: int
    queue: str
    payload: dict[str, object]
    attempts: int
    max_attempts: int
    lease_token: str
    idempotency_key: str | None
    priority: int


class JobQueue:
    """Bir SQLite dosyasına bağlı kuyruk. Her iş parçacığı/süreç KENDİ JobQueue nesnesini
    açmalıdır."""

    def __init__(
        self,
        path: str | Path,
        *,
        clock: Clock = time.time,
        visibility_timeout: float = 30.0,
        max_attempts: int = 5,
        backoff_base: float = 2.0,
        backoff_max: float = 3600.0,
        rng: random.Random | None = None,
    ) -> None:
        self.clock = clock
        self.visibility_timeout = visibility_timeout
        self.max_attempts = max_attempts
        self.backoff_base = backoff_base
        self.backoff_max = backoff_max
        self.rng = rng or random.Random()
        self.db = sqlite3.connect(
            str(path), timeout=60, isolation_level=None
        )  # elle işlem yönetimi
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")  # onaylı yazma güç kesintisinde de kalsın
        self.db.executescript(_SCHEMA)
        self.db.execute(f"PRAGMA user_version={SCHEMA_VERSION}")

    def close(self) -> None:
        self.db.close()

    # ── Ekleme ──────────────────────────────────────────────────────────────────────────────────

    def enqueue(
        self,
        queue: str,
        payload: dict[str, object],
        *,
        priority: int = 0,
        delay: float = 0.0,
        run_at: float | None = None,
        idempotency_key: str | None = None,
        max_attempts: int | None = None,
    ) -> int:
        """İş ekler ve kimliğini döndürür. Aynı idempotentlik anahtarı varsa YENİ iş eklenmez,
        var olanın kimliği döner."""
        now = self.clock()
        visible = run_at if run_at is not None else now + delay
        body = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        attempts = max_attempts or self.max_attempts
        cursor = self.db.execute(
            "INSERT INTO jobs (queue, payload, status, priority, visible_at, max_attempts,"
            " idempotency_key, created_at) VALUES (?, ?, 'bekliyor', ?, ?, ?, ?, ?)"
            " ON CONFLICT (idempotency_key) DO NOTHING RETURNING id",
            (queue, body, priority, visible, attempts, idempotency_key, now),
        )
        row = cursor.fetchone()
        if row is not None:
            return int(row[0])
        existing = self.db.execute(
            "SELECT id FROM jobs WHERE idempotency_key = ?", (idempotency_key,)
        ).fetchone()
        return int(existing[0])

    # ── Alma, onaylama, hata ────────────────────────────────────────────────────────────────────

    def reserve(self, queue: str, worker: str = "isci") -> Job | None:
        """Sıradaki işi (öncelik büyük, sonra en eski) kiralar; yoksa None."""
        now = self.clock()
        self.db.execute("BEGIN IMMEDIATE")  # yazma kilidi: aynı anda tek alıcı
        try:
            while True:
                row = self.db.execute(
                    "SELECT id, status, attempts, max_attempts FROM jobs"
                    " WHERE queue = ? AND status IN ('bekliyor', 'isleniyor') AND visible_at <= ?"
                    " ORDER BY priority DESC, visible_at, id LIMIT 1",
                    (queue, now),
                ).fetchone()
                if row is None:
                    self.db.execute("COMMIT")
                    return None
                job_id, status, attempts, limit = row
                if status == "isleniyor" and attempts >= limit:  # kirası defalarca düştü
                    self._bury(job_id, "kira süresi doldu: işçi yanıt vermedi", now)
                    continue
                token = f"{self.rng.getrandbits(64):016x}"
                job_row = self.db.execute(
                    "UPDATE jobs SET status = 'isleniyor', attempts = attempts + 1,"
                    " lease_token = ?, worker = ?, visible_at = ? WHERE id = ?"
                    " RETURNING id, queue, payload, attempts, max_attempts, lease_token,"
                    " idempotency_key, priority",
                    (token, worker, now + self.visibility_timeout, job_id),
                ).fetchone()
                self.db.execute("COMMIT")
                return _job(job_row)
        except BaseException:
            self.db.execute("ROLLBACK")
            raise

    def _own(self, job: Job) -> None:
        row = self.db.execute(
            "SELECT 1 FROM jobs WHERE id = ? AND status = 'isleniyor' AND lease_token = ?",
            (job.id, job.lease_token),
        ).fetchone()
        if row is None:
            raise LeaseLostError(f"{job.id}. işin kirası düştü; iş başka işçiye geçmiş olabilir.")

    def ack(self, job: Job) -> None:
        """İşi tamamlandı say. Kira düşmüşse LeaseLostError."""
        self._transaction(lambda: self._own(job), lambda: self.db.execute(
            "UPDATE jobs SET status = 'tamam', finished_at = ?, lease_token = NULL WHERE id = ?",
            (self.clock(), job.id),
        ))  # fmt: skip

    def extend(self, job: Job, seconds: float | None = None) -> None:
        """Uzun süren iş için kirayı uzatır (kalp atışı)."""
        until = self.clock() + (seconds or self.visibility_timeout)
        self._transaction(lambda: self._own(job), lambda: self.db.execute(
            "UPDATE jobs SET visible_at = ? WHERE id = ?", (until, job.id)
        ))  # fmt: skip

    def fail(self, job: Job, error: str) -> None:
        """Hata: deneme hakkı varsa üstel geri çekilmeyle yeniden sıraya, yoksa ölü mektuba."""

        def record() -> None:
            now = self.clock()
            if job.attempts >= job.max_attempts:
                self._bury(job.id, error, now)
                return
            delay = min(self.backoff_max, self.backoff_base * 2 ** (job.attempts - 1))
            self.db.execute(
                "UPDATE jobs SET status = 'bekliyor', visible_at = ?, last_error = ?,"
                " lease_token = NULL WHERE id = ?",
                (now + delay, error, job.id),
            )

        self._transaction(lambda: self._own(job), record)

    def _bury(self, job_id: int, error: str, now: float) -> None:
        self.db.execute(
            "UPDATE jobs SET status = 'olu', last_error = ?, finished_at = ?, lease_token = NULL"
            " WHERE id = ?",
            (error, now, job_id),
        )

    def _transaction(self, check: Callable[[], None], change: Callable[[], object]) -> None:
        self.db.execute("BEGIN IMMEDIATE")
        try:
            check()
            change()
        except BaseException:
            self.db.execute("ROLLBACK")
            raise
        self.db.execute("COMMIT")

    # ── Ölü mektuplar ve gözlem ─────────────────────────────────────────────────────────────────

    def dead_letters(self, queue: str) -> list[tuple[int, dict[str, object], str]]:
        rows = self.db.execute(
            "SELECT id, payload, last_error FROM jobs WHERE queue = ? AND status = 'olu'"
            " ORDER BY id",
            (queue,),
        ).fetchall()
        return [(int(i), json.loads(p), str(e)) for i, p, e in rows]

    def requeue(self, job_id: int) -> None:
        """Ölü mektubu yeniden sıraya koyar (deneme sayacı sıfırlanır)."""
        self.db.execute(
            "UPDATE jobs SET status = 'bekliyor', attempts = 0, visible_at = ?, finished_at = NULL"
            " WHERE id = ? AND status = 'olu'",
            (self.clock(), job_id),
        )

    def stats(self, queue: str) -> dict[str, int]:
        rows = self.db.execute(
            "SELECT status, count(*) FROM jobs WHERE queue = ? GROUP BY status", (queue,)
        ).fetchall()
        return {str(status): int(count) for status, count in rows}

    # ── Yinelenen işler (cron) ──────────────────────────────────────────────────────────────────

    def schedule(self, name: str, cron: str, queue: str, payload: dict[str, object]) -> None:
        next_run = Cron.parse(cron).next_after(datetime.fromtimestamp(self.clock(), UTC))
        self.db.execute(
            "INSERT INTO schedules (name, cron, queue, payload, next_run) VALUES (?, ?, ?, ?, ?)"
            " ON CONFLICT (name) DO UPDATE SET cron = excluded.cron, queue = excluded.queue,"
            " payload = excluded.payload, next_run = excluded.next_run",
            (name, cron, queue, json.dumps(payload, ensure_ascii=False), next_run.timestamp()),
        )

    def tick(self) -> list[int]:
        """Zamanı gelen yinelenen işleri sıraya koyar. Aynı an için iki kez çağrılsa da (iki
        süreçten
        bile) her zaman dilimi BİR iş üretir: idempotentlik anahtarı "cron:<ad>:<zaman>"."""
        now = self.clock()
        created: list[int] = []
        due = self.db.execute(
            "SELECT name, cron, queue, payload, next_run FROM schedules WHERE next_run <= ?", (now,)
        ).fetchall()
        for name, expression, queue, payload, next_run in due:
            key = f"cron:{name}:{int(next_run)}"
            created.append(
                self.enqueue(queue, json.loads(payload), run_at=next_run, idempotency_key=key)
            )
            following = Cron.parse(expression).next_after(datetime.fromtimestamp(now, UTC))
            self.db.execute(
                "UPDATE schedules SET next_run = ? WHERE name = ? AND next_run = ?",
                (following.timestamp(), name, next_run),
            )
        return created


def _job(row: tuple[object, ...]) -> Job:
    job_id, queue, payload, attempts, max_attempts, token, key, priority = row
    return Job(
        int(str(job_id)),
        str(queue),
        json.loads(str(payload)),
        int(str(attempts)),
        int(str(max_attempts)),
        str(token),
        None if key is None else str(key),
        int(str(priority)),
    )
