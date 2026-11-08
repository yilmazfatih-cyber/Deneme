"""İş kuyruğu: asyncio tabanlı tek işçi (aynı anda tek kurulum).

* `JobManager.submit(kind, module_id, coro_factory) -> job_id` — `coro_factory(job: JobContext)` bir eşyordam döner.
* İlerleme ve log satırları hem veritabanına (`jobs` tablosu, kısıtlı sıklıkta) hem bellek içi abonelere gider.
* `subscribe(job_id)` SSE için olay üreten async generator'dür.
* `JobContext.progress/log` başka thread'den de (ör. indirme izleyicisi) güvenle çağrılabilir.
* Süreç yeniden başlarsa `running`/`queued` kalmış işler `failed` ("süreç yeniden başlatıldı") olur.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import select, update

from ..config import get_settings
from ..db import init_db, session_scope
from .models import Job, utcnow

log = logging.getLogger("aiplatform.jobs")

TERMINAL = {"done", "failed", "cancelled"}
MAX_LOG_LINES = 5000
API_LOG_LINES = 50
PERSIST_INTERVAL = 0.5


class JobCancelled(Exception):
    """İş kullanıcı tarafından iptal edildi."""


@dataclass
class _JobState:
    id: str
    kind: str
    module_id: str | None
    status: str = "queued"
    progress: int = 0
    step: str = ""
    lines: list[str] = field(default_factory=list)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error: str | None = None
    result: Any = None
    last_persist: float = 0.0
    cancel_event: threading.Event = field(default_factory=threading.Event)
    task: asyncio.Task | None = None


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


class JobContext:
    """Çalışan işe verilen tutamak: ilerleme, adım metni, log ve iptal bilgisi."""

    def __init__(self, manager: JobManager, job_id: str, lo: float = 0.0, hi: float = 100.0):
        self._m = manager
        self.id = job_id
        self._lo = lo
        self._hi = hi

    @property
    def cancelled(self) -> bool:
        st = self._m._states.get(self.id)
        return bool(st and st.cancel_event.is_set())

    def raise_if_cancelled(self) -> None:
        if self.cancelled:
            raise JobCancelled("iş iptal edildi")

    def progress(self, pct: float, step: str | None = None) -> None:
        """pct bu bağlamın 0-100 aralığındadır; alt bağlamda (scaled) üst aralığa ölçeklenir."""
        pct = min(max(pct, 0.0), 100.0)
        real = self._lo + (self._hi - self._lo) * pct / 100.0
        self._m._update(self.id, progress=int(real), step=step)

    def step(self, text: str, pct: float | None = None) -> None:
        if pct is None:
            self._m._update(self.id, step=text)
        else:
            self.progress(pct, text)
        self.log(text)

    def log(self, line: str) -> None:
        for part in str(line).splitlines() or [""]:
            self._m._log(self.id, part)

    def set_result(self, result: Any) -> None:
        self._m._states[self.id].result = result

    def scaled(self, lo: float, hi: float) -> JobContext:
        """Bu bağlamın [lo, hi] dilimini 0-100 gibi kullanan alt bağlam."""
        span = self._hi - self._lo
        return JobContext(self._m, self.id, self._lo + span * lo / 100.0, self._lo + span * hi / 100.0)


CoroFactory = Callable[[JobContext], Awaitable[Any]]


class JobManager:
    def __init__(self) -> None:
        self._states: dict[str, _JobState] = {}
        self._lock = threading.Lock()
        self._subs: dict[str, list[tuple[asyncio.AbstractEventLoop, asyncio.Queue]]] = {}
        self._loop: asyncio.AbstractEventLoop | None = None
        self._queue: asyncio.Queue | None = None
        self._worker: asyncio.Task | None = None
        self.recover()

    # ───────────── başlangıç
    def recover(self) -> int:
        """Önceki süreçten yarım kalan işleri başarısız işaretler."""
        init_db()
        with session_scope() as s:
            res = s.execute(
                update(Job)
                .where(Job.status.in_(["running", "queued"]))
                .values(status="failed", error="süreç yeniden başlatıldı", finished_at=utcnow())
            )
            n = res.rowcount or 0
        if n:
            log.warning("%d yarım kalmış iş 'failed' olarak işaretlendi (süreç yeniden başlatıldı)", n)
        return n

    # ───────────── kuyruk
    def _ensure_worker(self) -> None:
        loop = asyncio.get_running_loop()
        if self._loop is not loop or self._worker is None or self._worker.done():
            self._loop = loop
            self._queue = asyncio.Queue()
            self._worker = loop.create_task(self._run_worker(), name="aiplatform-job-worker")

    def submit(self, kind: str, module_id: str | None, coro_factory: CoroFactory) -> str:
        """İşi kuyruğa alır ve kimliğini döner. Çalışan bir olay döngüsü içinden çağrılmalıdır."""
        self._ensure_worker()
        job_id = str(uuid.uuid4())
        st = _JobState(id=job_id, kind=kind, module_id=module_id, step="Sırada bekliyor")
        self._states[job_id] = st
        with session_scope() as s:
            s.add(Job(id=job_id, kind=kind, module_id=module_id, status="queued", progress=0, step=st.step))
        assert self._queue is not None
        self._queue.put_nowait((job_id, coro_factory))
        return job_id

    async def _run_worker(self) -> None:
        assert self._queue is not None
        q = self._queue
        while True:
            job_id, factory = await q.get()
            try:
                await self._run_one(job_id, factory)
            except asyncio.CancelledError:
                raise
            except Exception:  # işçi asla ölmemeli
                log.exception("iş işçisinde beklenmeyen hata")
            finally:
                q.task_done()

    async def _run_one(self, job_id: str, factory: CoroFactory) -> None:
        st = self._states[job_id]
        if st.status == "cancelled":
            return
        st.started_at = utcnow()
        self._update(job_id, status="running", step="Başladı")
        ctx = JobContext(self, job_id)
        task = asyncio.ensure_future(factory(ctx))
        st.task = task
        try:
            result = await task
        except (asyncio.CancelledError, JobCancelled):
            if not st.cancel_event.is_set():
                # işçinin kendisi iptal edildi (olay döngüsü kapanıyor)
                self._finish(job_id, "failed", error="süreç durduruldu")
                raise
            self._finish(job_id, "cancelled", error="kullanıcı iptal etti")
            return
        except Exception as e:  # noqa: BLE001 — her hata işi başarısız kılar
            log.warning("iş %s başarısız: %s", job_id, e)
            res = getattr(e, "result", None)
            if res is not None:
                st.result = res
            self._log(job_id, f"HATA: {e}")
            self._finish(job_id, "failed", error=str(e))
            return
        if result is not None and st.result is None:
            st.result = result
        self._finish(job_id, "done", progress=100, step="Tamamlandı")

    def cancel(self, job_id: str) -> bool:
        st = self._states.get(job_id)
        if st is None or st.status in TERMINAL:
            return False
        st.cancel_event.set()
        if st.status == "queued":
            self._finish(job_id, "cancelled", error="kullanıcı iptal etti")
            return True
        if st.task is not None and self._loop is not None:
            self._loop.call_soon_threadsafe(st.task.cancel)
        return True

    # ───────────── durum güncelleme
    def _update(
        self, job_id: str, *, status: str | None = None, progress: int | None = None, step: str | None = None
    ) -> None:
        st = self._states.get(job_id)
        if st is None:
            return
        with self._lock:
            changed_status = status is not None and status != st.status
            if status is not None:
                st.status = status
            if progress is not None:
                st.progress = max(st.progress, min(progress, 100))
            if step is not None:
                st.step = step
        self._persist(st, force=changed_status or step is not None)
        self._publish(
            job_id, {"type": "progress", "status": st.status, "progress": st.progress, "step": st.step}
        )

    def _log(self, job_id: str, line: str) -> None:
        st = self._states.get(job_id)
        if st is None:
            return
        with self._lock:
            st.lines.append(line)
            if len(st.lines) > MAX_LOG_LINES:
                del st.lines[: len(st.lines) - MAX_LOG_LINES]
        self._persist(st)
        self._publish(job_id, {"type": "log", "line": line})

    def _finish(
        self,
        job_id: str,
        status: str,
        *,
        error: str | None = None,
        progress: int | None = None,
        step: str | None = None,
    ) -> None:
        st = self._states[job_id]
        with self._lock:
            st.status = status
            st.error = error
            st.finished_at = utcnow()
            if progress is not None:
                st.progress = progress
            if step is not None:
                st.step = step
            elif status == "failed":
                st.step = "Başarısız"
            elif status == "cancelled":
                st.step = "İptal edildi"
        self._persist(st, force=True)
        self._publish(
            job_id, {"type": "progress", "status": st.status, "progress": st.progress, "step": st.step}
        )
        self._publish(job_id, {"type": "end", "status": st.status, "error": st.error, "result": st.result})

    def _persist(self, st: _JobState, force: bool = False) -> None:
        now = time.monotonic()
        if not force and now - st.last_persist < PERSIST_INTERVAL:
            return
        st.last_persist = now
        with self._lock:
            values = {
                "status": st.status,
                "progress": st.progress,
                "step": st.step,
                "log_text": "\n".join(st.lines),
                "started_at": st.started_at,
                "finished_at": st.finished_at,
                "error": st.error,
                "result_json": json.dumps(st.result, ensure_ascii=False, default=str)
                if st.result is not None
                else None,
            }
        try:
            with session_scope() as s:
                s.execute(update(Job).where(Job.id == st.id).values(**values))
        except Exception:
            log.exception("iş durumu kaydedilemedi: %s", st.id)

    def _publish(self, job_id: str, event: dict) -> None:
        for loop, q in list(self._subs.get(job_id, [])):
            try:
                loop.call_soon_threadsafe(q.put_nowait, event)
            except RuntimeError:  # döngü kapanmış
                pass

    # ───────────── okuma
    def _state_dict(self, st: _JobState, log_lines: int = API_LOG_LINES) -> dict:
        return {
            "id": st.id,
            "kind": st.kind,
            "module_id": st.module_id,
            "status": st.status,
            "progress": st.progress,
            "step": st.step,
            "log": st.lines[-log_lines:],
            "started_at": _iso(st.started_at),
            "finished_at": _iso(st.finished_at),
            "error": st.error,
            "result": st.result,
        }

    @staticmethod
    def _row_dict(row: Job, log_lines: int = API_LOG_LINES) -> dict:
        lines = row.log_text.splitlines() if row.log_text else []
        return {
            "id": row.id,
            "kind": row.kind,
            "module_id": row.module_id,
            "status": row.status,
            "progress": row.progress,
            "step": row.step,
            "log": lines[-log_lines:],
            "started_at": _iso(row.started_at),
            "finished_at": _iso(row.finished_at),
            "error": row.error,
            "result": json.loads(row.result_json) if row.result_json else None,
        }

    def get(self, job_id: str) -> dict | None:
        st = self._states.get(job_id)
        if st is not None:
            return self._state_dict(st)
        with session_scope() as s:
            row = s.get(Job, job_id)
            return self._row_dict(row) if row else None

    def list(self, limit: int = 50, module_id: str | None = None) -> list[dict]:
        with session_scope() as s:
            q = select(Job).order_by(Job.created_at.desc()).limit(limit)
            if module_id:
                q = q.where(Job.module_id == module_id)
            rows = s.scalars(q).all()
            out = []
            for r in rows:
                st = self._states.get(r.id)
                out.append(self._state_dict(st) if st else self._row_dict(r))
            return out

    async def wait(self, job_id: str, timeout: float | None = None) -> dict:
        """İş bitene kadar bekler (CLI ve testler için)."""

        async def _w() -> dict:
            async for ev in self.subscribe(job_id):
                if ev["type"] == "end":
                    break
            return self.get(job_id) or {}

        return await asyncio.wait_for(_w(), timeout)

    async def subscribe(self, job_id: str) -> AsyncIterator[dict]:
        """İlk olay anlık durumdur; ardından progress/log olayları, son olarak `end`."""
        snap = self.get(job_id)
        if snap is None:
            return
        loop = asyncio.get_running_loop()
        q: asyncio.Queue = asyncio.Queue()
        entry = (loop, q)
        self._subs.setdefault(job_id, []).append(entry)
        try:
            yield {"type": "snapshot", **snap}
            if snap["status"] in TERMINAL:
                yield {
                    "type": "end",
                    "status": snap["status"],
                    "error": snap["error"],
                    "result": snap["result"],
                }
                return
            while True:
                ev = await q.get()
                yield ev
                if ev["type"] == "end":
                    return
        finally:
            subs = self._subs.get(job_id, [])
            if entry in subs:
                subs.remove(entry)
            if not subs:
                self._subs.pop(job_id, None)


_manager: JobManager | None = None
_manager_key: tuple | None = None


def get_job_manager() -> JobManager:
    """Ayarlara bağlı tekil iş yöneticisi (testlerde ayar sıfırlanınca yenisi kurulur)."""
    global _manager, _manager_key
    s = get_settings()
    key = (id(s), str(s.db_path))
    if _manager is None or _manager_key != key:
        _manager = JobManager()
        _manager_key = key
    return _manager


def reset_job_manager() -> None:
    global _manager, _manager_key
    _manager = None
    _manager_key = None
