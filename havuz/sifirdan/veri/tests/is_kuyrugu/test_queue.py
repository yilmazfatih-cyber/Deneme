"""İş kuyruğu: kira (görünürlük zaman aşımı), geri çekilme, ölü mektup, idempotentlik, cron, eşzamanlı
işçiler (gerçek iş parçacıkları) ve gerçek süreç çökmesi. Zaman sahte saatle yönetilir; `sleep` yok."""

from __future__ import annotations

import json
import os
import random
import subprocess
import sys
import threading
from datetime import UTC, datetime
from pathlib import Path

import pytest

from is_kuyrugu import Job, JobQueue, LeaseLostError, Worker
from is_kuyrugu.__main__ import main as cli_main

ROOT = Path(__file__).resolve().parents[2]
START = datetime(2026, 11, 16, 10, 0, tzinfo=UTC).timestamp()


class FakeClock:
    def __init__(self) -> None:
        self.now = START

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def queue(tmp_path: Path, clock: FakeClock) -> JobQueue:
    created = JobQueue(tmp_path / "is.db", clock=clock, visibility_timeout=30, rng=random.Random(1))
    yield created  # type: ignore[misc]
    created.close()


def test_priority_delay_and_ack(queue: JobQueue, clock: FakeClock) -> None:
    queue.enqueue("e", {"no": 1})
    queue.enqueue("e", {"no": 2}, priority=5)
    queue.enqueue("e", {"no": 3}, delay=60)
    first = queue.reserve("e")
    second = queue.reserve("e")
    assert first is not None and second is not None
    assert (first.payload, second.payload) == ({"no": 2}, {"no": 1})  # öncelik önce
    assert queue.reserve("e") is None  # 3. iş henüz görünmez
    queue.ack(first)
    queue.ack(second)
    clock.advance(61)
    third = queue.reserve("e")
    assert third is not None and third.payload == {"no": 3}
    assert queue.stats("e") == {"tamam": 2, "isleniyor": 1}


def test_visibility_timeout_and_lost_lease(queue: JobQueue, clock: FakeClock) -> None:
    queue.enqueue("e", {"is": "x"})
    slow = queue.reserve("e", "yavas")
    assert slow is not None and queue.reserve("e") is None  # kirada: görünmez
    clock.advance(31)
    fast = queue.reserve("e", "hizli")
    assert fast is not None and fast.id == slow.id and fast.attempts == 2
    with pytest.raises(LeaseLostError):
        queue.ack(slow)  # eski işçi başkasının işini onaylayamaz
    queue.extend(fast, 120)
    clock.advance(100)
    assert queue.reserve("e") is None  # kira uzatıldı
    queue.ack(fast)


def test_exponential_backoff_then_dead_letter(queue: JobQueue, clock: FakeClock) -> None:
    queue.enqueue("e", {"is": "hep-bozuk"}, max_attempts=4)
    waits = []
    for _ in range(3):
        job = queue.reserve("e")
        assert job is not None
        queue.fail(job, "ValueError: bozuk")
        visible_at = queue.db.execute("SELECT visible_at FROM jobs").fetchone()[0]
        waits.append(visible_at - clock.now)
        clock.advance(waits[-1])
    assert waits == [2.0, 4.0, 8.0]  # 2 · 2^(deneme-1)
    last = queue.reserve("e")
    assert last is not None and last.attempts == 4
    queue.fail(last, "ValueError: yine")
    assert queue.dead_letters("e") == [(last.id, {"is": "hep-bozuk"}, "ValueError: yine")]
    queue.requeue(last.id)
    assert queue.reserve("e") is not None


def test_crashing_workers_end_in_dead_letter(queue: JobQueue, clock: FakeClock) -> None:
    queue.enqueue("e", {"is": "zehirli"}, max_attempts=2)
    for _ in range(2):
        assert queue.reserve("e") is not None  # işçi alır ve "ölür" (hiç yanıt yok)
        clock.advance(31)
    assert queue.reserve("e") is None
    assert queue.dead_letters("e")[0][2].startswith("kira süresi doldu")


def test_idempotency_key(queue: JobQueue) -> None:
    first = queue.enqueue("e", {"siparis": 42}, idempotency_key="siparis-42")
    again = queue.enqueue("e", {"siparis": 42}, idempotency_key="siparis-42")
    assert first == again and queue.stats("e") == {"bekliyor": 1}


def test_recurring_jobs_one_per_slot_even_with_two_schedulers(
    queue: JobQueue, clock: FakeClock, tmp_path: Path
) -> None:
    queue.schedule("rapor", "*/5 * * * *", "e", {"tur": "rapor"})
    other = JobQueue(tmp_path / "is.db", clock=clock)
    clock.advance(5 * 60)  # 10:05
    created = queue.tick() + other.tick() + queue.tick()
    assert len(set(created)) == 1
    clock.advance(10 * 60)  # 10:15 — arada 10:10 kaçtı: bir yakalama işi + sonraki 10:20
    queue.tick()
    other.tick()
    assert queue.stats("e") == {"bekliyor": 2}
    other.close()


