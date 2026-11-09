"""ERP bağlayıcı sözleşmesi ve bağlantı kayıt defteri.

`ERPConnector` her bağlayıcının uyması gereken soyut sınıftır:
  list_tools()            → OpenAI function şeması listesi; her öğe ayrıca "human_approval": bool taşır
  call_tool(name, args)   → dict; YAZMA araçları burada çalışmaz (ApprovalRequiredError), yalnız
                            onaylanmış bir Approval üzerinden `execute_write` ile çalışır
  read_only               → bağlayıcının hiç yazma aracı yoksa True

Kayıt defteri: bağlantılar `erp_connections` tablosunda (URL ve belirteç şifreli) ve ortam değişkenlerinde
(AIP_ERP_DB_URL → "varsayilan", AIP_ERP_API_BASE_URL → "erp-api") tanımlanır. `get_connector(id)` örneği önbellekler.

Başka paketlerin kullandığı iki kısa yol: `get_schema_summary(id)` ve `run_readonly(id, sql)`.
"""

from __future__ import annotations

import abc
import base64
import json
import logging
import os
import re
import threading
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from ..config import get_settings
from . import READONLY_WARNING

log = logging.getLogger("aiplatform.erp")

ENV_SQL_ID = "varsayilan"
ENV_REST_ID = "erp-api"
ERP_MODULE = "erp"  # Approval.module değeri: bağlayıcı yazma araçları


# --------------------------------------------------------------------------- hatalar


class ErpError(Exception):
    """Kullanıcıya gösterilebilir ERP hatası; router'lar {"error": {code, message, hint}} gövdesine çevirir."""

    status_code = 400

    def __init__(self, code: str, message: str, hint: str | None = None, status_code: int | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.hint = hint
        if status_code is not None:
            self.status_code = status_code

    def to_body(self) -> dict:
        return {"error": {"code": self.code, "message": self.message, "hint": self.hint}}


class SQLRejectedError(ErpError):
    def __init__(self, message: str, hint: str | None = None):
        super().__init__(
            "sql_rejected",
            message,
            hint or "Yalnız izinli tablolardan tek bir SELECT sorgusu çalıştırılabilir.",
        )


class ApprovalRequiredError(ErpError):
    def __init__(self, tool: str):
        super().__init__(
            "approval_required",
            f"'{tool}' ERP'ye yazan bir araçtır; insan onayı olmadan çalıştırılamaz.",
            "Önce onay kuyruğuna alın: POST /api/erp/tools/call veya approvals.create_approval",
            status_code=409,
        )


def error_response(exc: ErpError):
    """FastAPI JSONResponse üretir (içe aktarma burada; bağlayıcılar FastAPI'ye bağımlı değil)."""
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=exc.status_code, content=exc.to_body())


# --------------------------------------------------------------------------- araç şeması


def make_tool(
    name: str, description: str, parameters: dict | None = None, *, human_approval: bool = False
) -> dict:
    """OpenAI function şeması + platformun 'human_approval' bayrağı."""
    params = parameters or {"type": "object", "properties": {}}
    if params.get("type") != "object":
        params = {"type": "object", "properties": {"body": params}}
    return {
        "type": "function",
        "function": {"name": name, "description": description, "parameters": params},
        "human_approval": human_approval,
    }


class ERPConnector(abc.ABC):
    kind: str = "base"
    read_only: bool = True

    @abc.abstractmethod
    def list_tools(self) -> list[dict]:
        """OpenAI function şemaları (her biri "human_approval" taşır)."""

    @abc.abstractmethod
    def call_tool(self, name: str, args: dict[str, Any]) -> dict:
        """Okuma aracını çalıştırır. Yazma aracı için ApprovalRequiredError fırlatır."""

    def capabilities(self) -> dict:
        return {"kind": self.kind, "read_only": self.read_only}

    def test(self) -> dict:
        """Bağlantıyı dener: {"ok": bool, "message": str, ...}"""
        return {"ok": True, "message": "Deneme tanımlı değil"}

    def close(self) -> None:  # pragma: no cover - alt sınıflar
        pass

    # ---- yazma araçları yalnız onaylı Approval ile
    def tool_spec(self, name: str) -> dict | None:
        for t in self.list_tools():
            if t["function"]["name"] == name:
                return t
        return None

    def is_write_tool(self, name: str) -> bool:
        spec = self.tool_spec(name)
        return bool(spec and spec.get("human_approval"))

    def execute_write(self, name: str, args: dict[str, Any], approval_id: str) -> dict:
        """Onaylanmış bir yazma işlemini çalıştırır. Onay kaydı veritabanında doğrulanır."""
        from ..db import session_scope
        from .models import Approval

        with session_scope() as s:
            ap = s.get(Approval, approval_id)
            tool_matches = False
            if ap is not None:
                if ap.module == "erp":
                    tool_matches = ap.action == name
                else:  # katalog modülünün onayı: araç adı payload içinde taşınır
                    try:
                        tool_matches = (json.loads(ap.payload_json or "{}") or {}).get("tool") == name
                    except (TypeError, ValueError):
                        tool_matches = False
            if ap is None or ap.status != "approved" or not tool_matches:
                raise ErpError(
                    "approval_invalid",
                    "Bu yazma işlemi için geçerli bir onay bulunamadı.",
                    "Onay kaydı 'approved' durumunda ve aynı araç adıyla olmalı.",
                    status_code=403,
                )
        if not self.is_write_tool(name):
            raise ErpError("unknown_tool", f"'{name}' bu bağlayıcıda yazma aracı değil.")
        return self._write(name, args)

    def _write(self, name: str, args: dict[str, Any]) -> dict:
        raise ErpError("read_only", "Bu bağlayıcı salt-okunurdur; yazma aracı yok.")


