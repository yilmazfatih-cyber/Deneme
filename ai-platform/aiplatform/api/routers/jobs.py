"""İş kuyruğu uç noktaları: liste, ayrıntı, SSE olay akışı, iptal."""

from __future__ import annotations

import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from ...installer import installer
from ...installer.jobs import get_job_manager
from ._errors import error_response, not_found

router = APIRouter(prefix="/api/jobs", tags=["işler"])


@router.get("")
def list_jobs(limit: int = 50, module_id: str | None = None) -> list[dict]:
    installer.bootstrap()
    return get_job_manager().list(limit=min(max(limit, 1), 500), module_id=module_id)


@router.get("/{job_id}")
def get_job(job_id: str):
    installer.bootstrap()
    j = get_job_manager().get(job_id)
    return j if j is not None else not_found(f"iş '{job_id}'")


@router.get("/{job_id}/events")
async def job_events(job_id: str):
    """SSE (text/event-stream): her olay `data: {json}\\n\\n`; son olay `{"type": "end", ...}`."""
    installer.bootstrap()
    jm = get_job_manager()
    if jm.get(job_id) is None:
        return not_found(f"iş '{job_id}'")

    async def stream():
        yield "retry: 3000\n\n"
        async for ev in jm.subscribe(job_id):
            yield f"data: {json.dumps(ev, ensure_ascii=False, default=str)}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{job_id}/cancel")
def cancel_job(job_id: str):
    installer.bootstrap()
    jm = get_job_manager()
    j = jm.get(job_id)
    if j is None:
        return not_found(f"iş '{job_id}'")
    if not jm.cancel(job_id):
        return error_response(409, "not_cancellable", f"İş iptal edilemez (durum: {j['status']})")
    return {"job_id": job_id, "cancelled": True}
