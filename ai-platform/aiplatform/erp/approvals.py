"""İnsan onayı kuyruğu. ERP'ye yazan HİÇBİR işlem onaysız çalışmaz.

İki tür onay kaydı vardır:
  module == "erp"           → action bir bağlayıcı yazma aracıdır, payload {"connection_id": str, "args": {...}}
                              Onaylanınca `ERPConnector.execute_write` çalışır (onay kaydını veritabanında yeniden doğrular).
  module == <katalog modülü> → action o modülün eylemidir (ör. fatura-cikarim/propose_entry), payload eylem gövdesidir.
                              Onaylanınca modül çalışma zamanı `ctx.extra = {"approved": True, "approval_id": ...}` ile
                              çağrılır; modül bu bayrağı görünce yazmayı yapar.

Durumlar: pending → approved → executed | failed ; pending → rejected. Karar yalnız bir kez verilir.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from sqlalchemy import func, select, update

from ..db import session_scope
from .connector import ERP_MODULE, ErpError, get_connector
from .models import Approval, utcnow

log = logging.getLogger("aiplatform.erp.approvals")

STATUSES = ("pending", "approved", "rejected", "executed", "failed")


def _to_dict(a: Approval) -> dict:
    return {
        "id": a.id,
        "module": a.module,
        "action": a.action,
        "payload": json.loads(a.payload_json or "{}"),
        "requested_by": a.requested_by,
        "status": a.status,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "decided_by": a.decided_by,
        "decided_at": a.decided_at.isoformat() if a.decided_at else None,
        "note": a.note,
        "result": json.loads(a.result_json) if a.result_json else None,
    }


def _validate_target(module: str, action: str, payload: dict) -> None:
    if module == ERP_MODULE:
        cid = payload.get("connection_id")
        if not cid:
            raise ErpError("bad_args", "ERP yazma onayı için payload.connection_id gerekli.")
        if not get_connector(cid).is_write_tool(action):
            raise ErpError(
                "unknown_tool",
                f"'{action}' bu bağlantıda onaylı yazma aracı değil.",
                "GET /api/erp/tools",
                404,
            )
        return
    try:
        from ..catalog import get_catalog

        spec = get_catalog().modules.get(module)
    except Exception:  # noqa: BLE001 - katalog okunamazsa kayıt yine alınır
        return
    if spec is None:
        raise ErpError("unknown_module", f"Bilinmeyen modül: '{module}'", None, 404)
    if not any(a.id == action for a in spec.actions):
        raise ErpError("unknown_action", f"'{module}' modülünde '{action}' eylemi yok.", None, 404)


def create_approval(
    module: str, action: str, payload: dict[str, Any] | None, requested_by: str = "anonim"
) -> str:
    """Onay kaydı açar ve kimliğini döner. Hiçbir şey çalıştırmaz."""
    payload = payload or {}
    _validate_target(module, action, payload)
    with session_scope() as s:
        a = Approval(
            module=module,
            action=action,
            payload_json=json.dumps(payload, ensure_ascii=False, default=str),
            requested_by=requested_by or "anonim",
        )
        s.add(a)
        s.flush()
        log.info("onay istendi: %s %s/%s (%s)", a.id, module, action, requested_by)
        return a.id


def get_approval(approval_id: str) -> dict:
    with session_scope() as s:
        a = s.get(Approval, approval_id)
        if a is None:
            raise ErpError("approval_not_found", f"Onay kaydı bulunamadı: '{approval_id}'", None, 404)
        return _to_dict(a)


def list_approvals(status: str | None = None, limit: int = 100, offset: int = 0) -> dict:
    with session_scope() as s:
        q = select(Approval)
        cq = select(func.count()).select_from(Approval)
        if status:
            q = q.where(Approval.status == status)
            cq = cq.where(Approval.status == status)
        total = s.scalar(cq) or 0
        rows = s.scalars(q.order_by(Approval.created_at.desc()).limit(limit).offset(offset)).all()
        return {"items": [_to_dict(a) for a in rows], "total": total, "limit": limit, "offset": offset}


def list_pending() -> list[dict]:
    with session_scope() as s:
        rows = s.scalars(
            select(Approval).where(Approval.status == "pending").order_by(Approval.created_at)
        ).all()
        return [_to_dict(a) for a in rows]


def _claim(approval_id: str, decision: str, decided_by: str, note: str | None) -> Approval:
    """pending → approved/rejected geçişini tek UPDATE ile yapar (yarışa karşı)."""
    if decision not in ("approve", "reject"):
        raise ErpError("bad_decision", "Karar 'approve' veya 'reject' olmalı.")
    new_status = "approved" if decision == "approve" else "rejected"
    with session_scope() as s:
        a = s.get(Approval, approval_id)
        if a is None:
            raise ErpError("approval_not_found", f"Onay kaydı bulunamadı: '{approval_id}'", None, 404)
        res = s.execute(
            update(Approval)
            .where(Approval.id == approval_id, Approval.status == "pending")
            .values(status=new_status, decided_by=decided_by or "anonim", decided_at=utcnow(), note=note)
        )
        if res.rowcount != 1:
            raise ErpError(
                "already_decided", f"Bu onay için karar zaten verilmiş (durum: {a.status}).", None, 409
            )
        s.flush()
        s.refresh(a)
        log.info("onay kararı: %s → %s (%s)", approval_id, new_status, decided_by)
        return a


def _finish(approval_id: str, ok: bool, result: Any) -> dict:
    with session_scope() as s:
        a = s.get(Approval, approval_id)
        a.status = "executed" if ok else "failed"
        a.result_json = json.dumps(
            {"ok": ok, **({"result": result} if ok else {"error": result})}, ensure_ascii=False, default=str
        )
        s.flush()
        return _to_dict(a)


def _execute_erp(a: Approval) -> Any:
    payload = json.loads(a.payload_json or "{}")
    return get_connector(payload["connection_id"]).execute_write(a.action, payload.get("args") or {}, a.id)


async def _execute_module(a: Approval) -> Any:
    from ..modules.base import RunContext, get_runtime

    payload = json.loads(a.payload_json or "{}")
    ctx = RunContext(
        user=a.decided_by or "anonim",
        extra={"approved": True, "approval_id": a.id, "requested_by": a.requested_by},
    )
    return await get_runtime(a.module).run(a.action, payload, ctx)


def _error_of(e: Exception) -> dict:
    if isinstance(e, ErpError):
        return {"code": e.code, "message": e.message, "hint": e.hint}
    return {"code": type(e).__name__, "message": str(e), "hint": None}


async def execute_approved_async(approval_id: str) -> dict:
    with session_scope() as s:
        a = s.get(Approval, approval_id)
        if a is None or a.status != "approved":
            raise ErpError(
                "approval_invalid", "Yalnız 'approved' durumundaki kayıt çalıştırılabilir.", None, 409
            )
        s.expunge(a)
    try:
        if a.module == ERP_MODULE:
            result = await asyncio.to_thread(_execute_erp, a)
        else:
            result = await _execute_module(a)
    except Exception as e:  # noqa: BLE001 - sonuç kayda yazılır, kullanıcı görür
        log.warning("onaylı işlem başarısız: %s (%s)", approval_id, e)
        return _finish(approval_id, False, _error_of(e))
    return _finish(approval_id, True, result)


def execute_approved(approval_id: str) -> dict:
    """Onaylanmış kaydı çalıştırır (eşzamanlı). Çalışan bir olay döngüsü içinden `execute_approved_async` kullanın."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(execute_approved_async(approval_id))
    raise RuntimeError("execute_approved olay döngüsü içinde çağrıldı; execute_approved_async kullanın")


def decide(approval_id: str, decision: str, decided_by: str = "anonim", note: str | None = None) -> dict:
    """approve → yazma işlemini çalıştırır, sonucu result'a yazar (executed/failed); reject → rejected."""
    _claim(approval_id, decision, decided_by, note)
    if decision == "reject":
        return get_approval(approval_id)
    return execute_approved(approval_id)


async def adecide(
    approval_id: str, decision: str, decided_by: str = "anonim", note: str | None = None
) -> dict:
    """`decide`'ın async sürümü (FastAPI router'ı bunu kullanır)."""
    await asyncio.to_thread(_claim, approval_id, decision, decided_by, note)
    if decision == "reject":
        return get_approval(approval_id)
    return await execute_approved_async(approval_id)
