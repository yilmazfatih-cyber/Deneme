"""OpenAI uyumlu geçit: `POST /v1/chat/completions` (akış dahil) ve `GET /v1/models`.

- `model`: katalog id'si (ör. "qwen3.5-9b") veya "auto" → `llm_model_priority` içinden kurulu ilk model.
  Katalogda olup kurulu olmayan bir model istenirse "auto"ya düşülür (`X-AIP-Model-Fallback` başlığı).
- İstemci rolünde istek sunucunun geçidine gider; mesajlar `LLMClient` içinde maskelenir, yanıt geri açılır.
- Güvenlik Denetimi modülü kuruluysa son kullanıcı mesajı denetlenir; engellenirse 400 `blocked_by_policy`.
- Her çağrı denetim günlüğüne yazılır (modül: "gateway").
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from ...catalog import get_catalog
from ...kvkk.audit import audit_call, payload_hash, record
from ...modules.base import ModuleError, ModuleNotReady
from ...runtimes.llm import LLMClient, LLMResult, installed_llm_ids

log = logging.getLogger("aiplatform.api.gateway")

router = APIRouter(tags=["OpenAI uyumlu geçit"])

AUDIT_MODULE = "gateway"
AUDIT_ACTION = "chat.completions"
_PASSTHROUGH_SKIP = {"model", "messages", "stream", "temperature", "max_tokens", "tools", "user"}


def _error(status: int, code: str, message: str, hint: str | None = None, **extra: Any) -> JSONResponse:
    body = {"error": {"code": code, "message": message, "hint": hint, "type": code, **extra}}
    return JSONResponse(status_code=status, content=body)


def _user(request: Request, body: dict) -> str:
    return (
        request.headers.get("x-aip-user")
        or request.headers.get("x-user")
        or str(body.get("user") or "anonim")
    )[:128]


def guard_enabled() -> bool:
    """Güvenlik Denetimi modülü kurulu mu (kurulum bilgisi yoksa kapalı)."""
    try:
        from ...installer.installer import list_installed
    except ImportError:
        return False
    try:
        return any(
            (it.get("module_id") if isinstance(it, dict) else it) == "guvenlik-denetimi"
            and (not isinstance(it, dict) or it.get("enabled", True))
            for it in list_installed()
        )
    except Exception:  # noqa: BLE001
        return False


def _last_user_text(messages: list[dict]) -> str:
    for m in reversed(messages):
        if m.get("role") != "user":
            continue
        c = m.get("content")
        if isinstance(c, str):
            return c
        if isinstance(c, list):
            return " ".join(p.get("text", "") for p in c if isinstance(p, dict) and p.get("type") == "text")
    return ""


def _resolve_requested(model: str | None) -> tuple[str | None, str | None]:
    """(LLMClient'a verilecek model, geri düşüş notu)."""
    if not model or model == "auto":
        return None, None
    if model in get_catalog().models:
        installed = installed_llm_ids()
        if installed is not None and model not in installed:
            return None, f"'{model}' kurulu değil; otomatik seçime düşüldü"
    return model, None


def _build_response(res: LLMResult) -> dict:
    message: dict[str, Any] = {"role": "assistant", "content": res.content}
    if res.tool_calls:
        message["tool_calls"] = [
            {
                "id": tc.get("id") or f"call_{i}",
                "type": "function",
                "function": {
                    "name": tc["name"],
                    "arguments": json.dumps(tc["arguments"], ensure_ascii=False),
                },
            }
            for i, tc in enumerate(res.tool_calls)
        ]
    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:24]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": res.model,
        "choices": [
            {"index": 0, "message": message, "finish_reason": "tool_calls" if res.tool_calls else "stop"}
        ],
        "usage": res.usage or {},
    }


@router.get("/v1/models")
async def list_models():
    cat = get_catalog()
    data = [
        {"id": "auto", "object": "model", "owned_by": "aiplatform", "name": "Otomatik seçim (öncelik sırası)"}
    ]
    installed = installed_llm_ids()
    if installed:
        for mid in installed:
            spec = cat.models.get(mid)
            data.append(
                {"id": mid, "object": "model", "owned_by": "aiplatform", "name": spec.name if spec else mid}
            )
    else:
        try:
            for mid in await LLMClient().available_models():
                spec = cat.models.get(mid)
                data.append(
                    {
                        "id": mid,
                        "object": "model",
                        "owned_by": "aiplatform",
                        "name": spec.name if spec else mid,
                    }
                )
        except ModuleNotReady:
            pass
    return {"object": "list", "data": data}


