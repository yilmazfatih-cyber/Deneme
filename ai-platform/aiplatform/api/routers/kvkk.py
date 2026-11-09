"""KVKK Kalkanı kısa yolları: `/api/kvkk/mask`, `/api/kvkk/unmask`, `/api/kvkk/scan`, `/api/kvkk/purge`."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ...kvkk.audit import audit_call
from ...kvkk.audit import purge_expired as purge_audit
from ...kvkk.mask import mask as kvkk_mask_fn
from ...kvkk.mask import purge_expired as kvkk_purge
from ...kvkk.mask import scan as kvkk_scan_fn
from ...kvkk.mask import unmask as kvkk_unmask_fn

router = APIRouter(prefix="/api/kvkk", tags=["KVKK Kalkanı"])


class MaskBody(BaseModel):
    text: str
    entities: list[str] | None = None
    mapping_id: str | None = Field(default=None, description="Verilirse var olan eşleme genişletilir")
    threshold: float = 0.5


class UnmaskBody(BaseModel):
    text: str
    mapping_id: str


class ScanBody(BaseModel):
    text: str
    entities: list[str] | None = None
    threshold: float = 0.5
    include_text: bool = False


def _user(request: Request) -> str:
    return (request.headers.get("x-aip-user") or request.headers.get("x-user") or "anonim")[:128]


def _error(status: int, code: str, message: str, hint: str | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status, content={"error": {"code": code, "message": message, "hint": hint}}
    )


@router.post("/mask")
async def mask_text(body: MaskBody, request: Request):
    async with audit_call(_user(request), "kvkk-kalkani", "mask", body.text) as rec:
        r = await asyncio.to_thread(
            kvkk_mask_fn, body.text, body.entities, mapping_id=body.mapping_id, threshold=body.threshold
        )
        rec.masked_entities = r.count
    return r.to_dict()


@router.post("/unmask")
async def unmask_text(body: UnmaskBody, request: Request):
    try:
        async with audit_call(_user(request), "kvkk-kalkani", "unmask", body.text):
            text = await asyncio.to_thread(kvkk_unmask_fn, body.text, body.mapping_id)
    except KeyError:
        return _error(
            404,
            "mapping_not_found",
            "Eşleme bulunamadı veya saklama süresi doldu",
            "Metni yeniden maskeleyin: POST /api/kvkk/mask",
        )
    return {"text": text}


@router.post("/scan")
async def scan_text(body: ScanBody, request: Request):
    async with audit_call(_user(request), "kvkk-kalkani", "scan", body.text) as rec:
        r = await asyncio.to_thread(kvkk_scan_fn, body.text, body.entities, body.threshold, body.include_text)
        rec.masked_entities = len(r["findings"])
    return r


@router.post("/purge")
async def purge(request: Request):
    """Saklama süresi (AIP_AUDIT_RETENTION_DAYS) dolan eşlemeleri ve denetim kayıtlarını siler."""
    async with audit_call(_user(request), "kvkk-kalkani", "purge"):
        mappings = await asyncio.to_thread(kvkk_purge)
        audits = await asyncio.to_thread(purge_audit)
    return {"mappings_deleted": mappings, "audit_deleted": audits}
