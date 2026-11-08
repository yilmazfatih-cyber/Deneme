"""İş akışı ajanının kullanabileceği araçlar (OpenAI function şeması).

Ad biçimleri:
  ERP bağlantı aracı : "erp_<bağlantı-id>__<araç>"   (ör. erp_ornek-erp__sorgu_calistir)
  Platform modülü    : "<modül-id>__<eylem>"          (ör. finans-hesap__payback)

Her öğe {"type": "function", "function": {...}, "human_approval": bool, "source": {...}} biçimindedir; LLM'e
gönderilmeden önce "human_approval" ve "source" alanları atılabilir (`openai_tools()`).
Yazma araçları (`human_approval=True`) `call_tool` ile çağrıldığında çalışmaz, onay kuyruğuna düşer.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from .connector import ERP_MODULE, ErpError, get_connector, list_connections, make_tool

log = logging.getLogger("aiplatform.erp.tools")

SELF_MODULE = "is-akisi-ajani"  # ajan kendi eylemlerini araç olarak görmez (özyineleme olmasın)


def erp_tool_name(connection_id: str, tool: str) -> str:
    return f"erp_{connection_id}__{tool}"[:64]


def connection_tools() -> list[dict]:
    out: list[dict] = []
    for c in list_connections():
        try:
            tools = get_connector(c["id"]).list_tools()
        except Exception as e:  # noqa: BLE001 - bozuk bağlantı diğerlerini engellemesin
            log.warning("bağlantı araçları alınamadı (%s): %s", c["id"], e)
            continue
        for t in tools:
            fn = t["function"]
            out.append(
                {
                    "type": "function",
                    "function": {
                        "name": erp_tool_name(c["id"], fn["name"]),
                        "description": f"[{c['name']}] {fn['description']}",
                        "parameters": fn["parameters"],
                    },
                    "human_approval": bool(t.get("human_approval")),
                    "source": {"kind": "erp", "connection_id": c["id"], "tool": fn["name"]},
                }
            )
    return out


def module_tools(installed_only: bool = False) -> list[dict]:
    from ..catalog import get_catalog

    installed: set[str] | None = None
    if installed_only:
        try:
            from sqlalchemy import select

            from ..db import session_scope
            from ..installer.models import InstalledModule

            with session_scope() as s:
                installed = {m.module_id for m in s.scalars(select(InstalledModule))}
        except Exception:  # noqa: BLE001 - kurulum paketi yoksa hepsi listelenir
            installed = None
    out = []
    for m in get_catalog().modules.values():
        if m.id == SELF_MODULE or (installed is not None and m.id not in installed):
            continue
        for a in m.actions:
            t = make_tool(
                f"{m.id}__{a.id}"[:64],
                f"[{m.name}] {a.name}: {a.description}",
                dict(a.input_schema) or None,
                human_approval=a.human_approval,
            )
            t["source"] = {"kind": "module", "module": m.id, "action": a.id}
            out.append(t)
    return out


def all_tools(include_modules: bool = True, installed_only: bool = False) -> list[dict]:
    """Kayıtlı bağlantıların araçları + katalog modüllerinin eylemleri."""
    tools = connection_tools()
    if include_modules:
        tools += module_tools(installed_only=installed_only)
    return tools


def openai_tools(tools: list[dict] | None = None) -> list[dict]:
    """LLM'e gönderilecek saf OpenAI biçimi (platform alanları atılır)."""
    return [
        {"type": "function", "function": t["function"]} for t in (tools if tools is not None else all_tools())
    ]


def resolve(name: str) -> dict:
    for t in all_tools():
        if t["function"]["name"] == name:
            return t
    raise ErpError("unknown_tool", f"Bilinmeyen araç: '{name}'", "GET /api/erp/tools", 404)


async def call_tool(name: str, args: dict[str, Any] | None, requested_by: str = "anonim") -> dict:
    """Aracı çağırır. Okuma → {"status": "ok", "result"}; yazma → {"status": "onay_bekliyor", "approval_id"}."""
    from .approvals import create_approval

    args = args or {}
    t = await asyncio.to_thread(resolve, name)
    src = t["source"]
    if t["human_approval"]:
        if src["kind"] == "erp":
            aid = await asyncio.to_thread(
                create_approval,
                ERP_MODULE,
                src["tool"],
                {"connection_id": src["connection_id"], "args": args},
                requested_by,
            )
        else:
            aid = await asyncio.to_thread(create_approval, src["module"], src["action"], args, requested_by)
        return {
            "status": "onay_bekliyor",
            "approval_id": aid,
            "message": "Yazma işlemi insan onayına gönderildi.",
        }
    if src["kind"] == "erp":
        result = await asyncio.to_thread(get_connector(src["connection_id"]).call_tool, src["tool"], args)
        return {"status": "ok", "result": result}
    from ..modules.base import ModuleError, RunContext, get_runtime

    try:
        result = await get_runtime(src["module"]).run(src["action"], args, RunContext(user=requested_by))
    except ModuleError as e:
        raise ErpError(
            "module_error", str(e), f"Modül kurulu mu? POST /api/modules/{src['module']}/install", 409
        ) from e
    return {"status": "ok", "result": result}
