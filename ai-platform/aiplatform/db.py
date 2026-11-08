"""SQLite veritabanı (SQLAlchemy 2.x). Her paket kendi tablolarını bu `Base` üzerinden tanımlar;
`init_db()` tüm paketleri içe aktardıktan sonra `create_all` çağırır."""

from __future__ import annotations

import importlib
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


_engine = None
_SessionLocal: sessionmaker[Session] | None = None

# Tablo tanımlayan modüller: init_db bunları içe aktarır ki metadata dolsun.
MODEL_MODULES = [
    "aiplatform.installer.models",  # installed_models, installed_modules, jobs
    "aiplatform.kvkk.models",  # audit_log, mask_mappings
    "aiplatform.erp.models",  # erp_connections, approvals, webhook_events
]


def get_engine():
    global _engine
    if _engine is None:
        s = get_settings()
        _engine = create_engine(f"sqlite:///{s.db_path}", connect_args={"check_same_thread": False})
    return _engine


def init_db() -> None:
    for mod in MODEL_MODULES:
        try:
            importlib.import_module(mod)
        except ModuleNotFoundError as e:  # paket henüz yazılmadıysa platform yine de ayağa kalksın
            if mod.split(".")[1] not in str(e):
                raise
    Base.metadata.create_all(get_engine())


def get_sessionmaker() -> sessionmaker[Session]:
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine(), expire_on_commit=False)
    return _SessionLocal


@contextmanager
def session_scope() -> Iterator[Session]:
    session = get_sessionmaker()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def reset_db() -> None:
    """Testlerde ayarlar değişince motoru sıfırlar."""
    global _engine, _SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None
