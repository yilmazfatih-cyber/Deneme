"""ERP REST API bağlayıcısı.

OpenAPI 3 belgesi verilirse araçlar ondan üretilir: GET uçları okuma araçları, POST/PUT/PATCH/DELETE uçları
yazma araçlarıdır (`human_approval: True`, yalnız onaydan sonra çalışır). Belge yoksa yapılandırmadaki araç listesi
kullanılır: [{"name", "method", "path", "description", "parameters"(JSON Schema)}].

Token `Authorization: Bearer <token>` başlığıyla gönderilir. ERP tarafında bu belirtecin yetkileri, onay kuyruğundan
bağımsız olarak, gereken en dar kapsamla sınırlandırılmalıdır.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote, urljoin

import httpx

from .connector import ApprovalRequiredError, ERPConnector, ErpError, make_tool

READ_METHODS = {"GET"}
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _tool_name(method: str, path: str, operation_id: str | None) -> str:
    raw = operation_id or f"{method.lower()}_{path}"
    name = re.sub(r"[^a-zA-Z0-9_]+", "_", raw).strip("_").lower()
    return (name or method.lower())[:64]


class RESTConnector(ERPConnector):
    kind = "rest"

    def __init__(
        self,
        base_url: str,
        token: str | None = None,
        openapi_url: str | None = None,
        *,
        tools: list[dict] | None = None,
        openapi_doc: dict | None = None,
        timeout_s: float = 20.0,
        transport: httpx.BaseTransport | None = None,
    ):
        if not base_url:
            raise ErpError(
                "bad_url", "REST bağlantısı için temel adres gerekli.", "ör. https://erp.sirket.local/api"
            )
        self.base_url = base_url.rstrip("/") + "/"
        self.openapi_url = openapi_url
        headers = {"Accept": "application/json", "User-Agent": "aiplatform-erp/0.1"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        self.client = httpx.Client(
            base_url=self.base_url, headers=headers, timeout=timeout_s, transport=transport
        )
        self._config_tools = tools or []
        self._openapi_doc = openapi_doc
        self._ops: dict[str, dict] | None = None

    # ------------------------------------------------------------------ araç üretimi
    def _load_openapi(self) -> dict | None:
        if self._openapi_doc is not None:
            return self._openapi_doc
        if not self.openapi_url:
            return None
        url = (
            self.openapi_url
            if re.match(r"^https?://", self.openapi_url)
            else urljoin(self.base_url, self.openapi_url.lstrip("/"))
        )
        try:
            r = self.client.get(url)
            r.raise_for_status()
            self._openapi_doc = r.json()
        except (httpx.HTTPError, ValueError) as e:
            raise ErpError(
                "openapi_unreachable",
                f"OpenAPI belgesi okunamadı: {e}",
                "openapi_url adresini ve belirteci kontrol edin.",
                502,
            ) from e
        return self._openapi_doc

    @staticmethod
    def _resolve(doc: dict, schema: dict | None, depth: int = 0) -> dict:
        """Yerel $ref'leri (#/components/...) çözer; döngülere karşı derinlik sınırlı."""
        if not isinstance(schema, dict) or depth > 8:
            return schema or {}
        if "$ref" in schema and isinstance(schema["$ref"], str) and schema["$ref"].startswith("#/"):
            node: Any = doc
            for part in schema["$ref"][2:].split("/"):
                node = node.get(part, {}) if isinstance(node, dict) else {}
            return RESTConnector._resolve(doc, node, depth + 1)
        out = {}
        for k, v in schema.items():
            if isinstance(v, dict):
                out[k] = RESTConnector._resolve(doc, v, depth + 1)
            elif isinstance(v, list):
                out[k] = [RESTConnector._resolve(doc, i, depth + 1) if isinstance(i, dict) else i for i in v]
            else:
                out[k] = v
        return out

    def _build_ops(self) -> dict[str, dict]:
        if self._ops is not None:
            return self._ops
        ops: dict[str, dict] = {}
        doc = self._load_openapi()
        if doc:
            for path, item in (doc.get("paths") or {}).items():
                common = item.get("parameters", []) if isinstance(item, dict) else []
                for method, op in (item or {}).items():
                    m = method.upper()
                    if m not in READ_METHODS | WRITE_METHODS or not isinstance(op, dict):
                        continue
                    props: dict[str, Any] = {}
                    required: list[str] = []
                    locations: dict[str, str] = {}
                    for p in list(common) + list(op.get("parameters", [])):
                        p = self._resolve(doc, p)
                        if p.get("in") not in ("path", "query"):
                            continue
                        props[p["name"]] = self._resolve(doc, p.get("schema") or {"type": "string"})
                        if p.get("description"):
                            props[p["name"]] = {**props[p["name"]], "description": p["description"]}
                        locations[p["name"]] = p["in"]
                        if p.get("required") or p.get("in") == "path":
                            required.append(p["name"])
                    body = (
                        ((op.get("requestBody") or {}).get("content") or {}).get("application/json") or {}
                    ).get("schema")
                    if body is not None:
                        props["body"] = self._resolve(doc, body)
                        if (op.get("requestBody") or {}).get("required"):
                            required.append("body")
                    name = _tool_name(m, path, op.get("operationId"))
                    base = name
                    n = 2
                    while name in ops:
                        name = f"{base}_{n}"
                        n += 1
                    params: dict[str, Any] = {"type": "object", "properties": props}
                    if required:
                        params["required"] = sorted(set(required))
                    ops[name] = {
                        "method": m,
                        "path": path,
                        "locations": locations,
                        "description": op.get("summary") or op.get("description") or f"{m} {path}",
                        "parameters": params,
                        "write": m in WRITE_METHODS,
                    }
        else:
            for t in self._config_tools:
                m = str(t.get("method", "GET")).upper()
                ops[t["name"]] = {
                    "method": m,
                    "path": t["path"],
                    "locations": {k: "path" for k in re.findall(r"{(\w+)}", t["path"])},
                    "description": t.get("description") or f"{m} {t['path']}",
                    "parameters": t.get("parameters") or {"type": "object", "properties": {}},
                    "write": m in WRITE_METHODS,
                }
        self._ops = ops
        self.read_only = not any(o["write"] for o in ops.values())
        return ops

    def list_tools(self) -> list[dict]:
        return [
            make_tool(
                name,
                (("[YAZMA — insan onayı gerekir] " if o["write"] else "") + o["description"])[:1000],
                o["parameters"],
                human_approval=o["write"],
            )
            for name, o in self._build_ops().items()
        ]

    # ------------------------------------------------------------------ çağrı
    def _request(self, name: str, args: dict[str, Any]) -> dict:
        op = self._build_ops().get(name)
        if op is None:
            raise ErpError("unknown_tool", f"Bilinmeyen araç: '{name}'", "GET /api/erp/tools", 404)
        args = dict(args or {})
        path = op["path"]
        for key in re.findall(r"{(\w+)}", path):
            if key not in args:
                raise ErpError("bad_args", f"'{key}' yol parametresi gerekli.")
            path = path.replace("{" + key + "}", quote(str(args.pop(key)), safe=""))
        body = args.pop("body", None)
        if (
            op["method"] in WRITE_METHODS
            and body is None
            and args
            and not any(op["locations"].get(k) == "query" for k in args)
        ):
            body, args = args, {}
        query = {k: v for k, v in args.items() if v is not None}
        try:
            r = self.client.request(op["method"], path.lstrip("/"), params=query or None, json=body)
        except httpx.TimeoutException as e:
            raise ErpError("erp_timeout", "ERP API zaman aşımına uğradı.", None, 504) from e
        except httpx.HTTPError as e:
            raise ErpError(
                "erp_unreachable",
                f"ERP API'ye ulaşılamadı: {e}",
                "Temel adresi ve ağ erişimini kontrol edin.",
                502,
            ) from e
        try:
            data: Any = r.json()
        except ValueError:
            data = r.text[:5000]
        if r.status_code >= 400:
            raise ErpError("erp_http_error", f"ERP API {r.status_code} döndü.", str(data)[:300], 502)
        return {"status_code": r.status_code, "data": data}

    def call_tool(self, name: str, args: dict[str, Any]) -> dict:
        op = self._build_ops().get(name)
        if op is not None and op["write"]:
            raise ApprovalRequiredError(name)
        return self._request(name, args)

    def _write(self, name: str, args: dict[str, Any]) -> dict:
        return self._request(name, args)

    def test(self) -> dict:
        try:
            ops = self._build_ops()
        except ErpError as e:
            return {"ok": False, "message": e.message, "capabilities": self.capabilities()}
        if not ops:
            try:
                r = self.client.get("")
                ok = r.status_code < 500
                msg = f"API yanıt verdi ({r.status_code}); araç tanımı yok."
            except httpx.HTTPError as e:
                ok, msg = False, f"Bağlanılamadı: {e}"
            return {"ok": ok, "message": msg, "capabilities": self.capabilities()}
        n_write = sum(1 for o in ops.values() if o["write"])
        return {
            "ok": True,
            "message": f"{len(ops)} araç bulundu ({len(ops) - n_write} okuma, {n_write} onaylı yazma).",
            "capabilities": self.capabilities(),
        }

    def capabilities(self) -> dict:
        try:
            self._build_ops()
        except ErpError:
            pass
        return {
            "kind": self.kind,
            "read_only": self.read_only,
            "base_url": self.base_url,
            "openapi": bool(self._openapi_doc),
        }

    def close(self) -> None:
        self.client.close()