@router.post("/v1/chat/completions")
async def chat_completions(request: Request):
    try:
        body = await request.json()
    except ValueError:
        return _error(400, "invalid_request", "Geçersiz JSON gövdesi")
    if not isinstance(body, dict) or not isinstance(body.get("messages"), list) or not body["messages"]:
        return _error(400, "invalid_request", "'messages' boş olmayan bir liste olmalı")
    messages: list[dict] = body["messages"]
    user = _user(request, body)
    model, fallback = _resolve_requested(body.get("model"))
    extra = {k: v for k, v in body.items() if k not in _PASSTHROUGH_SKIP}
    kwargs = dict(
        tools=body.get("tools"),
        temperature=float(body.get("temperature", 0.2)),
        max_tokens=body.get("max_tokens"),
        model=model,
        extra=extra,
    )
    headers = {"X-AIP-Model-Fallback": "auto"} if fallback else {}

    if guard_enabled():
        from ...modules.runtimes.guvenlik_denetimi import check_text

        verdict = await check_text(_last_user_text(messages))
        if verdict.get("blocked"):
            record(
                user,
                AUDIT_MODULE,
                AUDIT_ACTION,
                model=verdict.get("model"),
                status="blocked",
                error=f"risk: {verdict.get('risk')}",
                payload_hash=payload_hash(body),
            )
            return _error(
                400,
                "blocked_by_policy",
                "İstek güvenlik politikası nedeniyle engellendi",
                "İsteği yeniden ifade edin; talimatları devre dışı bırakmaya yönelik ifadeler kabul edilmez",
                risk=verdict.get("risk"),
            )

    client = LLMClient()
    if not body.get("stream"):
        try:
            async with audit_call(user, AUDIT_MODULE, AUDIT_ACTION, body) as rec:
                res = await client.chat(messages, **kwargs)
                rec.model = res.model
                rec.masked_entities = res.masked_entities
        except ModuleNotReady as e:
            return _error(503, "not_ready", str(e), "POST /api/modules/ana-model/install")
        except ModuleError as e:
            return _error(400, "llm_error", str(e))
        out = res.raw if isinstance(res.raw, dict) and res.raw.get("choices") else _build_response(res)
        return JSONResponse(out, headers=headers)

    # --- akış
    stats: dict = {}
    t0 = time.perf_counter()
    agen = client.stream_chat(messages, stats=stats, **kwargs)
    try:
        first = await agen.__anext__()
    except StopAsyncIteration:
        first = None
    except (ModuleNotReady, ModuleError) as e:
        record(
            user,
            AUDIT_MODULE,
            AUDIT_ACTION + ".stream",
            model=stats.get("model"),
            status="error",
            error=str(e),
            duration_ms=int((time.perf_counter() - t0) * 1000),
            payload_hash=payload_hash(body),
        )
        if isinstance(e, ModuleNotReady):
            return _error(503, "not_ready", str(e), "POST /api/modules/ana-model/install")
        return _error(400, "llm_error", str(e))

    async def events():
        status, err = "ok", None
        try:
            if first is not None:
                yield first + "\n\n"
            async for line in agen:
                yield line + "\n\n"
        except Exception as e:  # noqa: BLE001 - akış başladıktan sonra hata SSE olarak bildirilir
            status, err = "error", f"{type(e).__name__}: {e}"
            yield (
                "data: "
                + json.dumps(
                    {"error": {"code": "stream_error", "message": str(e), "hint": None}}, ensure_ascii=False
                )
                + "\n\n"
            )
        finally:
            record(
                user,
                AUDIT_MODULE,
                AUDIT_ACTION + ".stream",
                model=stats.get("model"),
                duration_ms=int((time.perf_counter() - t0) * 1000),
                masked_entities=stats.get("masked_entities", 0),
                status=status,
                error=err,
                payload_hash=payload_hash(body),
            )

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", **headers},
    )
