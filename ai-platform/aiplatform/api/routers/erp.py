"""ERP bağlantıları, araçlar ve webhook uçları (/api/erp/...).

UYARI: Örnek ERP dışındaki bağlantılar ERP'de yalnız salt-okunur yetkili bir kullanıcıyla tanımlanmalıdır.
"""

from __future__ import annotations

import json
import re
import unicodedata
from typing import Any, Literal

from fastapi import APIRouter, Header, Request
from pydantic import BaseModel, Field

from ...config import get_settings
from ...db import session_scope
from ...erp import READONLY_WARNING
from ...erp import connector as conn_mod
from ...erp.connector import ErpError, error_response
from ...erp.models import ErpConnection, utcnow

router = APIRouter(prefix="/api/erp", tags=["erp"])


class ConnectionIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    kind: Literal["sql", "rest", "mock"] = "sql"
    url: str = Field(min_length=1)
    allowed_tables: list[str] = Field(default_factory=list)
    token: str | None = None
    openapi_url: str | None = None
    tools: list[dict] | None = None
    timeout_s: float | None = None


class ConnectionPatch(BaseModel):
    name: str | None = None
    url: str | None = None
    allowed_tables: list[str] | None = None
    token: str | None = None
    openapi_url: str | None = None
    tools: list[dict] | None = None
    timeout_s: float | None = None


class QueryIn(BaseModel):
    sql: str
    max_rows: int = Field(default=200, ge=1, le=500)
    timeout_s: float = Field(default=15, gt=0, le=120)


class ToolCallIn(BaseModel):
    name: str
    args: dict[str, Any] = Field(default_factory=dict)