# --------------------------------------------------------------------------- sır şifreleme


def _key_path():
    return get_settings().data_dir / "erp_secret.key"


def _fernet():
    try:
        from cryptography.fernet import Fernet
    except ImportError:
        return None
    p = _key_path()
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(Fernet.generate_key())
        try:
            os.chmod(p, 0o600)
        except OSError as e:  # Windows vb.
            log.debug("anahtar dosyası izinleri ayarlanamadı: %s", e)
    return Fernet(p.read_bytes().strip())


def encrypt_secret(value: str | None) -> str | None:
    if value is None:
        return None
    f = _fernet()
    if f is None:
        log.warning("cryptography kurulu değil: ERP bağlantı sırları şifresiz (base64) saklanıyor")
        return "plain:" + base64.b64encode(value.encode()).decode()
    return "fernet:" + f.encrypt(value.encode()).decode()


def decrypt_secret(value: str | None) -> str | None:
    if value is None:
        return None
    if value.startswith("plain:"):
        return base64.b64decode(value[6:]).decode()
    if value.startswith("fernet:"):
        f = _fernet()
        if f is None:
            raise ErpError(
                "crypto_missing", "Şifreli bağlantı bilgisi açılamadı: cryptography paketi kurulu değil."
            )
        return f.decrypt(value[7:].encode()).decode()
    return value


def mask_url(url: str) -> str:
    """Parolayı ve sorgu dizesindeki belirteçleri gizler."""
    try:
        from sqlalchemy.engine import make_url

        if "://" in url and not url.lower().startswith(("http://", "https://")):
            return make_url(url).render_as_string(hide_password=True)
    except Exception as e:  # noqa: BLE001 - sqlalchemy URL değilse genel yola düş
        log.debug("URL sqlalchemy biçiminde değil: %s", type(e).__name__)
    try:
        parts = urlsplit(url)
        netloc = parts.netloc
        if "@" in netloc:
            userinfo, host = netloc.rsplit("@", 1)
            user = userinfo.split(":", 1)[0]
            netloc = f"{user}:***@{host}"
        query = re.sub(r"(?i)((?:token|key|password|secret|pwd)=)[^&]*", r"\1***", parts.query)
        return urlunsplit((parts.scheme, netloc, parts.path, query, parts.fragment))
    except ValueError:
        return "***"


# --------------------------------------------------------------------------- kayıt defteri

_CACHE: dict[str, ERPConnector] = {}
_LOCK = threading.Lock()


def build_connector(
    kind: str, url: str, allowed_tables: list[str], token: str | None = None, options: dict | None = None
) -> ERPConnector:
    options = options or {}
    if kind == "sql":
        from .sql_readonly import SQLReadOnlyConnector

        return SQLReadOnlyConnector(url, allowed_tables)
    if kind == "mock":
        from .mock_erp import MockERPConnector

        return MockERPConnector(url, allowed_tables or None)
    if kind == "rest":
        from .rest import RESTConnector

        return RESTConnector(
            url,
            token,
            openapi_url=options.get("openapi_url"),
            tools=options.get("tools"),
            timeout_s=float(options.get("timeout_s", 20)),
        )
    raise ErpError("bad_kind", f"Bilinmeyen bağlantı türü: '{kind}'", "Tür 'sql', 'rest' veya 'mock' olmalı.")


