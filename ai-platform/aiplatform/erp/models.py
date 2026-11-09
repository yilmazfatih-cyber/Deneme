"""ERP paketinin tabloları: erp_connections, approvals, webhook_events."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def new_id() -> str:
    return uuid.uuid4().hex


class ErpConnection(Base):
    """ERP bağlantısı. Gerçek URL ve belirteç şifreli tutulur; API'de yalnız maskeli URL görünür.

    kind: "sql" (salt-okunur SQLAlchemy), "rest" (OpenAPI/araç listesi), "mock" (örnek ERP; yazma aracı var).
    """

    __tablename__ = "erp_connections"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(16))  # sql | rest | mock
    url_encrypted: Mapped[str] = mapped_column(Text)
    url_masked: Mapped[str] = mapped_column(Text)
    secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)  # REST belirteci
    allowed_tables_json: Mapped[str] = mapped_column(Text, default="[]")
    options_json: Mapped[str] = mapped_column(Text, default="{}")  # openapi_url, tools, timeout_s
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_test_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_test_ok: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    last_test_message: Mapped[str | None] = mapped_column(Text, nullable=True)


class Approval(Base):
    """İnsan onayı kuyruğu. ERP'ye yazan her işlem önce buraya düşer.

    status: pending → approved → executed | failed ; pending → rejected
    module "erp" ise action bir bağlayıcı yazma aracıdır ve payload {"connection_id", "args"} taşır;
    aksi halde module bir katalog modülüdür ve action onun eylemidir.
    """

    __tablename__ = "approvals"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    module: Mapped[str] = mapped_column(String(100), index=True)
    action: Mapped[str] = mapped_column(String(100))
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    requested_by: Mapped[str] = mapped_column(String(100), default="anonim")
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    decided_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_json: Mapped[str | None] = mapped_column(Text, nullable=True)


class WebhookEvent(Base):
    """ERP'den gelen olay. İmzası geçersiz olanların gövdesi saklanmaz."""

    __tablename__ = "webhook_events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    source: Mapped[str] = mapped_column(String(100), index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    signature_ok: Mapped[bool] = mapped_column(Boolean, default=False)
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    mapped_module: Mapped[str | None] = mapped_column(String(100), nullable=True)
    mapped_action: Mapped[str | None] = mapped_column(String(100), nullable=True)
    job_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="alindi")