def test_threads_never_take_the_same_job(tmp_path: Path, clock: FakeClock) -> None:
    path = tmp_path / "es.db"
    setup = JobQueue(path, clock=clock)
    for number in range(300):
        setup.enqueue("e", {"no": number})
    seen: list[tuple[int, str]] = []
    lock = threading.Lock()

    def work(name: str) -> None:
        own = JobQueue(path, clock=clock, rng=random.Random(name))
        while (job := own.reserve("e", name)) is not None:
            with lock:
                seen.append((job.id, name))
            own.ack(job)
        own.close()

    threads = [threading.Thread(target=work, args=(f"isci-{n}",)) for n in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    ids = [job_id for job_id, _ in seen]
    assert len(ids) == 300 and len(set(ids)) == 300  # her iş tam bir kez alındı
    assert len({name for _, name in seen}) > 1  # gerçekten birden çok işçi çalıştı
    assert setup.stats("e") == {"tamam": 300}
    setup.close()


def _child(path: Path, code: str) -> int:
    script = (
        "import os, random, sqlite3\n"
        "from is_kuyrugu import JobQueue\n"
        f"q = JobQueue({str(path)!r}, clock=lambda: {START}, rng=random.Random(9))\n" + code
    )
    env = {**os.environ, "PYTHONPATH": str(ROOT)}
    return subprocess.run([sys.executable, "-c", script], env=env, check=False).returncode


def test_real_process_crash_after_reserve_and_inside_transaction(
    tmp_path: Path, clock: FakeClock
) -> None:
    path = tmp_path / "cokme.db"
    queue = JobQueue(path, clock=clock)
    first = queue.enqueue("e", {"no": 1})
    # 1) Süreç işi aldıktan sonra, onaylamadan ölür.
    assert _child(path, "q.reserve('e', 'olen')\nos._exit(3)\n") == 3
    assert queue.reserve("e") is None  # kirada
    clock.advance(31)
    job = queue.reserve("e", "kurtaran")
    assert job is not None and job.id == first and job.attempts == 2
    queue.ack(job)
    # 2) Süreç alma işleminin ORTASINDA (COMMIT'ten önce) ölür: hiçbir şey olmamış sayılır.
    second = queue.enqueue("e", {"no": 2})
    code = (
        "q.db.execute('BEGIN IMMEDIATE')\n"
        "q.db.execute(\"UPDATE jobs SET status='isleniyor' WHERE id=?\", (" + str(second) + ",))\n"
        "os._exit(4)\n"
    )
    assert _child(path, code) == 4
    job = queue.reserve("e")
    assert job is not None and job.id == second and job.attempts == 1
    queue.close()


def test_worker_crash_is_at_least_once_but_effect_once(queue: JobQueue, clock: FakeClock) -> None:
    """En az bir kez teslim + idempotent işleyici = yan etki bir kez."""
    queue.enqueue("odeme", {"tutar": 100}, idempotency_key="odeme-7")
    charged: list[str] = []
    calls: list[int] = []

    def charge(job: Job) -> None:
        calls.append(job.id)
        if job.idempotency_key not in charged:  # "bunu zaten yaptım mı?"
            charged.append(str(job.idempotency_key))

    crashed = queue.reserve("odeme", "cokecek")
    assert crashed is not None
    charge(crashed)  # yan etki yapıldı ama işçi ack'ten önce öldü
    clock.advance(31)
    assert Worker(queue, "yedek", "odeme", charge).drain() == 1
    assert len(calls) == 2 and charged == ["odeme-7"]
    assert queue.stats("odeme") == {"tamam": 1}


def test_worker_retries_failing_handler(queue: JobQueue, clock: FakeClock) -> None:
    queue.enqueue("e", {"is": 1})
    attempts: list[int] = []

    def flaky(job: Job) -> None:
        attempts.append(job.attempts)
        if job.attempts < 3:
            raise RuntimeError("geçici hata")

    worker = Worker(queue, "isci", "e", flaky)
    while queue.stats("e").get("tamam", 0) == 0:
        worker.drain()
        clock.advance(10)
    assert attempts == [1, 2, 3] and worker.failed == 2 and worker.processed == 1


def test_cli(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    db = str(tmp_path / "cli.db")
    assert cli_main([db, "ekle", "e", json.dumps({"a": 1}), "--anahtar", "k1"]) == 0
    assert cli_main([db, "ekle", "e", json.dumps({"a": 1}), "--anahtar", "k1"]) == 0
    assert cli_main([db, "durum", "e"]) == 0
    assert "bekliyor: 1" in capsys.readouterr().out
    assert cli_main([db, "zamanla", "r", "61 * * * *", "e", "{}"]) == 1
    assert "0–59" in capsys.readouterr().err
    assert cli_main([db, "ekle", "e", "[1]"]) == 1