def _env_connections() -> dict[str, dict]:
    s = get_settings()
    out: dict[str, dict] = {}
    if s.erp_db_url:
        out[ENV_SQL_ID] = {
            "id": ENV_SQL_ID,
            "name": "ERP veritabanı (ortam değişkeni)",
            "kind": "sql",
            "url": s.erp_db_url,
            "allowed_tables": list(s.erp_allowed_tables),
            "token": None,
            "options": {},
        }
    if s.erp_api_base_url:
        out[ENV_REST_ID] = {
            "id": ENV_REST_ID,
            "name": "ERP REST API (ortam değişkeni)",
            "kind": "rest",
            "url": s.erp_api_base_url,
            "allowed_tables": [],
            "token": s.erp_api_token,
            "options": {},
        }
    return out


def connection_public(row: Any | None = None, env: dict | None = None) -> dict:
    """Bağlantının API'de gösterilecek hâli (URL maskeli, sır yok)."""
    if env is not None:
        return {
            "id": env["id"],
            "name": env["name"],
            "kind": env["kind"],
            "url": mask_url(env["url"]),
            "allowed_tables": env["allowed_tables"],
            "source": "ortam",
            "created_at": None,
            "last_test_at": None,
            "last_test_ok": None,
            "last_test_message": None,
            "read_only": env["kind"] != "mock",
            "warning": READONLY_WARNING if env["kind"] == "sql" else None,
        }
    return {
        "id": row.id,
        "name": row.name,
        "kind": row.kind,
        "url": row.url_masked,
        "allowed_tables": json.loads(row.allowed_tables_json or "[]"),
        "options": {k: v for k, v in json.loads(row.options_json or "{}").items() if k != "tools"},
        "source": "veritabani",
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "last_test_at": row.last_test_at.isoformat() if row.last_test_at else None,
        "last_test_ok": row.last_test_ok,
        "last_test_message": row.last_test_message,
        "read_only": row.kind != "mock",
        "warning": None if row.kind == "mock" else READONLY_WARNING,
    }


def list_connections() -> list[dict]:
    from sqlalchemy import select

    from ..db import session_scope
    from .models import ErpConnection

    out = [connection_public(env=e) for e in _env_connections().values()]
    with session_scope() as s:
        for row in s.scalars(select(ErpConnection).order_by(ErpConnection.created_at)):
            out.append(connection_public(row))
    return out


def _load_definition(connection_id: str) -> dict:
    env = _env_connections()
    if connection_id in env:
        return env[connection_id]
    from ..db import session_scope
    from .models import ErpConnection

    with session_scope() as s:
        row = s.get(ErpConnection, connection_id)
        if row is None:
            raise ErpError(
                "connection_not_found",
                f"ERP bağlantısı bulunamadı: '{connection_id}'",
                "GET /api/erp/connections",
                404,
            )
        return {
            "id": row.id,
            "name": row.name,
            "kind": row.kind,
            "url": decrypt_secret(row.url_encrypted),
            "allowed_tables": json.loads(row.allowed_tables_json or "[]"),
            "token": decrypt_secret(row.secret_encrypted),
            "options": json.loads(row.options_json or "{}"),
        }


def get_connector(connection_id: str) -> ERPConnector:
    with _LOCK:
        if connection_id in _CACHE:
            return _CACHE[connection_id]
    d = _load_definition(connection_id)
    conn = build_connector(d["kind"], d["url"], d["allowed_tables"], d.get("token"), d.get("options"))
    with _LOCK:
        _CACHE.setdefault(connection_id, conn)
        return _CACHE[connection_id]


def invalidate_connector(connection_id: str | None = None) -> None:
    """Bağlantı değişince/silinince önbelleği temizler (None → hepsi)."""
    with _LOCK:
        ids = list(_CACHE) if connection_id is None else [connection_id]
        for i in ids:
            c = _CACHE.pop(i, None)
            if c is not None:
                try:
                    c.close()
                except Exception as e:  # noqa: BLE001
                    log.debug("bağlayıcı kapatılamadı (%s): %s", i, e)


reset_connectors = invalidate_connector


def _sql_connector(connection_id: str):
    from .sql_readonly import SQLReadOnlyConnector

    c = get_connector(connection_id)
    if not isinstance(c, SQLReadOnlyConnector):
        raise ErpError(
            "not_sql",
            f"'{connection_id}' bir SQL bağlantısı değil.",
            "Şema ve sorgu yalnız SQL bağlantılarında çalışır.",
        )
    return c


def get_schema_summary(connection_id: str) -> str:
    """İzinli tabloların CREATE TABLE benzeri özeti + tablo başına 3 örnek satır (kişisel sütunlar '***')."""
    return _sql_connector(connection_id).schema_summary()


def run_readonly(connection_id: str, sql: str, timeout_s: float = 15, max_rows: int = 500) -> dict:
    """Doğrulanmış tek SELECT'i salt-okunur çalıştırır → {"columns", "rows", "row_count", "truncated"}."""
    return _sql_connector(connection_id).run_query(sql, timeout_s=timeout_s, max_rows=max_rows)
