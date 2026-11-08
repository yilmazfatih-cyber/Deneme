"""Kurulum paketinin tabloları: installed_models, installed_modules, jobs."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class InstalledModel(Base):
    """İndirilmiş bir model biçimi (model + artifact çifti tekildir)."""

    __tablename__ = "installed_models"

    model_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    artifact_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    path: Mapped[str] = mapped_column(Text, default="")
    size_gb: Mapped[float] = mapped_column(Float, default=0.0)
    runtime: Mapped[str] = mapped_column(String(32), default="")
    installed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class InstalledModule(Base):
    __tablename__ = "installed_modules"

    module_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    target: Mapped[str] = mapped_column(String(16), default="server")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    installed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # {"components": [{"role", "model", "artifact", "delegated"}], "with_optional": bool, "artifacts": {...}}
    config_json: Mapped[str] = mapped_column(Text, default="{}")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32))
    module_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="queued")  # queued|running|done|failed|cancelled
    progress: Mapped[int] = mapped_column(Integer, default=0)
    step: Mapped[str] = mapped_column(Text, default="")
    log_text: Mapped[str] = mapped_column(Text, default="")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
