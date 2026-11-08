"""Sistem uç noktaları: donanım profili, kapasite, sağlık."""

from __future__ import annotations

import os
import time

from fastapi import APIRouter
from sqlalchemy import text

from ... import __version__
from ...catalog import get_catalog
from ...config import get_settings
from ...db import session_scope
from ...hardware.compat import capacity
from ...hardware.probe import cached_probe, reset_probe_cache
from ...installer import engine, installer

router = APIRouter(prefix="/api/system", tags=["sistem"])
_STARTED = time.time()


@router.get("/probe")
def get_probe(refresh: bool = False) -> dict:
    """Donanım profili (60 sn önbellekli; `refresh=true` yeniden tarar)."""
    installer.bootstrap()
    if refresh:
        reset_probe_cache()
    return cached_probe().model_dump()


@router.get("/capacity")
def get_capacity(concurrent_users: int = 8) -> dict:
    installer.bootstrap()
    return capacity(get_catalog(), cached_probe(), installer.installed_pairs(), concurrent_users)


@router.get("/health")
async def get_health() -> dict:
    installer.bootstrap()
    s = get_settings()
    db_ok, db_err = True, None
    try:
        with session_scope() as sess:
            sess.execute(text("SELECT 1"))
    except Exception as e:  # noqa: BLE001
        db_ok, db_err = False, str(e)
    llm = await engine.llm_health(s.llm_base_url, timeout=2.0)
    state = engine.load_state(s)
    status = "ok" if db_ok and llm["ok"] else "degraded"
    return {
        "status": status,
        "process": {
            "pid": os.getpid(),
            "uptime_s": int(time.time() - _STARTED),
            "role": s.role,
            "version": __version__,
        },
        "database": {"ok": db_ok, "error": db_err, "path": str(s.db_path)},
        "llm": {**llm, "engine": state.model_dump() if state else None},
    }
