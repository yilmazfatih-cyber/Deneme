"""ERP webhook alıcısı: HMAC-SHA256 imza doğrulama, olay kaydı ve modül eylemine eşleme.

İmza: `X-Signature: sha256=<hex>`; hex = HMAC-SHA256(AIP_ERP_WEBHOOK_SECRET, ham istek gövdesi).
Sır tanımlı değilse uç 503 döner (imzasız olay kabul edilmez).

Eşleme dosyası `<data_dir>/webhook_routes.json`:

    {
      "routes": {
        "yeni-fatura": {
          "module": "fatura-cikarim",
          "action": "extract",
          "payload_map": {"schema_id": "fatura", "belge_no": "$.belge.no", "ilk_kalem": "$.kalemler.0.kod"}
        }
      }
    }

`payload_map` değerleri "$." ile başlıyorsa gelen gövdede noktalı yol olarak aranır, aksi halde sabit değerdir;
`payload_map` yoksa gövdenin tamamı eyleme gider. Eşlenen eylem katalogda `human_approval: true` ise iş kuyruğu yerine
onay kuyruğuna düşer. İş kuyruğu (`aiplatform.installer.jobs`) yoksa olay "kuyruk yok" durumuyla saklanır.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from typing import Any

from sqlalchemy import select

from ..config import get_settings
from ..db import session_scope
from .connector import ErpError
from .models import WebhookEvent

log = logging.getLogger("aiplatform.erp.webhooks")

ROUTES_FILE = "webhook_routes.json"
MAX_BODY = 1_000_000


def sign(secret: str, body: bytes) -> str:
    """İmza başlığı değerini üretir (ERP tarafı ve testler için)."""
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def verify_signature(secret: str, body: bytes, header: str | None) -> bool:
    if not header:
        return False
    value = header.strip()
    if not value.lower().startswith("sha256="):
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, value[7:].strip().lower())


def load_routes() -> dict[str, dict]:
    p = get_settings().data_dir / ROUTES_FILE
    if not p.exists():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        log.error("%s okunamadı: %s", p, e)
        return {}
    routes = data.get("routes", data) if isinstance(data, dict) else {}
    return {k: v for k, v in routes.items() if isinstance(v, dict) and v.get("module") and v.get("action")}


def _lookup(data: Any, path: str) -> Any:
    node = data
    for part in path.split("."):
        if part == "":
            continue
        if isinstance(node, dict):
            node = node.get(part)
        elif isinstance(node, list) and part.isdigit() and int(part) < len(node):
            node = node[int(part)]
        else:
            return None
    return node


def map_payload(payload: Any, payload_map: dict | None) -> dict:
    if not payload_map:
        return payload if isinstance(payload, dict) else {"data": payload}
    out = {}
    for key, spec in payload_map.items():
        out[key] = _lookup(payload, spec[2:]) if isinstance(spec, str) and spec.startswith("$.") else spec
    return out


def _requires_approval(module: str, action: str) -> bool:
    try:
        from ..catalog import get_catalog

        spec = get_catalog().modules.get(module)
    except Exception:  # noqa: BLE001
        return False
    return bool(spec and any(a.id == action and a.human_approval for a in spec.actions))


def _enqueue(module: str, action: str, payload: dict, source: str, event_id: str) -> str | None:
    """İş kuyruğuna alır; kuyruk paketi yoksa None döner."""
    try:
        from ..installer.jobs import get_job_manager
    except ImportError:
        return None

    async def factory(job):
        from ..modules.base import RunContext, get_runtime

        job.step(f"{module}/{action} çalışıyor (webhook: {source})", 5)
        ctx = RunContext(user=f"webhook:{source}", extra={"webhook_event_id": event_id})
        result = await get_runtime(module).run(action, payload, ctx)
        job.set_result(result)
        return result

    return get_job_manager().submit("webhook", module, factory)


def _audit(source: str, status: str, error: str | None, body: bytes) -> None:
    try:
        from ..kvkk import audit
    except ImportError:
        return
    audit.record(
        f"webhook:{source}",
        "erp",
        "webhook",
        status=status,
        error=error,
        payload_hash=audit.payload_hash(body),
    )


async def handle_webhook(source: str, body: bytes, signature: str | None) -> dict:
    """Olayı doğrular, kaydeder, eşler. Çalışan olay döngüsünden çağrılmalıdır (iş kuyruğu için)."""
    secret = get_settings().erp_webhook_secret
    if not secret:
        raise ErpError(
            "webhook_secret_missing",
            "webhook sırrı tanımlı değil",
            "AIP_ERP_WEBHOOK_SECRET ortam değişkenini ayarlayın.",
            503,
        )
    if len(body) > MAX_BODY:
        raise ErpError("payload_too_large", "Webhook gövdesi çok büyük (en çok 1 MB).", None, 413)
    if not verify_signature(secret, body, signature):
        with session_scope() as s:
            s.add(WebhookEvent(source=source, signature_ok=False, payload_json=None, status="imza_gecersiz"))
        _audit(source, "blocked", "imza geçersiz", body)
        raise ErpError(
            "bad_signature",
            "Webhook imzası geçersiz.",
            "Başlık: X-Signature: sha256=<HMAC-SHA256(sır, gövde)>",
            401,
        )
    try:
        payload = json.loads(body.decode("utf-8") or "{}")
    except (UnicodeDecodeError, ValueError) as e:
        raise ErpError("bad_json", "Webhook gövdesi geçerli JSON değil.") from e

    route = load_routes().get(source)
    with session_scope() as s:
        ev = WebhookEvent(
            source=source,
            signature_ok=True,
            payload_json=json.dumps(payload, ensure_ascii=False),
            status="alindi",
        )
        if route:
            ev.mapped_module, ev.mapped_action = route["module"], route["action"]
        else:
            ev.status = "eslesme_yok"
        s.add(ev)
        s.flush()
        event_id = ev.id

    status, job_id, approval_id = ("eslesme_yok", None, None)
    if route:
        mapped = map_payload(payload, route.get("payload_map"))
        module, action = route["module"], route["action"]
        try:
            if _requires_approval(module, action):
                from .approvals import create_approval

                approval_id = create_approval(module, action, mapped, requested_by=f"webhook:{source}")
                status = "onay_bekliyor"
            else:
                job_id = _enqueue(module, action, mapped, source, event_id)
                status = "kuyrukta" if job_id else "kuyruk yok"
        except Exception as e:  # noqa: BLE001 - olay kaydı korunur, hata kayda düşer
            log.warning("webhook eşlemesi başarısız (%s): %s", source, e)
            status = "hata"
        with session_scope() as s:
            ev = s.get(WebhookEvent, event_id)
            ev.status = status
            ev.job_id = job_id or approval_id
    _audit(source, "ok", None, body)
    return {"event_id": event_id, "status": status, "job_id": job_id, "approval_id": approval_id}


def list_events(limit: int = 50, source: str | None = None) -> list[dict]:
    with session_scope() as s:
        q = select(WebhookEvent).order_by(WebhookEvent.received_at.desc()).limit(limit)
        if source:
            q = q.where(WebhookEvent.source == source)
        return [
            {
                "id": e.id,
                "source": e.source,
                "received_at": e.received_at.isoformat() if e.received_at else None,
                "signature_ok": e.signature_ok,
                "mapped_module": e.mapped_module,
                "mapped_action": e.mapped_action,
                "job_id": e.job_id,
                "status": e.status,
            }
            for e in s.scalars(q)
        ]
