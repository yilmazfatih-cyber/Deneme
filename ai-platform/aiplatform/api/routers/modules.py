"""Kurulum uç noktaları: kur, kaldır, etkinleştir/pasifleştir, kurulu modül listesi."""

from __future__ import annotations

import asyncio
import importlib
import logging
from typing import Literal

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ...catalog import get_catalog
from ...installer import installer
from ._errors import from_install_error, not_found

log = logging.getLogger("aiplatform.api.modules")
router = APIRouter(prefix="/api/modules", tags=["modüller"])


class InstallRequest(BaseModel):
    target: Literal["auto", "server", "client"] = "auto"
    artifacts: dict[str, str] | None = Field(default=None, description="rol → artifact kimliği")
    with_optional: bool = False


async def _module_health(module_id: str) -> dict | None:
    try:
        importlib.import_module("aiplatform.modules.runtimes")
    except Exception as e:  # noqa: BLE001 — çalışma zamanı paketi henüz yazılmamış olabilir
        log.debug("çalışma zamanı paketi yüklenemedi: %s", e)
    try:
        from ...modules.base import get_runtime

        return await asyncio.wait_for(get_runtime(module_id).health(), timeout=2.0)
    except Exception as e:  # noqa: BLE001
        return {"module": module_id, "ready": False, "error": str(e) or e.__class__.__name__}


@router.get("")
async def list_modules() -> list[dict]:
    installer.bootstrap()
    items = installer.list_installed()
    healths = await asyncio.gather(*(_module_health(m["module_id"]) for m in items))
    for m, h in zip(items, healths, strict=True):
        m["health"] = h
        m["running"] = bool(m["enabled"] and h and h.get("ready"))
    return items


@router.post("/{module_id}/install", status_code=202)
async def install(module_id: str, req: InstallRequest | None = None):
    installer.bootstrap()
    req = req or InstallRequest()
    try:
        job_id = installer.submit_install(module_id, req.target, req.artifacts, req.with_optional)
    except installer.InstallError as e:
        return from_install_error(e)
    return JSONResponse(status_code=202, content={"job_id": job_id})


@router.post("/{module_id}/uninstall")
async def uninstall(module_id: str, force: bool = False):
    installer.bootstrap()
    if module_id not in get_catalog().modules:
        return not_found(f"modül '{module_id}'")
    try:
        return await installer.uninstall_module(module_id, force=force)
    except installer.InstallError as e:
        return from_install_error(e)


def _toggle(module_id: str, enabled: bool):
    installer.bootstrap()
    if module_id not in get_catalog().modules:
        return not_found(f"modül '{module_id}'")
    if not installer.set_enabled(module_id, enabled):
        e = installer.InstallError(
            f"'{module_id}' kurulu değil", code="not_installed", hint=f"POST /api/modules/{module_id}/install"
        )
        return from_install_error(e)
    return {"module_id": module_id, "enabled": enabled}


@router.post("/{module_id}/enable")
def enable(module_id: str):
    return _toggle(module_id, True)


@router.post("/{module_id}/disable")
def disable(module_id: str):
    return _toggle(module_id, False)
