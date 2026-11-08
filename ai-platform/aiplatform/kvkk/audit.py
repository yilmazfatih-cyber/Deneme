"""Denetim günlüğü (`audit_log`). İçerik yazılmaz; yalnız özet alanlar ve yükün sha256 özeti (ilk 16 hex)."""

from __future__ import annotations

import hashlib
import json
import logging
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import case, func, select

from ..config import get_settings
from ..db import session_scope
from .models import AuditLog, ensure_tables, utcnow

log = logging.getLogger("aiplatform.audit")


def payload_hash(payload: Any) -> str | None:
    if payload is None:
        return None
    if isinstance(payload, bytes):
        data = payload
    elif isinstance(payload, str):
        data = payload.encode("utf-8")
    else:
        data = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
    return hashlib.sha256(data).hexdigest()[:16]


def record(
    user: str | None,
    module: str,
    action: str,
    model: str | None = None,
    duration_ms: int = 0,
    masked_entities: int = 0,
    status: str = "ok",
    error: str | None = None,
    payload_hash: str | None = None,
) -> int | None:
    """Bir kayıt yazar; kayıt id'sini döner. Günlük yazılamazsa çağrıyı bozmaz, uyarı loglar."""
    try:
        ensure_tables()
        with session_scope() as s:
            row = AuditLog(
                ts=utcnow(),
                user=(user or "anonim")[:128],
                module=module[:64],
                action=action[:64],
                model=model[:128] if model else None,
                duration_ms=int(duration_ms),
                masked_entities=int(masked_entities),
                status=status,
                error=error[:1000] if error else None,
                payload_hash=payload_hash,
            )
            s.add(row)
            s.flush()
            return row.id
    except Exception as e:  # pragma: no cover
        log.error("Denetim kaydı yazılamadı (%s/%s): %s", module, action, e)
        return None


@dataclass
class AuditRecord:
    """`audit_call` bloğu içinde doldurulan alanlar."""

    user: str
    module: str
    action: str
    payload_hash: str | None = None
    model: str | None = None
    masked_entities: int = 0
    status: str = "ok"
    error: str | None = None
    duration_ms: int = 0
    id: int | None = None


@asynccontextmanager
async def audit_call(user: str | None, module: str, action: str, payload: Any = None):
    """Süreyi ölçer, hatayı yakalar (yeniden fırlatır) ve her durumda kayıt yazar.

    async with audit_call(user, "ozetleme", "summarize", payload) as rec:
        ...
        rec.model = "qwen3.5-4b"; rec.masked_entities = 3
    """
    from ..modules.base import ApprovalRequired

    rec = AuditRecord(user=user or "anonim", module=module, action=action, payload_hash=payload_hash(payload))
    t0 = time.perf_counter()
    try:
        yield rec
    except ApprovalRequired:
        rec.status = "pending_approval"
        raise
    except BaseException as e:
        if rec.status == "ok":
            rec.status = "error"
        rec.error = rec.error or f"{type(e).__name__}: {e}"
        raise
    finally:
        rec.duration_ms = int((time.perf_counter() - t0) * 1000)
        rec.id = record(
            rec.user,
            rec.module,
            rec.action,
            rec.model,
            rec.duration_ms,
            rec.masked_entities,
            rec.status,
            rec.error,
            rec.payload_hash,
        )


def query(
    from_: datetime | None = None,
    to: datetime | None = None,
    module: str | None = None,
    user: str | None = None,
    limit: int = 200,
) -> list[dict]:
    ensure_tables()
    stmt = select(AuditLog).order_by(AuditLog.ts.desc()).limit(limit)
    if from_:
        stmt = stmt.where(AuditLog.ts >= from_)
    if to:
        stmt = stmt.where(AuditLog.ts <= to)
    if module:
        stmt = stmt.where(AuditLog.module == module)
    if user:
        stmt = stmt.where(AuditLog.user == user)
    with session_scope() as s:
        return [r.to_dict() for r in s.scalars(stmt)]


def summary(from_: datetime | None = None, to: datetime | None = None) -> dict:
    """Modül başına çağrı sayısı, maskelenen varlık toplamı, hata sayısı."""
    ensure_tables()
    errors = func.sum(case((AuditLog.status == "error", 1), else_=0))
    stmt = (
        select(
            AuditLog.module,
            func.count(AuditLog.id),
            func.coalesce(func.sum(AuditLog.masked_entities), 0),
            func.coalesce(errors, 0),
            func.coalesce(func.avg(AuditLog.duration_ms), 0),
        )
        .group_by(AuditLog.module)
        .order_by(AuditLog.module)
    )
    if from_:
        stmt = stmt.where(AuditLog.ts >= from_)
    if to:
        stmt = stmt.where(AuditLog.ts <= to)
    modules = []
    with session_scope() as s:
        for module, calls, masked, errs, avg_ms in s.execute(stmt):
            modules.append(
                {
                    "module": module,
                    "calls": int(calls),
                    "masked_entities": int(masked or 0),
                    "errors": int(errs or 0),
                    "avg_duration_ms": round(float(avg_ms or 0), 1),
                }
            )
    return {
        "from": from_.isoformat() if from_ else None,
        "to": to.isoformat() if to else None,
        "total_calls": sum(m["calls"] for m in modules),
        "masked_entities_total": sum(m["masked_entities"] for m in modules),
        "errors_total": sum(m["errors"] for m in modules),
        "modules": modules,
    }


def purge_expired(days: int | None = None) -> int:
    ensure_tables()
    keep = get_settings().audit_retention_days if days is None else days
    cutoff = utcnow() - timedelta(days=keep)
    with session_scope() as s:
        n = s.query(AuditLog).filter(AuditLog.ts < cutoff).delete()
    return int(n or 0)


__all__ = ["AuditRecord", "audit_call", "payload_hash", "purge_expired", "query", "record", "summary"]
