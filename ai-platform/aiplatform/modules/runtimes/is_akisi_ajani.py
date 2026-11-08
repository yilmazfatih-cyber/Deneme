"""N29 İş Akışı Ajanı — araç çağıran döngü (ERP okuma araçları serbest, yazma araçları insan onayına).

Araçlar: gövdedeki `tools` (OpenAI function şeması) + ERP araç kataloğu (`aiplatform.erp.tools.all_tools`,
yoksa kendi sunucusunun `GET /api/erp/tools` uç noktası). Okuma araçları çalıştırılır; `human_approval`
taşıyan araçlar onay kuyruğuna alınır ve `pending_approvals` listesinde döner.
"""

from __future__ import annotations

import asyncio
import json
import logging

import httpx

from ..base import register
from ._common import (
    ApprovalRequired,
    BaseRuntime,
    ModuleError,
    ModuleNotReady,
    RunContext,
    create_approval,
    get_settings,
    load_prompt,
    note,
    require,
)

log = logging.getLogger("aiplatform.modules.ajan")
MAX_TOOL_RESULT_CHARS = 8000


async def erp_tool_catalog() -> list[dict]:
    try:
        from ...erp.tools import all_tools
    except ImportError:
        all_tools = None
    if all_tools is not None:
        try:
            return await asyncio.to_thread(all_tools)
        except Exception as e:  # noqa: BLE001
            log.warning("ERP araçları alınamadı: %s", e)
            return []
    s = get_settings()
    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get(f"http://{s.host}:{s.port}/api/erp/tools")
            if r.status_code == 200:
                data = r.json()
                return data if isinstance(data, list) else data.get("tools", [])
    except httpx.HTTPError:
        pass
    return []


def _tool_name(t: dict) -> str | None:
    return (t.get("function") or {}).get("name")


@register("is-akisi-ajani")
class IsAkisiAjani(BaseRuntime):
    uses_llm = True

    async def _call_tool(
        self,
        name: str,
        args: dict,
        defs: dict[str, dict],
        ctx: RunContext,
        pending: list[dict],
        local: list[dict],
    ) -> dict:
        if name not in defs:
            return {"error": f"Bilinmeyen araç: {name}"}
        try:
            from ...erp.tools import call_tool
        except ImportError:
            call_tool = None
        if defs[name].get("human_approval"):
            if call_tool is not None:
                try:
                    out = await call_tool(name, args, ctx.user)
                except Exception as e:  # noqa: BLE001 - araç kataloğu dışı yazma aracı
                    aid, persisted = await create_approval(
                        self.module_id,
                        "run",
                        {"task": f"{name} aracı", "tool": name, "arguments": args},
                        ctx.user,
                    )
                    out = {"status": "onay_bekliyor", "approval_id": aid, "note": str(e)[:200]}
                    if not persisted:
                        local.append({"approval_id": aid, "tool": name, "arguments": args})
            else:
                aid, persisted = await create_approval(
                    self.module_id, "run", {"tool": name, "arguments": args}, ctx.user
                )
                out = {"status": "onay_bekliyor", "approval_id": aid}
                if not persisted:
                    local.append({"approval_id": aid, "tool": name, "arguments": args})
            if out.get("approval_id"):
                pending.append({"approval_id": out["approval_id"], "tool": name, "arguments": args})
            return out
        if call_tool is None:
            return {"error": "ERP araç katmanı kurulu değil; araç çalıştırılamadı"}
        try:
            return await call_tool(name, args, ctx.user)
        except Exception as e:  # noqa: BLE001 - hatayı modele geri bildir
            msg = getattr(e, "message", None) or str(e)
            return {"error": msg[:500]}

    async def do_run(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "task")
        max_steps = max(1, min(int(payload.get("max_steps") or 8), 20))
        defs: dict[str, dict] = {}
        for t in list(payload.get("tools") or []) + await erp_tool_catalog():
            name = _tool_name(t)
            if name and name not in defs:
                defs[name] = t
        tools = [{"type": "function", "function": t["function"]} for t in defs.values()]
        messages: list[dict] = [
            {"role": "system", "content": load_prompt("is_akisi_ajani")},
            {"role": "user", "content": str(payload["task"])},
        ]
        steps: list[dict] = []
        pending: list[dict] = []
        local: list[dict] = []
        final = None
        for step in range(1, max_steps + 1):
            res = await self.llm(ctx, messages, tools=tools or None, temperature=0.1)
            if not res.tool_calls:
                final = res.content
                break
            messages.append(
                {
                    "role": "assistant",
                    "content": res.content or "",
                    "tool_calls": [
                        {
                            "id": tc["id"] or f"call_{step}_{i}",
                            "type": "function",
                            "function": {
                                "name": tc["name"],
                                "arguments": json.dumps(tc["arguments"], ensure_ascii=False),
                            },
                        }
                        for i, tc in enumerate(res.tool_calls)
                    ],
                }
            )
            for i, tc in enumerate(res.tool_calls):
                out = await self._call_tool(tc["name"], tc["arguments"] or {}, defs, ctx, pending, local)
                steps.append({"step": step, "tool": tc["name"], "arguments": tc["arguments"], "result": out})
                content = json.dumps(out, ensure_ascii=False, default=str)
                if len(content) > MAX_TOOL_RESULT_CHARS:
                    content = content[:MAX_TOOL_RESULT_CHARS] + " …(kısaltıldı)"
                messages.append(
                    {"role": "tool", "tool_call_id": tc["id"] or f"call_{step}_{i}", "content": content}
                )
        if final is None:
            final = (
                "Adım sınırına ulaşıldı; görev tamamlanamadı. Daha dar bir görev tanımıyla yeniden deneyin."
            )
        note(ctx, steps=len(steps), tools_available=len(tools))
        if local:  # onay kuyruğu (erp paketi) yok: kayıt kalıcı değil, istemciye 202 ile bildirilir
            raise ApprovalRequired(
                local[0]["approval_id"], "Yazma işlemi insan onayı bekliyor (onay kuyruğu kurulu değil)"
            )
        return {"steps": steps, "result": final, "pending_approvals": pending}

    async def do_approve(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "approval_id", "decision")
        if payload["decision"] not in ("approve", "reject"):
            raise ModuleError("'decision' 'approve' veya 'reject' olmalı")
        try:
            from ...erp.approvals import adecide
        except ImportError as e:
            raise ModuleNotReady("Onay kuyruğu kurulu değil; POST /api/approvals/{id}/decide kullanın") from e
        try:
            return await adecide(
                str(payload["approval_id"]), payload["decision"], ctx.user, payload.get("note")
            )
        except Exception as e:  # ErpError → kullanıcıya gösterilebilir
            raise ModuleError(getattr(e, "message", None) or str(e)) from e
