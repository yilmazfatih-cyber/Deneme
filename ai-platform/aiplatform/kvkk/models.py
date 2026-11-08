"""KVKK tabloları: `audit_log` ve `mask_mappings`."""

from __future__ import annotations

import threading
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base, get_engine


def utcnow() -> datetime:
    """Saat dilimsiz UTC (SQLite saat dilimi saklamaz)."""
    return datetime.now(UTC).replace(tzinfo=None)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    user: Mapped[str] = mapped_column(String(128), default="anonim", index=True)
    module: Mapped[str] = mapped_column(String(64), index=True)
    action: Mapped[str] = mapped_column(String(64))
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    masked_entities: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="ok")  # ok | error | pending_approval | blocked
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload_hash: Mapped[str | None] = mapped_column(String(16), nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "ts": self.ts.isoformat() if self.ts else None,
            "user": self.user,
            "module": self.module,
            "action": self.action,
            "model": self.model,
            "duration_ms": self.duration_ms,
            "masked_entities": self.masked_entities,
            "status": self.status,
            "error": self.error,
            "payload_hash": self.payload_hash,
        }


class MaskMapping(Base):
    __tablename__ = "mask_mappings"

    mapping_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    # Sütun adı MIMARI.md ile aynı; içerik `encrypted` True ise Fernet belirteci, değilse düz JSON
    mapping_json: Mapped[str] = mapped_column("mapping_json_encrypted", Text)
    encrypted: Mapped[bool] = mapped_column(Boolean, default=False)


_ready_lock = threading.Lock()


def ensure_tables() -> None:
    """KVKK tablolarını (yoksa) oluşturur. init_db çağrılmamış bağlamlarda (CLI, test) güvence.

    Motor nesnesine işaret konur; motor sıfırlanınca (reset_db) yeni motorda yeniden denetlenir.
    """
    engine = get_engine()
    if getattr(engine, "_aip_kvkk_tables", False):
        return
    with _ready_lock:
        if not getattr(engine, "_aip_kvkk_tables", False):
            Base.metadata.create_all(engine, tables=[AuditLog.__table__, MaskMapping.__table__])
            engine._aip_kvkk_tables = True
