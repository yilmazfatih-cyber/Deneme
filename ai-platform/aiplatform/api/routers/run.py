"""`POST /api/modules/{id}/run/{action}` — modül eylemi çalıştırma.

Sunucu rolünde (veya modül yerelde çalışıyorsa) çalışma zamanı doğrudan çağrılır. İstemci rolünde
(`AIP_ROLE=client` + `AIP_SERVER_URL`) maskeleme zorunlu ya da yalnız sunucuda çalışan modüller sunucuya iletilir:
metin alanları istemcide maskelenir (eşleme istemcide kalır, sunucuya `mapping_id` gitmez), yanıt geri açılır.
Her çağrı `audit_log`'a yazılır.

Hata eşlemesi: bilinmeyen modül/eylem → 404, kurulu değil → 409, ModuleNotReady → 503,
ApprovalRequired → 202 {"approval_id"}, ModuleError → 400.
"""

from __future__ import annotations

import json
import logging
import socket
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.datastructures import UploadFile

from ...catalog import ModuleSpec, Target, get_catalog
from ...config import get_settings
from ...kvkk.audit import audit_call
from ...modules.base import ApprovalRequired, ModuleError, ModuleNotReady, RunContext, get_runtime

log = logging.getLogger("aiplatform.api.run")

router = APIRouter(tags=["modül çalıştırma"])

# Testlerde sunucuya iletimi taklit etmek için httpx taşıyıcısı verilebilir
FORWARD_TRANSPORT: httpx.AsyncBaseTransport | None = None
FORWARD_TIMEOUT_S = 600.0


def error_response(
    status: int, code: str, message: str, hint: str | None = None, **extra: Any
) -> JSONResponse:
    body: dict[str, Any] = {"error": {"code": code, "message": message, "hint": hint}}
    body.update(extra)
    return JSONResponse(status_code=status, content=body)


class _ForwardError(Exception):
    def __init__(self, status: int, body: Any):
        super().__init__(f"sunucu {status}")
        self.status = status
        self.body = body


# ----------------------------------------------------------------------------- yardımcılar


def _ensure_runtimes() -> None:
    import importlib

    importlib.import_module("aiplatform.modules.runtimes")


def installed_status(module_id: str) -> str:
    """ "installed" | "disabled" | "not_installed" | "unknown" (kurulum motoru yoksa)."""
    try:
        from ...installer.installer import list_installed
    except ImportError:
        return "unknown"
    try:
        items = list_installed()
    except Exception as e:  # noqa: BLE001
        log.warning("kurulu modül listesi okunamadı: %s", e)
        return "unknown"
    for it in items or []:
        mid = it.get("module_id") if isinstance(it, dict) else getattr(it, "module_id", it)
        if mid == module_id:
            enabled = it.get("enabled", True) if isinstance(it, dict) else getattr(it, "enabled", True)
            return "installed" if enabled else "disabled"
    return "not_installed"


def _coerce(value: str) -> Any:
    v = value.strip()
    if v[:1] in ("[", "{"):
        try:
            return json.loads(v)
        except json.JSONDecodeError:
            return value
    if v in ("true", "false"):
        return v == "true"
    return value