def _slug(name: str) -> str:
    s = name.translate(str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU"))
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return (s or "baglanti")[:24]


def _user(x_user: str | None) -> str:
    return (x_user or "yonetici")[:100]


def _options(body: ConnectionIn | ConnectionPatch, base: dict | None = None) -> dict:
    opts = dict(base or {})
    for k in ("openapi_url", "tools", "timeout_s"):
        v = getattr(body, k)
        if v is not None:
            opts[k] = v
    return opts


def _create_row(body: ConnectionIn) -> dict:
    tables = [t.strip() for t in body.allowed_tables if t.strip()]
    # bağlayıcıyı kurmayı dene: geçersiz URL / eksik sürücü kayıttan önce yakalanır
    test_conn = conn_mod.build_connector(body.kind, body.url, tables, body.token, _options(body))
    test_conn.close()
    with session_scope() as s:
        base = _slug(body.name)
        cid, n = base, 2
        reserved = {conn_mod.ENV_SQL_ID, conn_mod.ENV_REST_ID}
        while cid in reserved or s.get(ErpConnection, cid) is not None:
            cid = f"{base}-{n}"
            n += 1
        row = ErpConnection(
            id=cid,
            name=body.name,
            kind=body.kind,
            url_encrypted=conn_mod.encrypt_secret(body.url),
            url_masked=conn_mod.mask_url(body.url),
            secret_encrypted=conn_mod.encrypt_secret(body.token),
            allowed_tables_json=json.dumps(tables, ensure_ascii=False),
            options_json=json.dumps(_options(body), ensure_ascii=False),
        )
        s.add(row)
        s.flush()
        return conn_mod.connection_public(row)


def _get_row_or_404(s, cid: str) -> ErpConnection:
    if cid in (conn_mod.ENV_SQL_ID, conn_mod.ENV_REST_ID):
        raise ErpError(
            "env_connection",
            "Ortam değişkeninden gelen bağlantı arayüzden değiştirilemez.",
            "AIP_ERP_* değişkenlerini düzenleyin.",
            409,
        )
    row = s.get(ErpConnection, cid)
    if row is None:
        raise ErpError("connection_not_found", f"ERP bağlantısı bulunamadı: '{cid}'", None, 404)
    return row


@router.get("/connections")
def list_connections():
    try:
        return {"items": conn_mod.list_connections(), "warning": READONLY_WARNING}
    except ErpError as e:
        return error_response(e)


@router.post("/connections", status_code=201)
def create_connection(body: ConnectionIn):
    try:
        return _create_row(body)
    except ErpError as e:
        return error_response(e)


@router.post("/connections/demo", status_code=201)
def create_demo_connection():
    """Örnek ERP veritabanını data_dir altında oluşturur ve 'mock' bağlantısı olarak kaydeder."""
    from ...erp.mock_erp import MOCK_TABLES, create_mock_erp

    path = get_settings().data_dir / "ornek_erp.db"
    with session_scope() as s:
        existing = s.get(ErpConnection, "ornek-erp")
        if existing is not None:
            return conn_mod.connection_public(existing)
    url = create_mock_erp(path, overwrite=not path.exists())
    try:
        return _create_row(ConnectionIn(name="Örnek ERP", kind="mock", url=url, allowed_tables=MOCK_TABLES))
    except ErpError as e:
        return error_response(e)


@router.get("/connections/{cid}")
def get_connection(cid: str):
    for c in conn_mod.list_connections():
        if c["id"] == cid:
            return c
    return error_response(ErpError("connection_not_found", f"ERP bağlantısı bulunamadı: '{cid}'", None, 404))


@router.patch("/connections/{cid}")
def update_connection(cid: str, body: ConnectionPatch):
    try:
        with session_scope() as s:
            row = _get_row_or_404(s, cid)
            if body.name is not None:
                row.name = body.name
            if body.url is not None:
                row.url_encrypted = conn_mod.encrypt_secret(body.url)
                row.url_masked = conn_mod.mask_url(body.url)
            if body.allowed_tables is not None:
                row.allowed_tables_json = json.dumps(
                    [t.strip() for t in body.allowed_tables if t.strip()], ensure_ascii=False
                )
            if body.token is not None:
                row.secret_encrypted = conn_mod.encrypt_secret(body.token)
            row.options_json = json.dumps(
                _options(body, json.loads(row.options_json or "{}")), ensure_ascii=False
            )
            s.flush()
            out = conn_mod.connection_public(row)
        conn_mod.invalidate_connector(cid)
        return out
    except ErpError as e:
        return error_response(e)


@router.delete("/connections/{cid}")
def delete_connection(cid: str):
    try:
        with session_scope() as s:
            s.delete(_get_row_or_404(s, cid))
        conn_mod.invalidate_connector(cid)
        return {"deleted": cid}
    except ErpError as e:
        return error_response(e)


@router.post("/connections/{cid}/test")
def test_connection(cid: str):
    try:
        result = conn_mod.get_connector(cid).test()
    except ErpError as e:
        result = {"ok": False, "message": e.message, "hint": e.hint}
        if e.code == "connection_not_found":
            return error_response(e)
    with session_scope() as s:
        row = s.get(ErpConnection, cid)
        if row is not None:
            row.last_test_at = utcnow()
            row.last_test_ok = bool(result.get("ok"))
            row.last_test_message = str(result.get("message", ""))[:500]
    return result


@router.get("/connections/{cid}/schema")
def connection_schema(cid: str):
    try:
        return {"connection_id": cid, "summary": conn_mod.get_schema_summary(cid)}
    except ErpError as e:
        return error_response(e)


@router.post("/connections/{cid}/query")
def connection_query(cid: str, body: QueryIn):
    try:
        return conn_mod.run_readonly(cid, body.sql, timeout_s=body.timeout_s, max_rows=body.max_rows)
    except ErpError as e:
        return error_response(e)


@router.get("/tools")
def list_tools(include_modules: bool = True, installed_only: bool = False):
    from ...erp.tools import all_tools

    try:
        return {"items": all_tools(include_modules=include_modules, installed_only=installed_only)}
    except ErpError as e:
        return error_response(e)


@router.post("/tools/call")
async def call_tool(body: ToolCallIn, x_user: str | None = Header(default=None, alias="X-AIP-User")):
    """Okuma aracını çalıştırır; yazma aracını onay kuyruğuna alır (asla doğrudan yazmaz)."""
    from ...erp.tools import call_tool as _call

    try:
        return await _call(body.name, body.args, requested_by=_user(x_user))
    except ErpError as e:
        return error_response(e)


@router.get("/webhooks")
def webhook_info(request: Request, limit: int = 50):
    from ...erp.webhooks import list_events, load_routes

    base = str(request.base_url).rstrip("/")
    return {
        "url_template": f"{base}/api/erp/webhooks/{{source}}",
        "secret_configured": bool(get_settings().erp_webhook_secret),
        "signature_header": "X-Signature: sha256=<HMAC-SHA256(sır, ham gövde) hex>",
        "routes": load_routes(),
        "events": list_events(limit=limit),
    }


@router.post("/webhooks/{source}")
async def receive_webhook(source: str, request: Request, x_signature: str | None = Header(default=None)):
    from ...erp.webhooks import handle_webhook

    if not re.fullmatch(r"[A-Za-z0-9_\-\.]{1,100}", source):
        return error_response(
            ErpError("bad_source", "Geçersiz kaynak adı.", "Harf, rakam, '-', '_' ve '.' kullanın.")
        )
    body = await request.body()
    try:
        return await handle_webhook(source, body, x_signature)
    except ErpError as e:
        return error_response(e)
