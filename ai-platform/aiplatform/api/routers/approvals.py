"""İnsan onayı kuyruğu uçları (/api/approvals)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Header
from pydantic import BaseModel

from ...erp import approvals as ap
from ...erp.connector import ErpError, error_response

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


class DecisionIn(BaseModel):
    decision: Literal["approve", "reject"]
    note: str | None = None
    decided_by: str | None = None


@router.get("")
def list_approvals(status: str | None = None, limit: int = 100, offset: int = 0):
    """status boşsa hepsi; 'pending' bekleyenler."""
    if status and status not in ap.STATUSES:
        return error_response(
            ErpError("bad_status", f"Geçersiz durum: '{status}'", f"Geçerli: {', '.join(ap.STATUSES)}")
        )
    return ap.list_approvals(status=status, limit=max(1, min(limit, 500)), offset=max(0, offset))


@router.get("/{approval_id}")
def get_approval(approval_id: str):
    try:
        return ap.get_approval(approval_id)
    except ErpError as e:
        return error_response(e)


@router.post("/{approval_id}/decide")
async def decide(approval_id: str, body: DecisionIn, x_user: str | None = Header(default=None, alias="X-AIP-User")):
    """Onay: yazma işlemi çalışır, sonuç kayda yazılır. Ret: hiçbir şey çalışmaz."""
    who = (body.decided_by or x_user or "yonetici")[:100]
    try:
        result = await ap.adecide(approval_id, body.decision, decided_by=who, note=body.note)
    except ErpError as e:
        return error_response(e)
    try:
        from ...kvkk import audit

        audit.record(
            who,
            result["module"],
            f"onay:{body.decision}",
            status="ok" if result["status"] != "failed" else "error",
            error=(result.get("result") or {}).get("error", {}).get("message")
            if result["status"] == "failed"
            else None,
        )
    except ImportError:
        pass
    return result