async def read_request(request: Request) -> tuple[dict, dict[str, bytes]]:
    ctype = request.headers.get("content-type", "")
    payload: dict[str, Any] = {}
    files: dict[str, bytes] = {}
    if ctype.startswith("multipart/form-data") or ctype.startswith("application/x-www-form-urlencoded"):
        form = await request.form()
        for key, val in form.multi_items():
            if isinstance(val, UploadFile):
                files[key] = await val.read()
                if val.filename and "filename" not in payload:
                    payload["filename"] = val.filename
            else:
                payload[key] = _coerce(str(val))
        return payload, files
    raw = await request.body()
    if not raw.strip():
        return {}, {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Geçersiz JSON gövdesi: {e.msg}") from e
    if not isinstance(data, dict):
        raise ValueError("JSON gövdesi bir nesne olmalı")
    return data, files


def request_user(request: Request) -> str:
    return (request.headers.get("x-aip-user") or request.headers.get("x-user") or "anonim")[:128]


def should_forward(spec: ModuleSpec) -> bool:
    s = get_settings()
    if s.role != "client" or not s.server_url:
        return False
    if spec.kvkk.masking_required:
        return True
    required = [c for c in spec.components if not c.optional]
    return bool(required) and all(c.target == Target.server for c in required)


async def forward_to_server(
    spec: ModuleSpec, action: str, payload: dict, files: dict[str, bytes], user: str
) -> tuple[dict, dict, int]:
    """İstemci → sunucu. Dönüş: (result, sunucu meta, maskelenen varlık sayısı)."""
    from ...kvkk.mask import Masker, mask_structure, unmask_structure

    s = get_settings()
    masker = None
    send = payload
    if spec.kvkk.masking_required and s.mask_before_server:
        masker = Masker()
        send = mask_structure(payload, masker)
        if masker.placeholders:
            masker.save()  # eşleme yalnız istemcide (mask_mappings)
    url = f"{s.server_url.rstrip('/')}/api/modules/{spec.id}/run/{action}"
    headers = {"X-AIP-User": user, "X-AIP-Forwarded-By": socket.gethostname()}
    try:
        async with httpx.AsyncClient(timeout=FORWARD_TIMEOUT_S, transport=FORWARD_TRANSPORT) as c:
            if files:
                data = {
                    k: (v if isinstance(v, str) else json.dumps(v, ensure_ascii=False))
                    for k, v in send.items()
                }
                r = await c.post(url, data=data, files={k: (k, b) for k, b in files.items()}, headers=headers)
            else:
                r = await c.post(url, json=send, headers=headers)
    except (httpx.ConnectError, httpx.ConnectTimeout) as e:
        raise ModuleNotReady(f"Sunucuya ulaşılamadı ({s.server_url}): {e}") from e
    try:
        body = r.json()
    except ValueError:
        body = {"error": {"code": "server_error", "message": r.text[:300], "hint": None}}
    if r.status_code == 202:
        raise ApprovalRequired(str(body.get("approval_id")), body.get("message") or "İnsan onayı bekleniyor")
    if r.status_code != 200:
        raise _ForwardError(r.status_code, body)
    result = body.get("result", {})
    if masker is not None and masker.placeholders:
        result = unmask_structure(result, masker.placeholders)
    meta = dict(body.get("meta") or {})
    if files and spec.kvkk.masking_required:
        meta["files_unmasked"] = (
            "Dosya içerikleri (görüntü/ses/PDF) maskelenemez; sunucuya olduğu gibi gönderildi"
        )
    return result, meta, masker.count if masker else 0


# ----------------------------------------------------------------------------- uç nokta


@router.post("/api/modules/{module_id}/run/{action}")
async def run_action(module_id: str, action: str, request: Request):
    spec = get_catalog().modules.get(module_id)
    if spec is None:
        return error_response(
            404, "unknown_module", f"Bilinmeyen modül: '{module_id}'", "GET /api/catalog/modules"
        )
    if not any(a.id == action for a in spec.actions):
        return error_response(
            404,
            "unknown_action",
            f"'{module_id}' modülünde '{action}' eylemi yok",
            "Eylemler: " + ", ".join(a.id for a in spec.actions),
        )
    try:
        payload, files = await read_request(request)
    except ValueError as e:
        return error_response(400, "bad_request", str(e))

    user = request_user(request)
    forward = should_forward(spec)
    if not forward:
        status = installed_status(module_id)
        if status == "not_installed":
            return error_response(
                409,
                "not_installed",
                f"'{spec.name}' modülü kurulu değil",
                f"POST /api/modules/{module_id}/install",
            )
        if status == "disabled":
            return error_response(
                409,
                "module_disabled",
                f"'{spec.name}' modülü devre dışı",
                f"POST /api/modules/{module_id}/enable",
            )

    ctx = RunContext(user=user, role=get_settings().role, files=files, request_id=uuid.uuid4().hex)
    rec = None
    server_meta: dict = {}
    try:
        async with audit_call(user, module_id, action, payload) as rec:
            if forward:
                result, server_meta, masked = await forward_to_server(spec, action, payload, files, user)
                rec.model = server_meta.get("model")
                rec.masked_entities = masked
            else:
                _ensure_runtimes()
                result = await get_runtime(module_id).run(action, payload, ctx)
                rec.model = ctx.extra.get("model")
                rec.masked_entities = int(ctx.extra.get("masked_entities", 0))
    except ApprovalRequired as e:
        return JSONResponse(
            status_code=202,
            content={
                "approval_id": e.approval_id,
                "message": str(e),
                "meta": {
                    "module": module_id,
                    "action": action,
                    "duration_ms": rec.duration_ms if rec else None,
                },
            },
        )
    except ModuleNotReady as e:
        return error_response(503, "not_ready", str(e), f"POST /api/modules/{module_id}/install")
    except ModuleError as e:
        return error_response(400, "module_error", str(e))
    except _ForwardError as e:
        return JSONResponse(status_code=e.status, content=e.body)
    except Exception as e:
        log.exception("modül çalıştırma hatası: %s/%s", module_id, action)
        return error_response(
            500, "internal_error", f"Beklenmeyen hata: {type(e).__name__}: {e}", "Sunucu günlüğüne bakın"
        )

    meta = {
        "module": module_id,
        "action": action,
        "model": rec.model,
        "duration_ms": rec.duration_ms,
        "masked_entities": rec.masked_entities,
    }
    if forward:
        meta["executed_on"] = "sunucu"
        meta["server"] = {k: v for k, v in server_meta.items() if k not in meta}
    meta.update({k: v for k, v in (ctx.extra.get("meta") or {}).items() if k not in meta})
    return {"result": result, "meta": meta}
