"""Denetim günlüğü uçları (/api/audit). Tablo ve özet `aiplatform.kvkk` paketindedir; paket yoksa boş döner."""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, time

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from ...erp.connector import ErpError, error_response

router = APIRouter(prefix="/api/audit", tags=["audit"])
log = logging.getLogger("aiplatform.audit.api")


def _kvkk():
    try:
        from ...kvkk import audit as audit_mod
        from ...kvkk.models import AuditLog
    except ImportError as e:
        log.warning("denetim günlüğü paketi yüklenemedi: %s", e)
        return None, None
    return audit_mod, AuditLog


def _parse(value: str | None, end: bool = False) -> datetime | None:
    if not value:
        return None
    try:
        if len(value) == 10:
            d = date.fromisoformat(value)
            return datetime.combine(d, time.max if end else time.min)
        dt = datetime.fromisoformat(value)
        # audit_log saat dilimsiz UTC tutar: dilimli girdi UTC'ye çevrilir
        return dt.astimezone(UTC).replace(tzinfo=None) if dt.tzinfo else dt
    except ValueError as e:
        raise ErpError("bad_date", f"Tarih anlaşılamadı: '{value}'", "Biçim: YYYY-AA-GG veya ISO 8601") from e


@router.get("")
def list_audit(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = None,
    module: str | None = None,
    user: str | None = None,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
):
    limit = max(1, min(limit, 1000))
    offset = max(0, offset)
    try:
        start, end = _parse(from_), _parse(to, end=True)
    except ErpError as e:
        return error_response(e)
    audit_mod, AuditLog = _kvkk()
    if AuditLog is None:
        return {"items": [], "total": 0, "limit": limit, "offset": offset, "available": False}
    from ...db import session_scope

    getattr(audit_mod, "ensure_tables", lambda: None)()
    conds = []
    if start:
        conds.append(AuditLog.ts >= start)
    if end:
        conds.append(AuditLog.ts <= end)
    if module:
        conds.append(AuditLog.module == module)
    if user:
        conds.append(AuditLog.user == user)
    if status:
        conds.append(AuditLog.status == status)
    with session_scope() as s:
        total = s.scalar(select(func.count()).select_from(AuditLog).where(*conds)) or 0
        rows = s.scalars(
            select(AuditLog).where(*conds).order_by(AuditLog.ts.desc()).limit(limit).offset(offset)
        ).all()
        items = [
            r.to_dict()
            if hasattr(r, "to_dict")
            else {c.name: getattr(r, c.key, None) for c in r.__table__.columns}
            for r in rows
        ]
        modules = sorted(m for (m,) in s.execute(select(AuditLog.module).distinct()) if m)
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "modules": modules,
        "available": True,
    }


@router.get("/summary")
def audit_summary(from_: str | None = Query(default=None, alias="from"), to: str | None = None):
    try:
        start, end = _parse(from_), _parse(to, end=True)
    except ErpError as e:
        return error_response(e)
    audit_mod, _ = _kvkk()
    if audit_mod is None or not hasattr(audit_mod, "summary"):
        return {
            "from": from_,
            "to": to,
            "total_calls": 0,
            "masked_entities_total": 0,
            "errors_total": 0,
            "modules": [],
            "available": False,
        }
    out = audit_mod.summary(start, end)
    out["available"] = True
    return out
