"""Kimlik tabloları: kullanıcılar ve anahtarlar (API anahtarı + tarayıcı oturumu)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def new_id() -> str:
    return uuid.uuid4().hex


class User(Base):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String(64), primary_key=True)
    display_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    role: Mapped[str] = mapped_column(String(16), default="kullanici")
    password_hash: Mapped[str] = mapped_column(String(256))
    disabled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ApiToken(Base):
    """Ham anahtar hiçbir zaman saklanmaz; yalnız SHA-256 özeti tutulur.

    kind="api": ERP entegrasyonu, betikler, istemci düğümleri (uzun ömürlü, adlı).
    kind="session": tarayıcı oturumu (HttpOnly çerez, kısa ömürlü).
    delegate=True: istemci düğümü anahtarı; X-AIP-User başlığındaki kişi adına çalışabilir,
    ama yetkisi her zaman 'kullanici' rolüyle sınırlıdır.
    """

    __tablename__ = "api_tokens"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(64), ForeignKey("users.username"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    kind: Mapped[str] = mapped_column(String(16), default="api")
    delegate: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
